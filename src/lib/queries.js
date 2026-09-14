import { supabase } from './supabase'

// Shared between both portals (each portal's lib/queries.js re-exports these
// so existing imports keep working).

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

// "Jane Q Brother" -> "JB". Tolerates empty names and double spaces.
export function initials(name) {
  if (!name) return '?'
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || '?'
  )
}
