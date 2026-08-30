-- ============================================================================
-- Reconstructed from remote schema — this migration was pushed to the linked
-- Supabase project directly and never landed in this local repo. Backfilling
-- it here so local migration history matches remote before pushing 0018/0019.
-- ============================================================================

create policy pending_invites_select_eboard on pending_invites
  for select
  to authenticated
  using (get_my_role() = 'eboard');
