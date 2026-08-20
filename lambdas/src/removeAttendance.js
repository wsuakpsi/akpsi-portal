import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';

// Spec 6.8: removing incorrect attendance deletes the attendance row and
// posts an offsetting negative ledger entry with a required note — the
// original +points_value entry stays immutable (points_ledger is append-
// only), so the correction is a new row, net effect zero, full audit trail.
// Meetings never carry a point impact, so no ledger entry there — instead
// the mirrored meeting_attendance row (see recordAttendance.js) gets reset
// off 'present', to 'excused' if an approved form still covers this event
// or 'unexcused' otherwise. A notification always goes out either way.
export async function removeAttendance(eventId, memberId, note, removedBy) {
  if (!eventId || !memberId || !removedBy) {
    return { success: false, error: 'eventId, memberId, and removedBy are required' };
  }
  if (!note || !note.trim()) {
    return { success: false, error: 'note is required for attendance corrections' };
  }
  const supabase = getSupabaseClient();

  const { data: eventRow, error: eventError } = await supabase
    .from('events')
    .select('id, semester_id, category, points_value, name')
    .eq('id', eventId)
    .maybeSingle();
  if (eventError) return { success: false, error: eventError.message };
  if (!eventRow) return { success: false, error: `Event ${eventId} not found` };

  const { data: attendanceRow, error: attendanceFetchError } = await supabase
    .from('attendance')
    .select('id')
    .eq('event_id', eventId)
    .eq('member_id', memberId)
    .maybeSingle();
  if (attendanceFetchError) return { success: false, error: attendanceFetchError.message };
  if (!attendanceRow) return { success: false, error: 'No attendance record found for this member and event' };

  const { error: deleteError } = await supabase.from('attendance').delete().eq('id', attendanceRow.id);
  if (deleteError) return { success: false, error: deleteError.message };

  if (eventRow.category === 'meeting') {
    // Undo the 'present' recordAttendance set on check-in. If this brother
    // separately has an approved (non-voided) missing-meeting-form for this
    // exact event — filed and approved before they actually showed up and
    // checked in — that excuse is still valid, so revert to 'excused'
    // rather than clobbering it back to the neutral 'unexcused' default.
    const { data: approvedForm, error: formLookupError } = await supabase
      .from('missing_meeting_forms')
      .select('id')
      .eq('event_id', eventId)
      .eq('member_id', memberId)
      .eq('status', 'approved')
      .maybeSingle();
    if (formLookupError) return { success: false, error: formLookupError.message };

    const { error: meetingAttendanceError } = await supabase
      .from('meeting_attendance')
      .upsert(
        { event_id: eventId, member_id: memberId, status: approvedForm ? 'excused' : 'unexcused' },
        { onConflict: 'event_id,member_id' },
      );
    if (meetingAttendanceError) return { success: false, error: meetingAttendanceError.message };
  } else if (eventRow.points_value !== 0) {
    const { error: ledgerError } = await supabase.from('points_ledger').insert({
      member_id: memberId,
      semester_id: eventRow.semester_id,
      event_id: eventId,
      category: eventRow.category,
      delta: -eventRow.points_value,
      note: `Attendance correction: ${note}`,
      created_by: removedBy,
    });
    if (ledgerError) return { success: false, error: ledgerError.message };
  }

  const { error: notifError } = await supabase.from('notifications').insert({
    member_id: memberId,
    title: 'Attendance correction',
    body: `Your attendance for "${eventRow.name}" was corrected: ${note}`,
  });
  if (notifError) return { success: false, error: notifError.message };

  return { success: true };
}

export const handler = wrapEboardHandler(removeAttendance, (payload, caller) => [
  payload.eventId,
  payload.memberId,
  payload.note,
  caller.id,
]);
