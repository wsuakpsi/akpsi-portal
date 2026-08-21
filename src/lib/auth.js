import { supabase } from './supabase'

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export async function getMyProfile() {
  const session = await getSession()
  if (!session) return null

  // Try matching by UID first (normal case)
  const { data, error } = await supabase
    .from('members')
    .select('id, full_name, email, role, status, pledge_class, eboard_position')
    .eq('id', session.user.id)
    .maybeSingle()

  if (error) throw error

  if (data) return data

  // First login after invite — no UID yet, match by email and link the UID
  const { data: byEmail, error: emailError } = await supabase
    .from('members')
    .select('id, full_name, email, role, status, pledge_class, eboard_position')
    .eq('email', session.user.email)
    .is('id', null)
    .maybeSingle()

  if (emailError) throw emailError
  if (!byEmail) return null

  const { error: updateError } = await supabase
    .from('members')
    .update({ id: session.user.id })
    .eq('email', session.user.email)
    .is('id', null)

  if (updateError) throw updateError

  return { ...byEmail, id: session.user.id }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
