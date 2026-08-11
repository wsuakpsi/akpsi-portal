import { supabase } from './supabase'

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export async function getMyProfile() {
  const session = await getSession()
  if (!session) return null

  const { data, error } = await supabase
    .from('members')
    .select('id, full_name, role, status, eboard_position')
    .eq('id', session.user.id)
    .single()

  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
