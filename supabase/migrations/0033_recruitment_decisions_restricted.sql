-- ============================================================================
-- Restrict rush_application_decisions the same way votes were restricted in
-- 0032 — only VP Membership / VP Internal / Secretary may see OR set a
-- decision (Accept/Reject/Waitlist). Previously any E-Board member could
-- both see and mark decisions (0028_recruitment_privacy.sql:38-52).
-- ============================================================================

drop policy rush_decisions_select_eboard on rush_application_decisions;
create policy rush_decisions_select_results_viewer on rush_application_decisions
  for select
  to authenticated
  using (is_recruitment_results_viewer());

drop policy rush_decisions_insert_eboard on rush_application_decisions;
create policy rush_decisions_insert_results_viewer on rush_application_decisions
  for insert
  to authenticated
  with check (is_recruitment_results_viewer());

drop policy rush_decisions_update_eboard on rush_application_decisions;
create policy rush_decisions_update_results_viewer on rush_application_decisions
  for update
  to authenticated
  using (is_recruitment_results_viewer())
  with check (is_recruitment_results_viewer());
