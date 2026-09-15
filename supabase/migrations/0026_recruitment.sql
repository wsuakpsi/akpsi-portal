-- ============================================================================
-- Recruitment — public rush applications + in-app deliberation (replaces the
-- old Google Form + separate resume-viewer/Slido setup). Lives behind its
-- own portal build (VITE_PORTAL=recruitment, recruitment.wsuakpsi.com):
--   - Anonymous applicants insert one row via the anon key (no account).
--   - Any signed-in member (brother/eboard/committee_head) can view every
--     application, vote, and comment — deliberation is chapter-wide, not
--     E-Board-only.
--   - Only E-Board can set the final decision.
-- ============================================================================

create type application_decision as enum ('pending', 'accepted', 'rejected', 'waitlisted');
create type application_vote_value as enum ('yes', 'no', 'maybe');

-- ============================================================================
-- 1. rush_applications
-- Field set mirrors the chapter's Winter '26 PNM Google Form exactly.
-- Resume/cover letter/headshot are stored in the `rush-applications` Storage
-- bucket (created below) under `${application id}/...` — the id is
-- generated client-side before upload so the files and the row can share it.
-- ============================================================================

create table rush_applications (
  id uuid primary key default gen_random_uuid(),

  full_name text not null,
  pronouns text not null,
  access_id text not null,
  wayne_state_email text not null,
  alternate_email text not null,

  standing text not null check (standing in ('Freshman', 'Sophomore', 'Junior')),
  graduation_year text not null check (
    graduation_year in ('May 2027', 'December 2027', 'May 2028', 'December 2028', 'May 2029', 'December 2029')
  ),
  gpa text not null,
  majors text not null,
  minors text not null,

  resume_path text not null,
  cover_letter_path text not null,
  headshot_path text not null,

  ever_transferred boolean not null,
  transfer_from_details text,
  plans_to_transfer text not null check (plans_to_transfer in ('Yes', 'No', 'Maybe')),
  transfer_to_details text,

  title_ix_violation boolean not null,
  felony_conviction boolean not null,

  how_heard text not null,
  late_class_day text not null check (
    late_class_day in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'None')
  ),
  additional_comments text,

  decision application_decision not null default 'pending',
  decided_by uuid references members (id),
  decided_at timestamptz,

  created_at timestamptz not null default now(),

  check (
    (decision = 'pending' and decided_by is null and decided_at is null)
    or (decision <> 'pending' and decided_by is not null and decided_at is not null)
  )
);

create index rush_applications_decision_idx on rush_applications (decision);
create index rush_applications_created_at_idx on rush_applications (created_at);

-- ============================================================================
-- 2. rush_application_votes — one changeable vote per member per applicant.
-- ============================================================================

create table rush_application_votes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references rush_applications (id) on delete cascade,
  member_id uuid not null references members (id),
  vote application_vote_value not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, member_id)
);

create index rush_votes_application_id_idx on rush_application_votes (application_id);
create index rush_votes_member_id_idx on rush_application_votes (member_id);

create trigger rush_application_votes_set_updated_at
  before update on rush_application_votes
  for each row execute function set_updated_at();

-- ============================================================================
-- 3. rush_application_comments
-- ============================================================================

create table rush_application_comments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references rush_applications (id) on delete cascade,
  member_id uuid not null references members (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index rush_comments_application_id_idx on rush_application_comments (application_id);

-- ============================================================================
-- 4. Storage bucket for resume/cover letter/headshot uploads
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('rush-applications', 'rush-applications', false)
on conflict (id) do nothing;

create policy rush_applications_bucket_public_upload on storage.objects
  for insert
  to anon
  with check (bucket_id = 'rush-applications');

create policy rush_applications_bucket_members_read on storage.objects
  for select
  to authenticated
  using (bucket_id = 'rush-applications');

-- ============================================================================
-- 5. RLS — rush_applications
-- ============================================================================

alter table rush_applications enable row level security;

create policy rush_applications_public_insert on rush_applications
  for insert
  to anon
  with check (decision = 'pending' and decided_by is null and decided_at is null);

create policy rush_applications_select on rush_applications
  for select
  to authenticated
  using (true);

create policy rush_applications_update_eboard on rush_applications
  for update
  to authenticated
  using (get_my_role() = 'eboard')
  with check (get_my_role() = 'eboard');

-- No DELETE ever.

-- ============================================================================
-- 6. RLS — rush_application_votes (every member may vote, on any applicant)
-- ============================================================================

alter table rush_application_votes enable row level security;

create policy rush_votes_select on rush_application_votes
  for select
  to authenticated
  using (true);

create policy rush_votes_insert_own on rush_application_votes
  for insert
  to authenticated
  with check (member_id = auth.uid());

create policy rush_votes_update_own on rush_application_votes
  for update
  to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy rush_votes_delete_own on rush_application_votes
  for delete
  to authenticated
  using (member_id = auth.uid());

-- ============================================================================
-- 7. RLS — rush_application_comments (every member may comment)
-- ============================================================================

alter table rush_application_comments enable row level security;

create policy rush_comments_select on rush_application_comments
  for select
  to authenticated
  using (true);

create policy rush_comments_insert_own on rush_application_comments
  for insert
  to authenticated
  with check (member_id = auth.uid());

create policy rush_comments_delete_own on rush_application_comments
  for delete
  to authenticated
  using (member_id = auth.uid());
