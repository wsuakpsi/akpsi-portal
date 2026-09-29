-- ============================================================================
-- Recruitment: (1) reset-all-votes action and (2) Maybe on/off switch, both
-- restricted to VP Membership / VP Internal / Secretary
-- (is_recruitment_results_viewer(), 0032).
--
-- Reset deletes every vote for every applicant, including applicants who
-- already have a decision (the 0032 lock trigger normally blocks that, so the
-- reset sets a transaction-local bypass flag). Decisions themselves are NOT
-- touched — those applicants stay closed to voting.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Lock trigger: honour the transaction-local bypass used by the reset
-- ---------------------------------------------------------------------------

create or replace function check_application_not_decided()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_decision application_decision;
begin
  if current_setting('app.bypass_vote_lock', true) = 'on' then
    return coalesce(new, old);
  end if;

  select decision into current_decision
  from rush_application_decisions
  where application_id = coalesce(new.application_id, old.application_id);

  if current_decision is not null and current_decision <> 'pending' then
    raise exception 'Voting is closed for this applicant.';
  end if;

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. reset_all_votes()
-- ---------------------------------------------------------------------------

create or replace function reset_all_votes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if not is_recruitment_results_viewer() then
    raise exception 'Only VP Membership, VP Internal, or Secretary can reset votes.';
  end if;

  perform set_config('app.bypass_vote_lock', 'on', true);
  -- WHERE true: some Supabase configs reject a bare DELETE.
  delete from rush_application_votes where true;
  get diagnostics deleted_count = row_count;
  perform set_config('app.bypass_vote_lock', 'off', true);

  return deleted_count;
end;
$$;

grant execute on function reset_all_votes() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Maybe switch — single-row settings table
-- ---------------------------------------------------------------------------

create table recruitment_settings (
  id boolean primary key default true check (id),
  maybe_enabled boolean not null default true,
  updated_by uuid references members (id),
  updated_at timestamptz not null default now()
);

insert into recruitment_settings (id, maybe_enabled) values (true, false);

alter table recruitment_settings enable row level security;

create policy recruitment_settings_select on recruitment_settings
  for select
  to authenticated
  using (true);
-- No insert/update/delete policies: writes only via set_maybe_enabled().

create or replace function set_maybe_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_recruitment_results_viewer() then
    raise exception 'Only VP Membership, VP Internal, or Secretary can change this setting.';
  end if;

  update recruitment_settings
  set maybe_enabled = p_enabled, updated_by = auth.uid(), updated_at = now()
  where id;
end;
$$;

grant execute on function set_maybe_enabled(boolean) to authenticated;

-- Server-side enforcement: no new Maybe votes while disabled.
create or replace function check_maybe_vote_allowed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.vote = 'maybe'
     and not (select maybe_enabled from recruitment_settings where id) then
    raise exception 'Maybe votes are currently disabled.';
  end if;
  return new;
end;
$$;

create trigger rush_votes_maybe_gate
  before insert or update on rush_application_votes
  for each row execute function check_maybe_vote_allowed();

alter publication supabase_realtime add table recruitment_settings;

-- ---------------------------------------------------------------------------
-- 4. Tallies: hide Maybe counts while disabled (existing Maybe rows are kept,
--    so re-enabling restores them)
-- ---------------------------------------------------------------------------
-- Handled client-side; counts are only ever returned to the three viewer roles.

-- ---------------------------------------------------------------------------
-- 5. One-time reset (this migration is the "reset all votes now" step)
-- ---------------------------------------------------------------------------

select set_config('app.bypass_vote_lock', 'on', true);
delete from rush_application_votes where true;
select set_config('app.bypass_vote_lock', 'off', true);
