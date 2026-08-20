-- ============================================================================
-- Beta launch cleanup — clears ALL seed / test data from every data table.
-- Schema, migrations, and RLS policies are untouched.
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- After running this, also delete test Auth users in:
--   Dashboard → Authentication → Users → select test accounts → Delete
-- ============================================================================

-- Truncate in reverse-dependency order so FK constraints don't block.
-- CASCADE handles any FK relationships we missed.

TRUNCATE TABLE
  notifications,
  lower_threshold_applications,
  missing_meeting_forms,
  brother_improvement_plans,
  rsvps,
  attendance,
  meeting_attendance,
  points_ledger,
  events,
  semesters,
  members
CASCADE;
