-- ============================================================================
-- Recruitment follow-ups:
--   - Only E-Board may post to the deliberation discussion. Brothers can
--     still read it (rush_comments_select is unchanged).
--   - Cap uploads in the rush-applications bucket at 10 MB per file. The
--     form enforces the same limit client-side so applicants get a clear
--     message before the upload starts; this is the backstop.
-- ============================================================================

drop policy rush_comments_insert_own on rush_application_comments;
create policy rush_comments_insert_eboard on rush_application_comments
  for insert
  to authenticated
  with check (member_id = auth.uid() and get_my_role() = 'eboard');

update storage.buckets
set file_size_limit = 10485760
where id = 'rush-applications';
