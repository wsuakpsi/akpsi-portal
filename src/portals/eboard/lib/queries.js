import { supabase } from '../../../lib/supabase'

export async function getActiveSemester() {
  const { data, error } = await supabase
    .from('semesters')
    .select('*')
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw error
  return data
}

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export const POINT_CATEGORIES = ['professional', 'service', 'fundraising', 'social']

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
