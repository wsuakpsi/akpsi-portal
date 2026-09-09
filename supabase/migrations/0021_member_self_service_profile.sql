-- ============================================================================
-- Brother self-service profile: phone number, resume link, profile picture,
-- plus letting E-Board delete pending invites.
--
-- members had no self-update policy at all before this (only
-- members_select and members_update_eboard from 0002) — a brother couldn't
-- touch their own row, full stop. Adding a blanket
-- `using (id = auth.uid())` update policy would let a brother rewrite their
-- own role/status/eboard_position/pledge_class client-side (RLS is a row
-- filter, not a column filter, and the anon client is fully scriptable from
-- devtools regardless of what the UI form exposes). The trigger below is the
-- actual boundary: it allows the self-update RLS policy to pass the row
-- through, then rejects the statement if any non-profile column actually
-- changed and the caller isn't E-Board. New protected columns added to
-- members later need to be added to this trigger's check too.
-- ============================================================================

alter table members add column phone_number text;
alter table members add column resume_url text;
alter table members add column avatar_url text;

create or replace function guard_member_self_update()
returns trigger as $$
begin
  if get_my_role() = 'eboard' then
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

create trigger members_guard_self_update
  before update on members
  for each row execute function guard_member_self_update();

create policy members_update_self on members
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================================
-- pending_invites: no DELETE policy existed (0016/0020 only added SELECT and
-- a self-INSERT for the /join flow), so a client-side delete today would
-- silently affect zero rows under RLS instead of erroring — same failure
-- shape 0016's comment describes for the SELECT gap it fixed.
-- ============================================================================

create policy pending_invites_delete_eboard on pending_invites
  for delete
  to authenticated
  using (get_my_role() = 'eboard');

-- ============================================================================
-- avatars storage bucket. Public read (profile pictures aren't sensitive,
-- same tier as the app's other public-URL bucket, `proofs`), but insert/
-- update/delete are folder-scoped to the member's own id so brothers can only
-- ever touch objects under avatars/<their-own-id>/... — mirrors the
-- lower-threshold upload path convention in Profile.jsx
-- (`lower-threshold/${profile.id}/...`).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy avatars_select_public on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');

create policy avatars_insert_own on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_update_own on storage.objects
  for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_delete_own on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
