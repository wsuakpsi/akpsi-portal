-- ============================================================================
-- AKPsi Beta Omicron Chapter Management Platform — Row Level Security
-- Run in the Supabase SQL editor after 0001_init_schema.sql.
--
-- Access tiers:
--   brother      authenticated user, members.role = 'brother'
--   eboard       authenticated user, members.role = 'eboard'
--   service_role Lambda's service key — bypasses RLS entirely, no policy needed
-- ============================================================================

-- ============================================================================
-- Helper: get_my_role()
-- SECURITY DEFINER so it can read members regardless of the caller's own RLS
-- policies on that table (avoids recursive-policy evaluation on members).
-- ============================================================================

create or replace function get_my_role()
returns member_role
language sql
security definer
stable
set search_path = public
as $$
  select role from members where id = auth.uid();
$$;

grant execute on function get_my_role() to authenticated;

-- ============================================================================
-- 1. members
-- ============================================================================

alter table members enable row level security;

create policy members_select on members
  for select
  to authenticated
  using (id = auth.uid() or get_my_role() = 'eboard');

create policy members_update_eboard on members
  for update
  to authenticated
  using (get_my_role() = 'eboard')
  with check (get_my_role() = 'eboard');

-- INSERT: service_role only (manual account creation by VP Tech) — no policy
-- for `authenticated`, so all inserts from that role are denied by default.
-- DELETE: never — no policy, and 0001 also adds a trigger that hard-blocks it.

-- ============================================================================
-- 2. semesters
-- ============================================================================

alter table semesters enable row level security;

create policy semesters_select on semesters
  for select
  to authenticated
  using (true);

create policy semesters_insert_eboard on semesters
  for insert
  to authenticated
  with check (get_my_role() = 'eboard');

create policy semesters_update_eboard on semesters
  for update
  to authenticated
  using (get_my_role() = 'eboard')
  with check (get_my_role() = 'eboard');

-- ============================================================================
-- 3. lower_threshold_applications
-- ============================================================================

alter table lower_threshold_applications enable row level security;

create policy lta_select on lower_threshold_applications
  for select
  to authenticated
  using (member_id = auth.uid() or get_my_role() = 'eboard');

create policy lta_insert_own on lower_threshold_applications
  for insert
  to authenticated
  with check (member_id = auth.uid());

create policy lta_update_eboard on lower_threshold_applications
  for update
  to authenticated
  using (get_my_role() = 'eboard')
  with check (get_my_role() = 'eboard');

-- ============================================================================
-- 4. events
-- ============================================================================

alter table events enable row level security;

create policy events_select on events
  for select
  to authenticated
  using (true);

create policy events_insert_eboard on events
  for insert
  to authenticated
  with check (get_my_role() = 'eboard');

create policy events_update_eboard on events
  for update
  to authenticated
  using (get_my_role() = 'eboard')
  with check (get_my_role() = 'eboard');

-- No DELETE ever — cancel via status = 'cancelled' instead.

-- ============================================================================
-- 5. rsvps
-- ============================================================================

alter table rsvps enable row level security;

create policy rsvps_select on rsvps
  for select
  to authenticated
  using (member_id = auth.uid() or get_my_role() = 'eboard');

create policy rsvps_insert_own on rsvps
  for insert
  to authenticated
  with check (member_id = auth.uid());

create policy rsvps_update_own on rsvps
  for update
  to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

-- ============================================================================
-- 6. attendance (Lambda-only writes)
-- ============================================================================

alter table attendance enable row level security;

create policy attendance_select on attendance
  for select
  to authenticated
  using (member_id = auth.uid() or get_my_role() = 'eboard');

-- INSERT: service_role only. No UPDATE/DELETE policy for anyone.

-- ============================================================================
-- 7. points_ledger (append-only, Lambda-only writes)
-- ============================================================================

alter table points_ledger enable row level security;

create policy points_ledger_select on points_ledger
  for select
  to authenticated
  using (member_id = auth.uid() or get_my_role() = 'eboard');

-- INSERT: service_role only. No UPDATE/DELETE policy for anyone — and 0001's
-- prevent_update()/prevent_delete() triggers block it even for service_role.

-- ============================================================================
-- 8. meeting_attendance (Lambda-only inserts, eboard can correct)
-- ============================================================================

alter table meeting_attendance enable row level security;

create policy meeting_attendance_select on meeting_attendance
  for select
  to authenticated
  using (member_id = auth.uid() or get_my_role() = 'eboard');

create policy meeting_attendance_update_eboard on meeting_attendance
  for update
  to authenticated
  using (get_my_role() = 'eboard')
  with check (get_my_role() = 'eboard');

-- INSERT: service_role only. No DELETE policy for anyone.

-- ============================================================================
-- 9. missing_meeting_forms
-- ============================================================================

alter table missing_meeting_forms enable row level security;

create policy mmf_select on missing_meeting_forms
  for select
  to authenticated
  using (member_id = auth.uid() or get_my_role() = 'eboard');

create policy mmf_insert_own on missing_meeting_forms
  for insert
  to authenticated
  with check (member_id = auth.uid());

create policy mmf_update_eboard on missing_meeting_forms
  for update
  to authenticated
  using (get_my_role() = 'eboard')
  with check (get_my_role() = 'eboard');

-- ============================================================================
-- 10. notifications (Lambda-only inserts)
-- ============================================================================

alter table notifications enable row level security;

create policy notifications_select on notifications
  for select
  to authenticated
  using (member_id = auth.uid() or get_my_role() = 'eboard');

create policy notifications_update_own on notifications
  for update
  to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

-- INSERT: service_role only. No DELETE policy for anyone.
