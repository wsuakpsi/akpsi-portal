-- ============================================================================
-- Recruitment follow-ups:
--   1. Soft-delete applications (hidden from everyone via RLS, row kept in
--      the DB). Deleting an application is also how E-Board manually lets
--      someone reapply — see (2).
--   2. One application per email, enforced by a partial unique index that
--      only counts non-deleted rows. A duplicate insert fails with 23505;
--      the frontend turns that into a friendly message. Deleting the old
--      row frees the email up for a fresh submission.
--   3. Lock voting once a decision is set — no insert/update/delete on
--      rush_application_votes once rush_application_decisions.decision is
--      no longer 'pending'.
--   4. Anonymous voting, tallies restricted to VP Membership / VP Internal /
--      Secretary. `rush_votes_select` goes back to strictly own-row (the
--      0028 "or eboard" exception is removed) — nobody can read another
--      member's raw vote row via the table. Aggregate tallies (counts only,
--      no member_id) come from two SECURITY DEFINER RPCs gated by the new
--      is_recruitment_results_viewer() check.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Soft delete
-- ---------------------------------------------------------------------------

alter table rush_applications add column deleted_at timestamptz;
alter table rush_applications add column deleted_by uuid references members (id);

create policy rush_applications_update_eboard on rush_applications
  for update
  to authenticated
  using (get_my_role() = 'eboard')
  with check (get_my_role() = 'eboard');

drop policy rush_applications_select on rush_applications;
create policy rush_applications_select on rush_applications
  for select
  to authenticated
  using (deleted_at is null);

-- ---------------------------------------------------------------------------
-- 2. One application per email (non-deleted rows only)
-- ---------------------------------------------------------------------------

create unique index rush_applications_email_unique_idx
  on rush_applications (lower(wayne_state_email))
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 3. Lock voting once a decision is marked
-- ---------------------------------------------------------------------------

create or replace function check_application_not_decided()
returns trigger
language plpgsql
as $$
declare
  current_decision application_decision;
begin
  select decision into current_decision
  from rush_application_decisions
  where application_id = coalesce(new.application_id, old.application_id);

  if current_decision is not null and current_decision <> 'pending' then
    raise exception 'Voting is closed for this applicant.';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger rush_votes_lock_after_decision
  before insert or update or delete on rush_application_votes
  for each row execute function check_application_not_decided();

-- ---------------------------------------------------------------------------
-- 4. Anonymous voting — tallies only, restricted to 3 named positions
-- ---------------------------------------------------------------------------

create or replace function get_my_eboard_position()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select eboard_position from members where id = auth.uid();
$$;

grant execute on function get_my_eboard_position() to authenticated;

create or replace function is_recruitment_results_viewer()
returns boolean
language sql
stable
set search_path = public
as $$
  select get_my_role() = 'eboard'
    and get_my_eboard_position() in ('VP Membership', 'VP Internal', 'Secretary');
$$;

grant execute on function is_recruitment_results_viewer() to authenticated;

drop policy rush_votes_select on rush_application_votes;
create policy rush_votes_select on rush_application_votes
  for select
  to authenticated
  using (member_id = auth.uid());

create or replace function get_vote_tally(p_application_id uuid)
returns table (vote application_vote_value, votes_count bigint)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not is_recruitment_results_viewer() then
    raise exception 'Not authorized to view vote results.';
  end if;

  return query
    select v.vote, count(*)
    from rush_application_votes v
    where v.application_id = p_application_id
    group by v.vote;
end;
$$;

grant execute on function get_vote_tally(uuid) to authenticated;

create or replace function get_all_vote_tallies()
returns table (application_id uuid, vote application_vote_value, votes_count bigint)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not is_recruitment_results_viewer() then
    raise exception 'Not authorized to view vote results.';
  end if;

  return query
    select v.application_id, v.vote, count(*)
    from rush_application_votes v
    group by v.application_id, v.vote;
end;
$$;

grant execute on function get_all_vote_tallies() to authenticated;
