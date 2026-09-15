-- ============================================================================
-- Disable self-serve join: the /join page no longer lets a brother create
-- their own pending_invites row (src/pages/Join.jsx now just shows an
-- "invite only" message). Drop the matching insert policy so a direct API
-- call (bypassing the UI) can't self-register either.
-- ============================================================================

drop policy if exists pending_invites_insert_self on pending_invites;
