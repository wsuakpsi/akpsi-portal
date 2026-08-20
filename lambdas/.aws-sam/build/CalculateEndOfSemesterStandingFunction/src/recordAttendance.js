import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapAuthedHandler } from './lib/httpResponse.js';
import { verifyCheckInToken } from './lib/qrToken.js';

const DUPLICATE_ERROR = 'Attendance already recorded for this member and event';

// `recordedBy` is set for manual check-ins (spec 3.4: "Set for manual
// check-ins only") — null for QR self-check-in, where nobody "recorded" it.
export async function recordAttendance(eventId, memberId, checkInMethod, recordedBy = null) {
  if (!eventId || !memberId) {
    return { success: false, error: 'eventId and memberId are required' };
  }
  const supabase = getSupabaseClient();

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, status, category')
    .eq('id', eventId)
    .maybeSingle();
  if (eventError) return { success: false, error: eventError.message };
  if (!event) return { success: false, error: `Event ${eventId} not found` };
  if (event.status !== 'scheduled') {
    return { success: false, error: `Event ${eventId} is not scheduled (status: ${event.status})` };
  }

  const { data: existing, error: dupError } = await supabase
    .from('attendance')
    .select('id')
    .eq('event_id', eventId)
    .eq('member_id', memberId)
    .maybeSingle();
  if (dupError) return { success: false, error: dupError.message };
  if (existing) return { success: false, error: DUPLICATE_ERROR };

  const { error: insertError } = await supabase.from('attendance').insert({
    event_id: eventId,
    member_id: memberId,
    checked_in_at: new Date().toISOString(),
    check_in_method: checkInMethod,
    recorded_by: recordedBy,
  });
  if (insertError) {
    // Race with another request: the unique (event_id, member_id) constraint wins.
    if (insertError.code === '23505') return { success: false, error: DUPLICATE_ERROR };
    return { success: false, error: insertError.message };
  }

  const { data: rsvp, error: rsvpFetchError } = await supabase
    .from('rsvps')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('member_id', memberId)
    .maybeSingle();
  if (rsvpFetchError) return { success: false, error: rsvpFetchError.message };

  if (rsvp && rsvp.status === 'cancelled') {
    const { error: rsvpUpdateError } = await supabase
      .from('rsvps')
      .update({ status: 'going' })
      .eq('id', rsvp.id);
    if (rsvpUpdateError) return { success: false, error: rsvpUpdateError.message };
  }

  // Meetings track presence in meeting_attendance (present/excused/
  // unexcused), a separate table from the points-bearing `attendance` one
  // above — but nothing before this wrote 'present' into it, so a checked-in
  // brother's meeting record stayed stuck at the 'unexcused' default forever.
  // `attendance` above is still what standing calculation and points read;
  // this is purely keeping meeting_attendance's own present/excused/
  // unexcused display in sync with it. Upserting unconditionally to
  // 'present' is deliberate — showing up in person overrides a prior
  // 'excused' from an approved missing-meeting form (they did attend after all).
  if (event.category === 'meeting') {
    const { error: meetingAttendanceError } = await supabase
      .from('meeting_attendance')
      .upsert({ event_id: eventId, member_id: memberId, status: 'present' }, { onConflict: 'event_id,member_id' });
    if (meetingAttendanceError) return { success: false, error: meetingAttendanceError.message };
  }

  return { success: true };
}

// Manual check-in fallback (spec 6.7): E-Board records it from the event
// detail page, `recorded_by` is always the acting officer's id — including
// when an officer checks themself in manually, since the point is "who ran
// this check-in," not "whose attendance is this."
export const handler = wrapAuthedHandler(
  recordAttendance,
  (payload, caller) => [payload.eventId, payload.memberId, 'manual', caller.id],
  (payload) => payload.memberId,
);

// QR check-in path (spec 6.6): the token stands in for eventId — the brother
// scans a QR code and the resulting page calls this with the token from the
// URL and their own member id (self check-in; wrapAuthedHandler still lets
// E-Board through in case the token URL is opened on the officer's device).
export async function recordAttendanceViaQr(token, memberId) {
  if (!token) return { success: false, error: 'token is required' };
  let eventId;
  try {
    ({ eventId } = verifyCheckInToken(token));
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'This check-in code has expired. Ask an officer to show the QR code again.'
        : 'This check-in code is invalid. Try scanning the QR code again.';
    return { success: false, error: message };
  }
  return recordAttendance(eventId, memberId, 'qr_scan', null);
}

export const qrHandler = wrapAuthedHandler(
  recordAttendanceViaQr,
  (payload) => [payload.token, payload.memberId],
  (payload) => payload.memberId,
);
