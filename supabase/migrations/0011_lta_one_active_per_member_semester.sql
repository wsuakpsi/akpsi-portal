-- ============================================================================
-- Phase 8c — Lower threshold application dedup guard (spec 8.2: "Lambda
-- validates: no existing pending or approved application for this member
-- this semester.") The application layer checks this before submitting,
-- but this partial unique index is the real backstop, same pattern as
-- attendance's unique(event_id, member_id) — a concurrent double-submit
-- race is caught at the DB layer (error code 23505) instead of silently
-- creating two live applications.
--
-- Verified against live data before adding: no existing member/semester
-- pair currently has more than one pending/approved row.
-- ============================================================================

create unique index lta_one_active_per_member_semester
  on lower_threshold_applications (member_id, semester_id)
  where status in ('pending', 'approved');
