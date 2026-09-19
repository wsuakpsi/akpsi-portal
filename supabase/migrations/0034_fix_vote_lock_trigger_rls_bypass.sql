-- ============================================================================
-- Bug fix: check_application_not_decided() (0032) runs as the voting
-- member (SECURITY INVOKER, the default), so its own lookup against
-- rush_application_decisions is subject to that table's RLS. Since 0033
-- restricted SELECT on rush_application_decisions to VP Membership/VP
-- Internal/Secretary only, anyone else's vote now silently looks up "no
-- decision found" and the lock never fires — the enforcement check was
-- neutered by the same migration that restricted decision visibility.
-- Fix: make the trigger function SECURITY DEFINER so it always sees the
-- true decision state, regardless of who's voting.
-- ============================================================================

create or replace function check_application_not_decided()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_decision application_decision;
begin
  select decision into current_decision
  from rush_application_decisions
  where application_id = coalesce(new.application_id, old.application_id);

  if current_decision is not null and current_decision <> 'pending' then
    raise exception 'Voting is closed for this applicant.';
  end if;

  return coalesce(new, old);
end;
$$;
