import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';

// Spec 6.8: removing incorrect attendance deletes the attendance row and
// posts an offsetting negative ledger entry with a required note — the
// original +points_value entry stays immutable (points_ledger is append-
// only), so the correction is a new row, net effect zero, full audit trail.
// No ledger entry for meetings — they never carry a point impact.
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

  if (eventRow.category !== 'meeting' && eventRow.points_value !== 0) {
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

    const { error: notifError } = await supabase.from('notifications').insert({
      member_id: memberId,
      title: 'Attendance correction',
      body: `Your attendance for "${eventRow.name}" was corrected: ${note}`,
    });
    if (notifError) return { success: false, error: notifError.message };
  }

  return { success: true };
}

export const handler = wrapEboardHandler(removeAttendance, (payload, caller) => [
  payload.eventId,
  payload.memberId,
  payload.note,
  caller.id,
]);
