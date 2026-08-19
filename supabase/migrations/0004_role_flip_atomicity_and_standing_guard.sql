-- ============================================================================
-- Phase 1b — Role-flip atomicity constraint, standing double-run guard,
-- mandatory lower-threshold proof.
-- Run after 0003_account_lifecycle_enums.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Role flip atomicity: role = 'eboard' must always carry a non-null
-- eboard_position, and no other role may carry one. This makes the promote/
-- demote operation impossible to leave half-done at the DB layer, regardless
-- of what the application code does.
-- ----------------------------------------------------------------------------

alter table members
  add constraint members_eboard_position_matches_role
  check (
    (role = 'eboard' and eboard_position is not null)
    or (role <> 'eboard' and eboard_position is null)
  );

-- ----------------------------------------------------------------------------
-- Standing calculation double-run guard: calculateEndOfSemesterStanding sets
-- this when it runs. The Lambda checks it before running again and requires
-- explicit confirmation to overwrite.
-- ----------------------------------------------------------------------------

alter table semesters
  add column calculated_at timestamptz;

-- ----------------------------------------------------------------------------
-- Lower threshold applications: proof is mandatory per spec 8.2. A couple of
-- pre-existing rows predate this rule and have no proof on file — backfill
-- with an explicit sentinel rather than fabricating a real proof URL, so the
-- gap stays visible in the data instead of being silently papered over.
-- ----------------------------------------------------------------------------

update lower_threshold_applications
  set proof_url = 'legacy:no-proof-on-file'
  where proof_url is null;

alter table lower_threshold_applications
  alter column proof_url set not null;
