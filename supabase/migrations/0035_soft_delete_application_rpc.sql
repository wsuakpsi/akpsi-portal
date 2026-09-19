-- ============================================================================
-- Bug fix: soft-deleting via a direct UPDATE fails with "new row violates
-- row-level security policy" — Postgres also checks the SELECT policy
-- (deleted_at is null, 0032) against the updated row, and a row with
-- deleted_at set is by definition invisible under it. Do the delete through
-- a SECURITY DEFINER function instead, gated on E-Board, and drop the
-- now-unneeded broad UPDATE policy.
-- ============================================================================

create or replace function soft_delete_rush_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if get_my_role() is distinct from 'eboard' then
    raise exception 'Only E-Board can delete applications.';
  end if;

  update rush_applications
  set deleted_at = now(), deleted_by = auth.uid()
  where id = p_application_id and deleted_at is null;
end;
$$;

grant execute on function soft_delete_rush_application(uuid) to authenticated;

drop policy if exists rush_applications_update_eboard on rush_applications;
