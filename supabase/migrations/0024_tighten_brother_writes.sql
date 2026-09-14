-- ============================================================================
-- Tighten brother-side writes. Requires 0023 (E-Board insert policies) to be
-- live first, otherwise Brother Detail's "Move to lower threshold" breaks.
--
-- 1. missing_meeting_forms / lower_threshold_applications self-insert: the
--    old policies only checked member_id = auth.uid(), so a brother could
--    POST a row with status = 'approved' and themselves as reviewer and skip
--    E-Board review entirely. Brothers may now only create pending,
--    unreviewed rows — which is all the app ever sends.
--
-- 2. rsvps self-update: the old policy allowed any column, so a brother
--    could flip their own RSVP to 'cancelled' directly and bypass the
--    late-cancel penalty Lambda (and the no-show sweep, which only looks at
--    'going'). Brothers may now only set 'going' — RSVP / re-RSVP still work,
--    cancelling stays on the Lambda (service role, unaffected by RLS).
--
-- 3. points_ledger uniqueness for the two rows completeEvent posts per
--    (event, member). completeEvent now flips the event to 'completed' LAST
--    (so a mid-run failure can't strand a completed event with no points),
--    and these indexes are what stop two overlapping completions from
--    double-posting. Verified against live data: no existing duplicates.
-- ============================================================================

drop policy mmf_insert_own on missing_meeting_forms;
create policy mmf_insert_own on missing_meeting_forms
  for insert
  to authenticated
  with check (
    member_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

drop policy lta_insert_own on lower_threshold_applications;
create policy lta_insert_own on lower_threshold_applications
  for insert
  to authenticated
  with check (
    member_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

drop policy rsvps_update_own on rsvps;
create policy rsvps_update_own on rsvps
  for update
  to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid() and status = 'going');

create unique index points_ledger_event_attendance_once
  on points_ledger (event_id, member_id)
  where note = 'Event attendance';

create unique index points_ledger_no_show_once
  on points_ledger (event_id, member_id)
  where note = 'No-show penalty';
