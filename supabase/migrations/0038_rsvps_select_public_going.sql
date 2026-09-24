-- ============================================================================
-- Let brothers see who's RSVPed "going" to an event (attendee list on the
-- brother-facing event detail page), and let the events list page show
-- accurate RSVP counts against a capacity without an eboard-only RPC.
--
-- rsvps_select (0002) only let a brother read their own row (or eboard read
-- everything), so there was no way to show a public attendee list. This
-- only opens rows with status = 'going' — a brother's 'cancelled'/'no_show'
-- rows stay visible only to themselves and eboard, same as before.
-- ============================================================================

drop policy rsvps_select on rsvps;
create policy rsvps_select on rsvps
  for select
  to authenticated
  using (
    member_id = auth.uid()
    or get_my_role() = 'eboard'
    or status = 'going'
  );
