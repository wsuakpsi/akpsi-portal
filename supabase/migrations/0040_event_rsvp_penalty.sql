-- ============================================================================
-- Per-event RSVP penalty toggle
-- ============================================================================
-- Until now every non-meeting event posted a -10 for a late RSVP cancel
-- (< 24h) and a -10 for an RSVP'd no-show. That is now opt-in per event:
-- rsvp_penalty = true means both penalties apply; false means RSVPing
-- carries no point impact at all. Required events and meetings never use
-- RSVPs, so the flag is forced false for them.

alter table events add column if not exists rsvp_penalty boolean not null default false;

alter table events drop constraint if exists events_rsvp_penalty_check;
alter table events add constraint events_rsvp_penalty_check
  check (not rsvp_penalty or (not is_required and category <> 'meeting'));

-- Preserve existing behavior for events that haven't happened yet; past and
-- cancelled events are left off so nothing is re-penalized retroactively.
update events
   set rsvp_penalty = true
 where status = 'scheduled'
   and starts_at > now()
   and not is_required
   and category <> 'meeting';
