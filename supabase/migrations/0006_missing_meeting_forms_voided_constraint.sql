-- ============================================================================
-- Phase 1d — Allow voided missing_meeting_forms rows.
-- Voided rows are set by the cancellation cascade (system action, no human
-- reviewer), so they must be allowed without reviewed_by/reviewed_at, unlike
-- approved/denied which require both.
-- ============================================================================

alter table missing_meeting_forms
  drop constraint missing_meeting_forms_check;

alter table missing_meeting_forms
  add constraint missing_meeting_forms_check
  check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('approved', 'denied') and reviewed_by is not null and reviewed_at is not null)
    or (status = 'voided')
  );
