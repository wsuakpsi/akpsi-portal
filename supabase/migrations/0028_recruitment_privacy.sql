-- ============================================================================
-- Recruitment privacy fix: brothers may vote and comment, but must not be
-- able to see the final decision or the vote tally/who-voted-what — only
-- E-Board should see those. `rush_applications_select` and
-- `rush_votes_select` (0026) both used `to authenticated using (true)`,
-- which can't be narrowed per-column by role (brothers and E-Board are the
-- same Postgres role, `authenticated` — RLS only filters rows, not
-- columns). Fix:
--   - Move decision/decided_by/decided_at into their own table, so it's a
--     row-level (not column-level) problem: `rush_application_decisions`
--     with SELECT restricted to E-Board.
--   - Votes are already one row per (application, member) — tighten
--     `rush_votes_select` so a brother only ever gets back their own vote
--     row, never anyone else's, so no tally can be reconstructed
--     client-side. E-Board still sees every vote.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. rush_application_decisions
-- ---------------------------------------------------------------------------

create table rush_application_decisions (
  application_id uuid primary key references rush_applications (id) on delete cascade,
  decision application_decision not null default 'pending',
  decided_by uuid references members (id),
  decided_at timestamptz,
  check (
    (decision = 'pending' and decided_by is null and decided_at is null)
    or (decision <> 'pending' and decided_by is not null and decided_at is not null)
  )
);

insert into rush_application_decisions (application_id, decision, decided_by, decided_at)
select id, decision, decided_by, decided_at from rush_applications;

alter table rush_application_decisions enable row level security;

create policy rush_decisions_select_eboard on rush_application_decisions
  for select
  to authenticated
  using (get_my_role() = 'eboard');

create policy rush_decisions_insert_eboard on rush_application_decisions
  for insert
  to authenticated
  with check (get_my_role() = 'eboard');

create policy rush_decisions_update_eboard on rush_application_decisions
  for update
  to authenticated
  using (get_my_role() = 'eboard')
  with check (get_my_role() = 'eboard');

-- ---------------------------------------------------------------------------
-- 2. Drop decision/decided_by/decided_at from rush_applications — the old
-- public-insert policy and check constraint both reference them, so those
-- go first.
-- ---------------------------------------------------------------------------

drop policy rush_applications_public_insert on rush_applications;
create policy rush_applications_public_insert on rush_applications
  for insert
  to anon
  with check (true);

drop policy rush_applications_update_eboard on rush_applications;

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'rush_applications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%decided_by%'
  loop
    execute format('alter table rush_applications drop constraint %I', con.conname);
  end loop;
end $$;

drop index if exists rush_applications_decision_idx;

alter table rush_applications drop column decision;
alter table rush_applications drop column decided_by;
alter table rush_applications drop column decided_at;

-- ---------------------------------------------------------------------------
-- 3. Tighten vote visibility — a brother only ever sees their own vote row.
-- ---------------------------------------------------------------------------

drop policy rush_votes_select on rush_application_votes;
create policy rush_votes_select on rush_application_votes
  for select
  to authenticated
  using (member_id = auth.uid() or get_my_role() = 'eboard');
