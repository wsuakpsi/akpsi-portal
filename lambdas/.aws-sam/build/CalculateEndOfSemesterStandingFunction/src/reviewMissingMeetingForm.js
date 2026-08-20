import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';

const VALID_DECISIONS = new Set(['approved', 'denied']);

export async function reviewMissingMeetingForm(formId, decision, reviewedBy) {
  if (!formId || !decision || !reviewedBy) {
    return { success: false, error: 'formId, decision, and reviewedBy are required' };
  }
  if (!VALID_DECISIONS.has(decision)) {
    return { success: false, error: `decision must be one of: ${[...VALID_DECISIONS].join(', ')}` };
  }
  const supabase = getSupabaseClient();

  const { data: form, error: fetchError } = await supabase
    .from('missing_meeting_forms')
    .select('id, member_id, event_id, status')
    .eq('id', formId)
    .maybeSingle();
  if (fetchError) return { success: false, error: fetchError.message };
  if (!form) return { success: false, error: `Missing meeting form ${formId} not found` };
  if (form.status !== 'pending') {
    return { success: false, error: `Form ${formId} has already been reviewed` };
  }

  const { error: updateError } = await supabase
    .from('missing_meeting_forms')
    .update({ status: decision, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq('id', formId);
  if (updateError) return { success: false, error: updateError.message };

  if (decision === 'approved') {
    const { error: attendanceError } = await supabase
      .from('meeting_attendance')
      .upsert(
        { event_id: form.event_id, member_id: form.member_id, status: 'excused' },
        { onConflict: 'event_id,member_id' }
      );
    if (attendanceError) return { success: false, error: attendanceError.message };
  }

  const { error: notifError } = await supabase.from('notifications').insert({
    member_id: form.member_id,
    title: 'Missing meeting form reviewed',
    body: `Your missing meeting form has been ${decision}.`,
  });
  if (notifError) return { success: false, error: notifError.message };

  return { success: true };
}

export const handler = wrapEboardHandler(reviewMissingMeetingForm, (payload, caller) => [
  payload.formId,
  payload.decision,
  caller.id,
]);
