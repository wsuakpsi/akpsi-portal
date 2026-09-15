-- ============================================================================
-- "Classes later than 8 PM" was single-select (copied from the Google Form,
-- which only allowed one day). Applicants need to pick several — convert
-- late_class_day (text) to late_class_days (text[]).
-- ============================================================================

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'rush_applications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%late_class_day%'
  loop
    execute format('alter table rush_applications drop constraint %I', con.conname);
  end loop;
end $$;

alter table rush_applications
  alter column late_class_day type text[] using array[late_class_day];

alter table rush_applications rename column late_class_day to late_class_days;

alter table rush_applications
  add constraint rush_applications_late_class_days_check check (
    array_length(late_class_days, 1) >= 1
    and late_class_days <@ array['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'None']::text[]
    -- "None" is exclusive — it can't be combined with actual days.
    and not ('None' = any(late_class_days) and array_length(late_class_days, 1) > 1)
  );
