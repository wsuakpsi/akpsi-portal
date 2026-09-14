// PostgREST caps every response at 1000 rows (Supabase's default
// max-rows) and does so silently — no error, just a short result. Any query
// that can grow with members × events must page. `build` receives the base
// query and returns it with filters applied; ordering is added here so pages
// are stable.
const PAGE_SIZE = 1000;

export async function selectAllRows(build, orderColumn = 'id') {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().order(orderColumn).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}
