-- ============================================================================
-- Open member profiles to all brothers, for a chapter roster page.
--
-- members_select (0002) only allowed a brother to read their own row (or
-- eboard to read every row), which is why 0013's get_leaderboard RPC exists
-- as a SECURITY DEFINER workaround exposing just full_name + points. A
-- roster is core to how the chapter actually operates, and every column on
-- members (name, email, phone_number, resume_url, pledge_class, status,
-- avatar_url) is meant to be visible chapter-wide — none of it is meant to
-- be brother-private. RLS can't filter columns per-row anyway, so if a
-- brother should be able to see another brother's phone number for the
-- roster, they can see all of that row's columns.
--
-- This does NOT touch writes: members_update_eboard and members_update_self
-- (plus the guard_member_self_update trigger) are unchanged, so a brother
-- still can't modify anyone else's row, or their own role/status/etc.
-- ============================================================================

drop policy members_select on members;
create policy members_select on members
  for select
  to authenticated
  using (true);
