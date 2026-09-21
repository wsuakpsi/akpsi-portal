-- ============================================================================
-- Add 2030 graduation dates. The Apply form's options live in
-- src/lib/applications.js (GRADUATION_YEAR_OPTIONS) and must match this list.
-- ============================================================================

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'rush_applications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%graduation_year%'
  loop
    execute format('alter table rush_applications drop constraint %I', con.conname);
  end loop;
end $$;

alter table rush_applications
  add constraint rush_applications_graduation_year_check check (
    graduation_year in (
      'May 2027', 'December 2027',
      'May 2028', 'December 2028',
      'May 2029', 'December 2029',
      'May 2030', 'December 2030'
    )
  );
