-- ============================================================================
-- Brother portal manual test seed.
--
-- Setup steps:
--   1. In the Supabase Dashboard, go to Authentication > Users > Add user.
--      Create a user with an email + password you'll use to log in
--      (e.g. samaksharora.09@gmail.com). Copy the generated UUID.
--   2. Replace every '4e5de525-e585-48ab-8e21-6122689392e5' literal below
--      with that UUID (use find & replace).
--   3. Run this whole script in the SQL editor.
--   4. Log into the brother portal with that email/password.
-- ============================================================================

-- 1. Member row (role='brother') for the auth user created above.
insert into members (id, email, full_name, pledge_class, role, status)
values ('4e5de525-e585-48ab-8e21-6122689392e5', 'samaksharora.09@gmail.com', 'Test Brother', 'Fall 2024', 'brother', 'active')
on conflict (id) do update set
  full_name = excluded.full_name,
  pledge_class = excluded.pledge_class,
  role = excluded.role,
  status = excluded.status;

-- 2. Active semester.
insert into semesters (name, start_date, end_date, is_active)
values ('Seed Semester', current_date - interval '30 days', current_date + interval '90 days', true)
on conflict (name) do nothing;

-- 3. Events across categories, mixing scheduled/completed and meeting.
with sem as (select id from semesters where name = 'Seed Semester')
insert into events (semester_id, name, category, points_value, starts_at, status)
select sem.id, v.name, v.category::event_category, v.points_value, v.starts_at::timestamptz, v.status::event_status
from sem, (values
  ('Resume Workshop', 'professional', 10, (now() + interval '3 days')::text, 'scheduled'),
  ('Beach Cleanup', 'service', 15, (now() + interval '5 days')::text, 'scheduled'),
  ('Bake Sale', 'fundraising', 5, (now() + interval '7 days')::text, 'scheduled'),
  ('Bowling Social', 'social', 5, (now() + interval '10 days')::text, 'scheduled'),
  ('Chapter Meeting', 'meeting', 0, (now() + interval '2 days')::text, 'scheduled'),
  ('Alumni Panel', 'professional', 10, (now() - interval '10 days')::text, 'completed'),
  ('Past Chapter Meeting', 'meeting', 0, (now() - interval '7 days')::text, 'completed')
) as v(name, category, points_value, starts_at, status)
on conflict do nothing;

-- 4. Points ledger entries for the test member.
with sem as (select id from semesters where name = 'Seed Semester')
insert into points_ledger (member_id, semester_id, category, delta, note)
select '4e5de525-e585-48ab-8e21-6122689392e5', sem.id, v.category::points_category, v.delta, v.note
from sem, (values
  ('professional', 10, null),
  ('service', 15, null),
  ('fundraising', 5, null),
  ('social', 5, null)
) as v(category, delta, note);

-- 5. Meeting attendance for the past meeting.
insert into meeting_attendance (event_id, member_id, status)
select e.id, '4e5de525-e585-48ab-8e21-6122689392e5', 'present'
from events e
where e.name = 'Past Chapter Meeting'
on conflict (event_id, member_id) do nothing;

-- 6. Attendance for the past completed non-meeting event.
insert into attendance (event_id, member_id, checked_in_at)
select e.id, '4e5de525-e585-48ab-8e21-6122689392e5', e.starts_at
from events e
where e.name = 'Alumni Panel'
on conflict (event_id, member_id) do nothing;
