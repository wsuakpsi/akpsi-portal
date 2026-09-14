import { supabase } from '../../../lib/supabase'

export { getActiveSemester, formatDateTime, formatDate } from '../../../lib/queries'

export async function getLeaderboard(semesterId) {
  const { data, error } = await supabase.rpc('get_leaderboard', { p_semester_id: semesterId })
  if (error) throw error
  return data || []
}
