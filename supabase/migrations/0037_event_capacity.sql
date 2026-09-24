-- ============================================================================
-- Event RSVP capacity
-- ============================================================================
-- Adds an optional capacity to events (null = unlimited) and enforces it at
-- the database level, since brothers write rsvps directly via the Supabase
-- client (no lambda in the path) — a client-side check alone can be bypassed.

alter table events add column if not exists capacity integer;
alter table events add constraint events_capacity_check check (capacity is null or capacity > 0);

create or replace function enforce_event_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_capacity integer;
  going_count integer;
begin
  if new.status <> 'going' then
    return new;
  end if;

  select capacity into event_capacity from events where id = new.event_id;

  if event_capacity is null then
    return new;
  end if;

  select count(*) into going_count
    from rsvps
    where event_id = new.event_id
      and status = 'going'
      and member_id <> new.member_id;

  if going_count >= event_capacity then
    raise exception 'Event is at capacity' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists rsvps_enforce_capacity on rsvps;
create trigger rsvps_enforce_capacity
  before insert or update on rsvps
  for each row execute function enforce_event_capacity();
