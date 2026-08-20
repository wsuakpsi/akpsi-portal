import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';

const NO_SHOW_PENALTY = -10;

export async function completeEvent(eventId) {
  if (!eventId) return { success: false, error: 'eventId is required' };
  const supabase = getSupabaseClient();

  const { data: eventRow, error: eventFetchError } = await supabase
    .from('events')
    .select('id, semester_id, category, points_value, name, status')
    .eq('id', eventId)
    .maybeSingle();
  if (eventFetchError) return { success: false, error: eventFetchError.message };
  if (!eventRow) return { success: false, error: `Event ${eventId} not found` };
  if (eventRow.status === 'completed') {
    // points_ledger is append-only, so re-completing would double-post points.
    return { success: false, error: `Event ${eventId} is already completed` };
  }

  const { error: updateError } = await supabase
    .from('events')
    .update({ status: 'completed' })
    .eq('id', eventId);
  if (updateError) return { success: false, error: updateError.message };

  const { data: attendanceRows, error: attendanceError } = await supabase
    .from('attendance')
    .select('member_id')
    .eq('event_id', eventId);
  if (attendanceError) return { success: false, error: attendanceError.message };

  // No-show sweep: anyone still 'going' with no attendance row missed the
  // event without cancelling. Meetings never use rsvps (attendance is
  // tracked separately via meeting_attendance), so this is naturally a
  // no-op for them, but the category check keeps that explicit rather than
  // incidental — meetings must never carry a point impact either way.
  let noShows = [];
  if (eventRow.category !== 'meeting') {
    const attendedIds = new Set(attendanceRows.map((r) => r.member_id));
    const { data: goingRsvps, error: goingError } = await supabase
      .from('rsvps')
      .select('id, member_id')
      .eq('event_id', eventId)
      .eq('status', 'going');
    if (goingError) return { success: false, error: goingError.message };

    const noShowRsvps = goingRsvps.filter((r) => !attendedIds.has(r.member_id));
    if (noShowRsvps.length > 0) {
      const { error: sweepError } = await supabase
        .from('rsvps')
        .update({ status: 'no_show' })
        .in(
          'id',
          noShowRsvps.map((r) => r.id),
        );
      if (sweepError) return { success: false, error: sweepError.message };
    }
    noShows = noShowRsvps;
  }

  const ledgerRows = [
    ...noShows.map((r) => ({
      member_id: r.member_id,
      semester_id: eventRow.semester_id,
      event_id: eventId,
      category: eventRow.category,
      delta: NO_SHOW_PENALTY,
      note: 'No-show penalty',
    })),
    ...attendanceRows.map((r) => ({
      member_id: r.member_id,
      semester_id: eventRow.semester_id,
      event_id: eventId,
      category: eventRow.category,
      delta: eventRow.points_value,
      note: 'Event attendance',
    })),
  ];

  if (ledgerRows.length > 0) {
    const { error: ledgerError } = await supabase.from('points_ledger').insert(ledgerRows);
    if (ledgerError) return { success: false, error: ledgerError.message };
  }

  const notifications = [
    ...noShows.map((r) => ({
      member_id: r.member_id,
      title: 'No-show penalty',
      body: `You didn't check in for "${eventRow.name}" after RSVPing. A ${Math.abs(NO_SHOW_PENALTY)}-point penalty was applied.`,
    })),
    ...attendanceRows.map((r) => ({
      member_id: r.member_id,
      title: 'Event attendance recorded',
      body: `You earned ${eventRow.points_value} point(s) for attending "${eventRow.name}".`,
    })),
  ];

  if (notifications.length > 0) {
    const { error: notifError } = await supabase.from('notifications').insert(notifications);
    if (notifError) return { success: false, error: notifError.message };
  }

  return { success: true, noShows: noShows.length, attended: attendanceRows.length };
}

export const handler = wrapEboardHandler(completeEvent, (payload) => [payload.eventId]);
