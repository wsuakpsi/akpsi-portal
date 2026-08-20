import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';

// Spec 7.4 cancellation cascade: cancelling a required event voids any
// already-approved missing_meeting_forms tied to it (the excused absence is
// returned — voided forms don't count against the 2-excused allowance) and
// notifies the affected brothers. Only 'approved' forms are touched: pending
// ones are still awaiting a decision and denied ones already stand.
export async function cancelEvent(eventId) {
  if (!eventId) return { success: false, error: 'eventId is required' };
  const supabase = getSupabaseClient();

  const { data: eventRow, error: eventFetchError } = await supabase
    .from('events')
    .select('id, name, status')
    .eq('id', eventId)
    .maybeSingle();
  if (eventFetchError) return { success: false, error: eventFetchError.message };
  if (!eventRow) return { success: false, error: `Event ${eventId} not found` };
  if (eventRow.status !== 'scheduled') {
    return { success: false, error: `Event ${eventId} is not scheduled (status: ${eventRow.status})` };
  }

  const { error: updateError } = await supabase
    .from('events')
    .update({ status: 'cancelled' })
    .eq('id', eventId);
  if (updateError) return { success: false, error: updateError.message };

  const { data: approvedForms, error: formsError } = await supabase
    .from('missing_meeting_forms')
    .select('id, member_id')
    .eq('event_id', eventId)
    .eq('status', 'approved');
  if (formsError) return { success: false, error: formsError.message };

  if (approvedForms.length > 0) {
    const { error: voidError } = await supabase
      .from('missing_meeting_forms')
      .update({ status: 'voided' })
      .in(
        'id',
        approvedForms.map((f) => f.id),
      );
    if (voidError) return { success: false, error: voidError.message };

    const notifications = approvedForms.map((f) => ({
      member_id: f.member_id,
      title: 'Event cancelled',
      body: `"${eventRow.name}" was cancelled. Your excused absence for it has been removed and no longer counts against your allowance.`,
    }));
    const { error: notifError } = await supabase.from('notifications').insert(notifications);
    if (notifError) return { success: false, error: notifError.message };
  }

  return { success: true, formsVoided: approvedForms.length };
}

export const handler = wrapEboardHandler(cancelEvent, (payload) => [payload.eventId]);
