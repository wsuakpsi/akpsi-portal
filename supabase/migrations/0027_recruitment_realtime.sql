-- ============================================================================
-- Enable Realtime on the two recruitment tables the deliberation dashboard
-- subscribes to (live vote tallies + live comments) — postgres_changes
-- subscriptions only fire for tables in this publication.
-- ============================================================================

alter publication supabase_realtime add table rush_application_votes;
alter publication supabase_realtime add table rush_application_comments;
