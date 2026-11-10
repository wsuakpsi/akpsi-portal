-- ============================================================================
-- D.A.D. — alumni directory inside the brother portal.
--
-- The "D.A.D. Info" Google Sheet is the source of truth. This table is a
-- read-only mirror of it, rebuilt wholesale by the syncAlumniFromSheet Lambda
-- (E-Board button, a once-a-semester schedule, and right after the
-- graduateBrothers Lambda appends new rows to the sheet). Nothing in the app
-- edits alumni rows directly — fix data in the sheet, then sync.
--
-- Reads: any signed-in member (same reasoning as the roster in 0025 — the
-- directory exists so brothers can reach out to alumni). Writes: service
-- role only, via replace_alumni() below.
-- ============================================================================

create table alumni (
  id uuid primary key default gen_random_uuid(),
  sheet_row integer not null,
  full_name text not null,
  pledge_class text,
  graduation text,            -- exactly as written in the sheet ("May 2022", "2017", ...)
  graduation_year integer,    -- parsed from `graduation` for sorting/filtering; null if unparseable
  email text,
  phone text,
  major text,
  employer text,
  job_title text,
  past_employers text,
  city text,
  linkedin_url text,
  secondary_education text,
  wants_involvement text,
  industry text,
  synced_at timestamptz not null default now()
);

create index alumni_full_name_idx on alumni (full_name);

alter table alumni enable row level security;

create policy alumni_select on alumni
  for select
  to authenticated
  using (true);

-- No insert/update/delete policies for `authenticated` — all writes go
-- through replace_alumni(), which only the service role may call.

-- ----------------------------------------------------------------------------
-- replace_alumni(rows): swap the whole table for a fresh copy of the sheet in
-- one transaction, so brothers never see a half-synced directory.
-- ----------------------------------------------------------------------------
create or replace function replace_alumni(rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  if jsonb_typeof(rows) <> 'array' then
    raise exception 'replace_alumni expects a JSON array';
  end if;

  delete from alumni where true;

  insert into alumni (
    sheet_row, full_name, pledge_class, graduation, graduation_year, email,
    phone, major, employer, job_title, past_employers, city, linkedin_url,
    secondary_education, wants_involvement, industry, synced_at
  )
  select
    r.sheet_row, r.full_name, r.pledge_class, r.graduation, r.graduation_year,
    r.email, r.phone, r.major, r.employer, r.job_title, r.past_employers,
    r.city, r.linkedin_url, r.secondary_education, r.wants_involvement,
    r.industry, now()
  from jsonb_to_recordset(rows) as r (
    sheet_row integer, full_name text, pledge_class text, graduation text,
    graduation_year integer, email text, phone text, major text,
    employer text, job_title text, past_employers text, city text,
    linkedin_url text, secondary_education text, wants_involvement text,
    industry text
  )
  where coalesce(trim(r.full_name), '') <> '';

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function replace_alumni(jsonb) from public, anon, authenticated;
grant execute on function replace_alumni(jsonb) to service_role;
