import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';

// points_ledger.category is always 'adjustment' for manually-posted rows;
// there is no category param — the note is where the officer explains it.
export async function postManualPointAdjustment(memberId, semesterId, delta, note, createdBy) {
  if (!memberId || !semesterId || !createdBy) {
    return { success: false, error: 'memberId, semesterId, and createdBy are required' };
  }
  if (!note || !note.trim()) {
    return { success: false, error: 'note is required for manual point adjustments' };
  }
  if (!Number.isInteger(delta)) {
    return { success: false, error: 'delta must be an integer' };
  }

  const supabase = getSupabaseClient();

  const { error: insertError } = await supabase.from('points_ledger').insert({
    member_id: memberId,
    semester_id: semesterId,
    category: 'adjustment',
    delta,
    note,
    created_by: createdBy,
  });
  if (insertError) return { success: false, error: insertError.message };

  const { error: notifError } = await supabase.from('notifications').insert({
    member_id: memberId,
    title: 'Manual point adjustment',
    body: `A manual point adjustment of ${delta > 0 ? '+' : ''}${delta} was applied: ${note}`,
  });
  if (notifError) return { success: false, error: notifError.message };

  return { success: true };
}

export const handler = wrapEboardHandler(postManualPointAdjustment, (payload, caller) => [
  payload.memberId,
  payload.semesterId,
  payload.delta,
  payload.note,
  caller.id,
]);
