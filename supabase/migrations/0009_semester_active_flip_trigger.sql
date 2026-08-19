-- ============================================================================
-- Phase 8a — Semester activation auto-flip.
-- Spec 10.1: "On confirmation: new semester inserted with is_active = true.
-- Database trigger flips previous active semester is_active -> false." This
-- is a DB trigger per the spec's explicit wording (not application code) —
-- runs BEFORE the triggering row's own insert/update commits, so by the
-- time the partial unique index (semesters_one_active_idx, migration 0001)
-- checks this row, any previously-active row has already been flipped off
-- within the same transaction.
-- ============================================================================

create or replace function flip_previous_active_semester()
returns trigger as $$
begin
  if new.is_active then
    update semesters set is_active = false where id <> new.id and is_active = true;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger semesters_flip_active
  before insert or update of is_active on semesters
  for each row execute function flip_previous_active_semester();
