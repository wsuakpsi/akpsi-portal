import { supabase } from '../../../lib/supabase'

export { getActiveSemester, formatDateTime, formatDate, initials } from '../../../lib/queries'

export const POINT_CATEGORIES = ['professional', 'service', 'fundraising', 'social']

// Rush and extra points count toward a brother's total but aren't tied to a
// standing threshold (see STANDARD_THRESHOLDS/LOWER_THRESHOLDS below), so
// they're kept out of POINT_CATEGORIES and tracked separately.
export const EXTRA_POINT_CATEGORIES = ['rush', 'extra']

export const EVENT_CATEGORIES = ['professional', 'service', 'fundraising', 'social', 'rush', 'extra', 'meeting']

// Converts an ISO timestamp to the value a <input type="datetime-local"> expects, in local time.
export function toDatetimeLocalValue(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Mirrors lambdas/src/lib/thresholds.js defaults, for display purposes only.
export const STANDARD_THRESHOLDS = { professional: 40, service: 20, fundraising: 20, social: 20, total: 100 }
export const LOWER_THRESHOLDS = { professional: 20, service: 10, fundraising: 10, social: 10, total: 50 }

export async function getSidebarBadgeCounts() {
  const [mmfRes, ltaRes] = await Promise.all([
    supabase.from('missing_meeting_forms').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase
      .from('lower_threshold_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ])
  if (mmfRes.error) throw mmfRes.error
  if (ltaRes.error) throw ltaRes.error

  return {
    forms: (mmfRes.count || 0) + (ltaRes.count || 0),
  }
}

// Turns a completeEvent Lambda result into a one-line summary for the toast,
// e.g. "Marked complete. 58 present, 20 unexcused, 2 excused."
export function completionSummary(prefix, result) {
  if (!result) return prefix
  if (result.meetingSweep) {
    const { unexcused = 0, excused = 0 } = result.meetingSweep
    return `${prefix} ${result.attended ?? 0} present, ${unexcused} unexcused, ${excused} excused.`
  }
  return `${prefix} ${result.attended ?? 0} attended, ${result.noShows ?? 0} no-show${result.noShows === 1 ? '' : 's'}.`
}
