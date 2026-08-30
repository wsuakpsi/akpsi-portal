-- ============================================================================
-- Committee Head access: allowed into the eboard portal, but the only write
-- they get is inserting new events. No select/update grants beyond what
-- every authenticated user already has (events_select and semesters_select
-- are both `using (true)`), and no eboard_position — the members_eboard_
-- position_matches_role constraint from 0004 only fires for role = 'eboard'.
-- ============================================================================

create policy events_insert_committee_head on events
  for insert
  to authenticated
  with check (get_my_role() = 'committee_head');
