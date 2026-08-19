-- ============================================================================
-- Phase 8d — fix a live RLS gap: notifications had no INSERT policy for
-- E-Board, only the implicit service_role bypass Lambdas use. Every
-- Lambda-based notification (completeEvent, cancelEvent,
-- reviewMissingMeetingForm, postManualPointAdjustment,
-- calculateEndOfSemesterStanding) has been fine since service_role bypasses
-- RLS entirely, but several E-Board actions notify via a direct
-- browser-side insert instead of a Lambda — Forms.jsx's lower-threshold
-- review (Phase 3), and BrotherDetail.jsx's role-flip/BiP-create/
-- resolve/escalate notifications (Phases 6-7). All of those inserts run as
-- the signed-in E-Board member through the anon key, so RLS applies, and
-- with no permissive INSERT policy every one of them was silently going to
-- fail with a permission-denied error the whole time — nothing in this
-- project's local-only testing ceiling (npm run build, node --check, no
-- real login) could have caught it, since none of that exercises an
-- authenticated write.
-- ============================================================================

create policy notifications_insert_eboard on notifications
  for insert
  to authenticated
  with check (get_my_role() = 'eboard');
