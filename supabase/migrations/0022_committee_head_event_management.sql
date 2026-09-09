-- ============================================================================
-- Committee Head event management: promotes Committee Heads from "insert
-- only" (0019) to full parity with E-Board on the event detail page —
-- editing an event, viewing its RSVPs/attendance, and searching members for
-- manual check-in. These are additive permissive policies (Postgres ORs
-- multiple permissive policies for the same command together), so the
-- existing *_eboard policies are untouched.
-- ============================================================================

create policy events_update_committee_head on events
  for update
  to authenticated
  using (get_my_role() = 'committee_head')
  with check (get_my_role() = 'committee_head');

create policy rsvps_select_committee_head on rsvps
  for select
  to authenticated
  using (get_my_role() = 'committee_head');

create policy attendance_select_committee_head on attendance
  for select
  to authenticated
  using (get_my_role() = 'committee_head');

-- Needed for the manual check-in search on the event detail page, which
-- looks members up by name regardless of who they are.
create policy members_select_committee_head on members
  for select
  to authenticated
  using (get_my_role() = 'committee_head');
