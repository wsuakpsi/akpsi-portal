import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';

// Spec 10.1: warn if the current active semester still has scheduled
// events, require explicit confirmation to proceed. The actual is_active
// flip on the previous semester is a DB trigger (migration 0009,
// `semesters_flip_active`) per the spec's own wording — this function only
// inserts the new row with `is_active = true` and lets the trigger do the
// rest, so there's no risk of this Lambda's own insert racing/duplicating
// what the trigger already guarantees.
export async function createSemester(name, startDate, endDate, { confirm = false } = {}) {
  if (!name || !startDate || !endDate) {
    return { success: false, error: 'name, startDate, and endDate are required' };
  }
  const supabase = getSupabaseClient();

  const { data: currentActive, error: activeError } = await supabase
    .from('semesters')
    .select('id, name')
    .eq('is_active', true)
    .maybeSingle();
  if (activeError) return { success: false, error: activeError.message };

  if (currentActive && !confirm) {
    const { count, error: countError } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('semester_id', currentActive.id)
      .eq('status', 'scheduled');
    if (countError) return { success: false, error: countError.message };

    if (count > 0) {
      return {
        success: false,
        error: 'active_semester_has_scheduled_events',
        activeSemesterName: currentActive.name,
        scheduledEventsCount: count,
      };
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('semesters')
    .insert({ name, start_date: startDate, end_date: endDate, is_active: true })
    .select('id, name, start_date, end_date, is_active')
    .single();
  if (insertError) return { success: false, error: insertError.message };

  return { success: true, semester: inserted };
}

export const handler = wrapEboardHandler(createSemester, (payload) => [
  payload.name,
  payload.startDate,
  payload.endDate,
  { confirm: Boolean(payload.confirm) },
]);
