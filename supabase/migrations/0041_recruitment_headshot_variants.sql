-- ============================================================================
-- Egress: headshot thumbnail + display-size variants.
--
-- The deliberation list used to download every applicant's full headshot on
-- every page load. Lists now show a ~256px thumbnail and the detail page a
-- ~1024px display image; both are stored at new, immutable paths (never
-- upserted over an existing object) with a one-year Cache-Control.
--
-- Additive only: two nullable columns. No policy, bucket or RLS change — the
-- existing rush-applications policies already cover new object paths.
-- NULL means "variant not generated yet" (rows created before this change
-- until scripts/backfill-headshot-variants.mjs has run); the UI falls back to
-- initials in lists and to the original headshot on the detail page.
-- ============================================================================

alter table rush_applications add column if not exists headshot_thumbnail_path text;
alter table rush_applications add column if not exists headshot_display_path text;
