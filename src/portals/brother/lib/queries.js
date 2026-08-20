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

export async function getLeaderboard(semesterId) {
  const { data, error } = await supabase.rpc('get_leaderboard', { p_semester_id: semesterId })
  if (error) throw error
  return data || []
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
