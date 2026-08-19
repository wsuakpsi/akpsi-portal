-- ============================================================================
-- Phase 8b — first_semester_initiated (spec 2.1, gates LTA eligibility per
-- spec 8.1: "First-semester brothers are ineligible... System blocks
-- submission if first_semester_initiated matches the active semester
-- name.") Did not exist at all. Nullable text, no fixed format (spec's own
-- example is a free-text semester name like "Fall 2024") — nothing
-- currently populates it for existing members, so it starts null for
-- everyone and E-Board sets it per-brother from Brother Detail. That gap is
-- deliberately left visible rather than guessed at: backfilling this from
-- created_at or pledge_class would be fabricating data this project has no
-- source of truth for.
-- ============================================================================

alter table members
  add column first_semester_initiated text;
