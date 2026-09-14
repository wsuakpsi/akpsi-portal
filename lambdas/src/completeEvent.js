import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEventManagerHandler } from './lib/httpResponse.js';

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
  if (eventRow.status === 'cancelled') {
    return { success: false, error: `Event ${eventId} was cancelled and cannot be completed` };
  }

  // The status flip to 'completed' happens LAST (bottom of this function):
  // if the ledger or notification writes fail part-way, the event stays
  // 'scheduled' and the officer can simply retry. Two overlapping runs are
  // caught by the partial unique indexes on points_ledger (migration 0024).

  const { data: attendanceRows, error: attendanceError } = await supabase
    .from('attendance')
    .select('member_id')
    .eq('event_id', eventId);
  if (attendanceError) return { success: false, error: attendanceError.message };

  // Meetings: roll-call sweep. Check-in only ever writes 'present' rows and
  // form approval only writes 'excused' rows, so a brother who simply didn't
  // show up had NO meeting_attendance row at all — and every absence count
  // (Attendance page, Brothers page, Overview flags, Sheets export) counts
  // rows, so they were invisible instead of unexcused. Fill the gap now:
  // every active/probation member with no row gets 'unexcused', or 'excused'
  // if an approved missing-meeting form already covers them. Existing rows
  // are never touched (ignoreDuplicates), so present/excused stay as-is.
  let meetingSweep = { unexcused: 0, excused: 0 };
  if (eventRow.category === 'meeting') {
    const [{ data: members, error: membersError }, { data: existingRows, error: existingError }, { data: approvedForms, error: formsError }] =
      await Promise.all([
        supabase.from('members').select('id').in('status', ['active', 'probation']),
        supabase.from('meeting_attendance').select('member_id').eq('event_id', eventId),
        supabase.from('missing_meeting_forms').select('member_id').eq('event_id', eventId).eq('status', 'approved'),
      ]);
    if (membersError) return { success: false, error: membersError.message };
    if (existingError) return { success: false, error: existingError.message };
    if (formsError) return { success: false, error: formsError.message };

    const hasRow = new Set(existingRows.map((r) => r.member_id));
    const excusedIds = new Set(approvedForms.map((f) => f.member_id));
    const rowsToInsert = members
      .filter((m) => !hasRow.has(m.id))
      .map((m) => ({
        event_id: eventId,
        member_id: m.id,
        status: excusedIds.has(m.id) ? 'excused' : 'unexcused',
      }));

    if (rowsToInsert.length > 0) {
      const { error: sweepError } = await supabase
        .from('meeting_attendance')
        .upsert(rowsToInsert, { onConflict: 'event_id,member_id', ignoreDuplicates: true });
      if (sweepError) return { success: false, error: sweepError.message };
    }
    meetingSweep = {
      unexcused: rowsToInsert.filter((r) => r.status === 'unexcused').length,
      excused: rowsToInsert.filter((r) => r.status === 'excused').length,
    };
  }

  // No-show sweep: anyone still 'going' with no attendance row missed the
  // event without cancelling. Meetings never use rsvps (attendance is
  // tracked separately via meeting_attendance, swept above), so this is
  // naturally a no-op for them, but the category check keeps that explicit
  // rather than incidental — meetings must never carry a point impact either way.
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

  // Meetings never carry a point impact: their attendance lives in
  // meeting_attendance (swept above) and must not produce ledger rows or
  // "you earned N points" notifications, even zero-delta ones.
  const pointBearingAttendance = eventRow.category === 'meeting' ? [] : attendanceRows;

  const ledgerRows = [
    ...noShows.map((r) => ({
      member_id: r.member_id,
      semester_id: eventRow.semester_id,
      event_id: eventId,
      category: eventRow.category,
      delta: NO_SHOW_PENALTY,
      note: 'No-show penalty',
    })),
    ...pointBearingAttendance.map((r) => ({
      member_id: r.member_id,
      semester_id: eventRow.semester_id,
      event_id: eventId,
      category: eventRow.category,
      delta: eventRow.points_value,
      note: 'Event attendance',
    })),
  ];

  // 23505 here means a previous run already posted this event's ledger rows
  // (an overlapping click, or a retry after notifications/status failed
  // part-way). The points are correct in that case, so skip straight to the
  // status flip rather than erroring — and skip notifications, which the
  // earlier run may already have sent.
  let ledgerAlreadyPosted = false;
  if (ledgerRows.length > 0) {
    const { error: ledgerError } = await supabase.from('points_ledger').insert(ledgerRows);
    if (ledgerError) {
      if (ledgerError.code !== '23505') return { success: false, error: ledgerError.message };
      ledgerAlreadyPosted = true;
    }
  }

  const notifications = [
    ...noShows.map((r) => ({
      member_id: r.member_id,
      title: 'No-show penalty',
      body: `You didn't check in for "${eventRow.name}" after RSVPing. A ${Math.abs(NO_SHOW_PENALTY)}-point penalty was applied.`,
    })),
    ...pointBearingAttendance.map((r) => ({
      member_id: r.member_id,
      title: 'Event attendance recorded',
      body: `You earned ${eventRow.points_value} point(s) for attending "${eventRow.name}".`,
    })),
  ];

  if (notifications.length > 0 && !ledgerAlreadyPosted) {
    const { error: notifError } = await supabase.from('notifications').insert(notifications);
    if (notifError) return { success: false, error: notifError.message };
  }

  const { error: updateError } = await supabase
    .from('events')
    .update({ status: 'completed' })
    .eq('id', eventId);
  if (updateError) return { success: false, error: updateError.message };

  return { success: true, noShows: noShows.length, attended: attendanceRows.length, meetingSweep };
}

export const handler = wrapEventManagerHandler(completeEvent, (payload) => [payload.eventId]);
