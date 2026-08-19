-- ============================================================================
-- Phase 1c — Add 'voided' to review_status for the missing-meeting-form
-- cancellation cascade (spec 7.4): forms tied to a cancelled required event
-- get voided rather than left approved/denied. Own migration/transaction so
-- later migrations can reference the new value.
-- ============================================================================

alter type review_status add value if not exists 'voided';
