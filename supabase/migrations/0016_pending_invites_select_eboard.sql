-- ============================================================================
-- Fix a live RLS gap: pending_invites was never brought under this repo's
-- tracked RLS policies (it isn't created by any migration here — it exists
-- directly in the DB). getMyProfile()'s first-login self-lookup in
-- src/lib/auth.js works because it matches the signed-in user's own email,
-- but Brothers.jsx's new "Pending invites" list runs as the signed-in
-- E-Board member and reads every row — with no permissive SELECT policy for
-- that case, it silently comes back empty instead of erroring, since RLS
-- filters rows rather than denying the query outright.
-- ============================================================================

alter table pending_invites enable row level security;

create policy pending_invites_select_self on pending_invites
  for select
  to authenticated
  using (email = auth.jwt() ->> 'email');

create policy pending_invites_select_eboard on pending_invites
  for select
  to authenticated
  using (get_my_role() = 'eboard');
