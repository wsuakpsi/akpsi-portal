import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';

// points_ledger.category defaults to 'adjustment' for manually-posted rows,
// but an officer can tag a specific category (e.g. 'fundraising') so the
// points count toward that category's standing threshold, not just the
// overall total — see calculateEndOfSemesterStanding.js.
const ALLOWED_CATEGORIES = [
  'adjustment',
  'professional',
  'service',
  'fundraising',
  'social',
  'rush',
  'extra',
  'meeting',
];

export async function postManualPointAdjustment(memberId, semesterId, delta, note, createdBy, category = 'adjustment') {
  if (!memberId || !semesterId || !createdBy) {
    return { success: false, error: 'memberId, semesterId, and createdBy are required' };
  }
  if (!note || !note.trim()) {
    return { success: false, error: 'note is required for manual point adjustments' };
  }
  if (!Number.isInteger(delta)) {
    return { success: false, error: 'delta must be an integer' };
  }
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return { success: false, error: `category must be one of: ${ALLOWED_CATEGORIES.join(', ')}` };
  }

  const supabase = getSupabaseClient();

  const { error: insertError } = await supabase.from('points_ledger').insert({
    member_id: memberId,
    semester_id: semesterId,
    category,
    delta,
    note,
    created_by: createdBy,
  });
  if (insertError) return { success: false, error: insertError.message };

  const { error: notifError } = await supabase.from('notifications').insert({
    member_id: memberId,
    title: 'Manual point adjustment',
    body: `A manual point adjustment of ${delta > 0 ? '+' : ''}${delta} (${category}) was applied: ${note}`,
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
  payload.category || 'adjustment',
]);
