-- ============================================================================
-- Phase 4 — attendance.check_in_method / recorded_by (spec 3.4, 6.6, 6.7).
-- Needed to distinguish QR self-check-in from E-Board manual check-in, and
-- to know which officer recorded a manual one. Backfill existing rows as
-- 'manual' with no recorder — check_in_method wasn't tracked before this,
-- so there's no way to know which of them were actually QR scans.
-- ============================================================================

create type check_in_method as enum ('qr_scan', 'manual');

alter table attendance
  add column check_in_method check_in_method not null default 'manual',
  add column recorded_by uuid references members (id);

alter table attendance
  alter column check_in_method drop default;
