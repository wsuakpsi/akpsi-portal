import { supabase } from './supabase'

// PostgREST silently caps every response at 1000 rows (Supabase default).
// Use this for any query that scales with members × events. `build` returns
// the filtered query; ordering is applied here so pages are stable.
const PAGE_SIZE = 1000

export async function selectAllRows(build, orderColumn = 'id') {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(supabase).order(orderColumn).range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE_SIZE) return rows
  }
}
