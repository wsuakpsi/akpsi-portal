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

  // First login after invite — check pending_invites, promote to members.
  // Match case-insensitively: Supabase Auth always lowercases session.user.email,
  // but older/manually-entered pending_invites rows may not be lowercase.
  const { data: pending, error: pendingError } = await supabase
    .from('pending_invites')
    .select('email, full_name, pledge_class, role, status, first_semester_initiated')
    .ilike('email', session.user.email)
    .maybeSingle()

  if (pendingError) throw pendingError
  if (!pending) {
    const err = new Error('No pending invite found for this account.')
    err.code = 'no_pending_invite'
    throw err
  }

  const newMember = {
    id: session.user.id,
    email: pending.email,
    full_name: pending.full_name,
    pledge_class: pending.pledge_class,
    role: pending.role,
    status: pending.status,
    eboard_position: null,
    first_semester_initiated: pending.first_semester_initiated || null,
  }

  const { error: insertError } = await supabase.from('members').insert(newMember)
  if (insertError) {
    insertError.isPromotionFailure = true
    throw insertError
  }

  // Use the same case-insensitive match as the lookup above, so a
  // mixed-case pending_invites row still gets cleaned up.
  await supabase.from('pending_invites').delete().ilike('email', session.user.email)

  return newMember
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
