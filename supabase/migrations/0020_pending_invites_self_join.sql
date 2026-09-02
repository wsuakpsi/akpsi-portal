-- ============================================================================
-- Self-serve join link: lets an authenticated user (just created via
-- supabase.auth.signUp() on the /join page) insert their own pending_invites
-- row, instead of requiring an E-Board admin invite. Locked down so a brother
-- can only ever create a 'brother'/'active' row for their own email — role
-- and status can't be self-escalated even though the columns default to
-- those values, since a client could still pass them explicitly.
-- ============================================================================

create policy pending_invites_insert_self on pending_invites
  for insert
  to authenticated
  with check (
    email = auth.jwt() ->> 'email'
    and role = 'brother'
    and status = 'active'
  );
