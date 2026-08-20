import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapAuthedHandler } from './lib/httpResponse.js';

const LATE_CANCEL_WINDOW_HOURS = 24;
const LATE_CANCEL_PENALTY = -10;

// `expectedMemberId` is the member_id the caller claims to be cancelling for
// (the wrapAuthedHandler already checked the caller is that member or
// E-Board) — re-checked here against the RSVP's actual owner so a mismatched
// id in the request body can't be used to cancel someone else's RSVP.
export async function recordLateCancel(rsvpId, expectedMemberId) {
  if (!rsvpId) return { success: false, error: 'rsvpId is required' };
  const supabase = getSupabaseClient();

  const { data: rsvp, error: rsvpError } = await supabase
    .from('rsvps')
    .select('id, member_id, event_id, status, events ( id, semester_id, category, starts_at, name )')
    .eq('id', rsvpId)
    .maybeSingle();
  if (rsvpError) return { success: false, error: rsvpError.message };
  if (!rsvp) return { success: false, error: `RSVP ${rsvpId} not found` };
  if (expectedMemberId && rsvp.member_id !== expectedMemberId) {
    return { success: false, error: 'RSVP does not belong to the specified member' };
  }

  const event = rsvp.events;
  if (!event) return { success: false, error: `Event for RSVP ${rsvpId} not found` };

  const { error: updateError } = await supabase
    .from('rsvps')
    .update({ status: 'cancelled' })
    .eq('id', rsvpId);
  if (updateError) return { success: false, error: updateError.message };

  const hoursUntilStart = (new Date(event.starts_at).getTime() - Date.now()) / (1000 * 60 * 60);
  const isLate = hoursUntilStart <= LATE_CANCEL_WINDOW_HOURS;

  if (isLate) {
    const { error: ledgerError } = await supabase.from('points_ledger').insert({
      member_id: rsvp.member_id,
      semester_id: event.semester_id,
      event_id: event.id,
      category: event.category,
      delta: LATE_CANCEL_PENALTY,
      note: 'Late cancellation penalty',
    });
    if (ledgerError) return { success: false, error: ledgerError.message };
  }

  const { error: notifError } = await supabase.from('notifications').insert({
    member_id: rsvp.member_id,
    title: 'RSVP cancelled',
    body: isLate
      ? `Your cancellation for "${event.name}" was within 24 hours of the event and resulted in a ${Math.abs(LATE_CANCEL_PENALTY)}-point penalty.`
      : `Your RSVP for "${event.name}" has been cancelled.`,
  });
  if (notifError) return { success: false, error: notifError.message };

  return { success: true };
}

export const handler = wrapAuthedHandler(
  recordLateCancel,
  (payload) => [payload.rsvpId, payload.memberId],
  (payload) => payload.memberId,
);
