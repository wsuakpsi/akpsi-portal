-- ============================================================================
-- AKPsi Beta Omicron Chapter Management Platform — Initial Schema
-- Run in the Supabase SQL editor. Tables are created in FK-dependency order.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ============================================================================
-- Enums
-- ============================================================================

create type member_role as enum ('brother', 'eboard');
create type member_status as enum ('active', 'probation', 'suspended');

create type review_status as enum ('pending', 'approved', 'denied');

create type event_category as enum (
  'professional', 'service', 'fundraising', 'social', 'rush', 'extra', 'meeting'
);
create type event_status as enum ('scheduled', 'completed', 'cancelled');

create type rsvp_status as enum ('going', 'cancelled', 'no_show');

create type points_category as enum (
  'professional', 'service', 'fundraising', 'social', 'rush', 'extra', 'meeting', 'adjustment'
);

create type meeting_attendance_status as enum ('present', 'excused', 'unexcused');

-- ============================================================================
-- Shared trigger: auto-update updated_at
-- ============================================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- 1. members
-- ============================================================================

create table members (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  full_name text not null,
  pledge_class text not null,
  role member_role not null default 'brother',
  eboard_position text,
  status member_status not null default 'active',
  created_at timestamptz not null default now()
);

-- No DELETE ever — status handles removal.
create or replace function prevent_delete()
returns trigger as $$
begin
  raise exception '% rows may never be deleted', tg_table_name;
end;
$$ language plpgsql;

create trigger members_no_delete
  before delete on members
  for each row execute function prevent_delete();

-- ============================================================================
-- 2. semesters
-- ============================================================================

create table semesters (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date > start_date)
);

-- Only one semester may be active at a time.
create unique index semesters_one_active_idx
  on semesters (is_active)
  where is_active;

-- ============================================================================
-- 3. lower_threshold_applications
-- ============================================================================

create table lower_threshold_applications (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references members (id),
  semester_id uuid not null references semesters (id),
  reason text not null,
  proof_url text,
  status review_status not null default 'pending',
  reviewed_by uuid references members (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('approved', 'denied') and reviewed_by is not null and reviewed_at is not null)
  )
);

create index lta_member_id_idx on lower_threshold_applications (member_id);
create index lta_semester_id_idx on lower_threshold_applications (semester_id);
create index lta_reviewed_by_idx on lower_threshold_applications (reviewed_by);

-- ============================================================================
-- 4. events
-- ============================================================================

create table events (
  id uuid primary key default uuid_generate_v4(),
  semester_id uuid not null references semesters (id),
  name text not null,
  category event_category not null,
  points_value integer not null default 0,
  is_required boolean not null default false,
  location text,
  starts_at timestamptz not null,
  status event_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  check (points_value >= 0)
);

create index events_semester_id_idx on events (semester_id);
create index events_category_idx on events (category);
create index events_starts_at_idx on events (starts_at);

-- ============================================================================
-- 5. rsvps
-- ============================================================================

create table rsvps (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events (id),
  member_id uuid not null references members (id),
  status rsvp_status not null default 'going',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, member_id)
);

create index rsvps_event_id_idx on rsvps (event_id);
create index rsvps_member_id_idx on rsvps (member_id);

create trigger rsvps_set_updated_at
  before update on rsvps
  for each row execute function set_updated_at();

-- ============================================================================
-- 6. attendance (non-meeting events, written only by Lambda)
-- ============================================================================

create table attendance (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events (id),
  member_id uuid not null references members (id),
  checked_in_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (event_id, member_id)
);

create index attendance_event_id_idx on attendance (event_id);
create index attendance_member_id_idx on attendance (member_id);

-- ============================================================================
-- 7. points_ledger (append-only, immutable)
-- ============================================================================

create table points_ledger (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references members (id),
  semester_id uuid not null references semesters (id),
  event_id uuid references events (id),
  category points_category not null,
  delta integer not null,
  note text,
  created_by uuid references members (id),
  created_at timestamptz not null default now(),
  check (category <> 'adjustment' or note is not null)
);

create index points_ledger_member_id_idx on points_ledger (member_id);
create index points_ledger_semester_id_idx on points_ledger (semester_id);
create index points_ledger_event_id_idx on points_ledger (event_id);
create index points_ledger_created_by_idx on points_ledger (created_by);
create index points_ledger_member_semester_idx on points_ledger (member_id, semester_id);

-- No UPDATE or DELETE ever.
create trigger points_ledger_no_delete
  before delete on points_ledger
  for each row execute function prevent_delete();

create or replace function prevent_update()
returns trigger as $$
begin
  raise exception '% rows may never be updated', tg_table_name;
end;
$$ language plpgsql;

create trigger points_ledger_no_update
  before update on points_ledger
  for each row execute function prevent_update();

-- ============================================================================
-- 8. meeting_attendance
-- ============================================================================

create table meeting_attendance (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events (id),
  member_id uuid not null references members (id),
  status meeting_attendance_status not null default 'unexcused',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, member_id)
);

create index meeting_attendance_event_id_idx on meeting_attendance (event_id);
create index meeting_attendance_member_id_idx on meeting_attendance (member_id);

create trigger meeting_attendance_set_updated_at
  before update on meeting_attendance
  for each row execute function set_updated_at();

-- ============================================================================
-- 9. missing_meeting_forms
-- ============================================================================

create table missing_meeting_forms (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references members (id),
  event_id uuid not null references events (id),
  reason text not null,
  proof_url text,
  status review_status not null default 'pending',
  reviewed_by uuid references members (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('approved', 'denied') and reviewed_by is not null and reviewed_at is not null)
  )
);

create index mmf_member_id_idx on missing_meeting_forms (member_id);
create index mmf_event_id_idx on missing_meeting_forms (event_id);
create index mmf_reviewed_by_idx on missing_meeting_forms (reviewed_by);

-- ============================================================================
-- 10. notifications
-- ============================================================================

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references members (id),
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_member_id_idx on notifications (member_id);
