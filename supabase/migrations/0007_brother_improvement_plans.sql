-- ============================================================================
-- Phase 1e — Brother Improvement Plans (BiP)
-- Spec section 9. Formal disciplinary record between a verbal warning and a
-- conduct referral to nationals. No table for this existed at all.
-- ============================================================================

create type bip_status as enum ('open', 'resolved', 'escalated');

create table brother_improvement_plans (
  id uuid primary key default extensions.uuid_generate_v4(),
  member_id uuid not null references members (id),
  created_by uuid not null references members (id),
  description text not null,
  requirements text not null,
  due_date date not null,
  status bip_status not null default 'open',
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'open' or resolution_note is not null)
);

create index bip_member_id_idx on brother_improvement_plans (member_id);
create index bip_created_by_idx on brother_improvement_plans (created_by);

create trigger bip_set_updated_at
  before update on brother_improvement_plans
  for each row execute function set_updated_at();

-- No DELETE ever — persists across semesters until resolved/escalated.
create trigger bip_no_delete
  before delete on brother_improvement_plans
  for each row execute function prevent_delete();

-- ----------------------------------------------------------------------------
-- RLS: the brother it's about can read their own; eboard can read/write all;
-- brothers cannot read other brothers' BiPs (confidential per spec 9.3).
-- ----------------------------------------------------------------------------

alter table brother_improvement_plans enable row level security;

create policy bip_select on brother_improvement_plans
  for select
  to authenticated
  using (member_id = auth.uid() or get_my_role() = 'eboard');

create policy bip_insert_eboard on brother_improvement_plans
  for insert
  to authenticated
  with check (get_my_role() = 'eboard');

create policy bip_update_eboard on brother_improvement_plans
  for update
  to authenticated
  using (get_my_role() = 'eboard')
  with check (get_my_role() = 'eboard');

-- No DELETE ever — no policy, and the trigger above hard-blocks it too.
