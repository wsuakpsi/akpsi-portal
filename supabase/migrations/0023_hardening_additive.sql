-- ============================================================================
-- Additive hardening (no existing path changes behaviour):
--
-- (pending_invites self-delete is NOT added here: the live DB already has a
-- hand-created policy "users can delete their own pending invite" covering
-- it, alongside "users can read their own pending invite" and "users can
-- insert their own members row on first login" — none of which exist in
-- these migrations. See HANDOFF.md "Live-only policies".)
--
-- 2. Revoke anon/public EXECUTE on the two security-definer helpers. Supabase
--    grants EXECUTE on public functions to anon by default, so get_leaderboard
--    (every active member's name + point total) was callable with just the
--    anon key, no login. `authenticated` keeps its grant.
--
-- 3. guard_member_self_update: service-role sessions have no auth.uid(), so
--    get_my_role() returns null and the trigger rejects ANY role/status
--    change made by a Lambda or script. Nothing does that today, but it's a
--    trap for the next person. Let service-role through explicitly.
--
-- 5. members first-login self-insert. The live, hand-created policy
--    "users can insert their own members row on first login" checks only
--    id = auth.uid() — a client could insert itself with role = 'eboard'.
--    Recreate it (tracked here from now on) pinned to brother/active with no
--    eboard_position and the caller's own email. This is exactly what
--    getMyProfile() (src/lib/auth.js) copies from pending_invites, whose
--    self-insert policy (0020) already forces brother/active.
--
-- 4. E-Board INSERT on missing_meeting_forms / lower_threshold_applications.
--    BrotherDetail's "Move to lower threshold" inserts an already-approved
--    row as the signed-in officer. Give E-Board its own policy so the
--    brother self-insert policies can be tightened later (separate
--    migration, needs sign-off) without breaking the officer path.
-- ============================================================================

revoke execute on function get_leaderboard(uuid) from public, anon;
revoke execute on function get_my_role() from public, anon;

create or replace function guard_member_self_update()
returns trigger as $$
begin
  -- Service role (Lambdas, seed scripts) has no auth.uid(); E-Board may
  -- change anything.
  if auth.uid() is null or get_my_role() = 'eboard' then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.eboard_position is distinct from old.eboard_position
     or new.pledge_class is distinct from old.pledge_class
     or new.full_name is distinct from old.full_name
     or new.email is distinct from old.email
     or new.first_semester_initiated is distinct from old.first_semester_initiated
  then
    raise exception 'brothers may only update phone_number, resume_url, and avatar_url on their own profile';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create policy mmf_insert_eboard on missing_meeting_forms
  for insert
  to authenticated
  with check (get_my_role() = 'eboard');

create policy lta_insert_eboard on lower_threshold_applications
  for insert
  to authenticated
  with check (get_my_role() = 'eboard');

drop policy if exists "users can insert their own members row on first login" on members;
create policy members_insert_self_first_login on members
  for insert
  to authenticated
  with check (
    id = auth.uid()
    and email = auth.jwt() ->> 'email'
    and role = 'brother'
    and status = 'active'
    and eboard_position is null
  );
