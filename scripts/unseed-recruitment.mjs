// Removes everything scripts/seed-recruitment.mjs created — every application
// whose access_id starts with "SEED-", plus its uploaded files.
// Run with: npm run unseed:recruitment

import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const { data: existing, error } = await supabase
    .from('rush_applications')
    .select('id, full_name')
    .like('access_id', 'SEED-%')
  if (error) throw error

  if (!existing?.length) {
    console.log('No seeded applications found — nothing to do.')
    return
  }

  console.log(`Removing ${existing.length} seeded application(s)...`)
  await Promise.all(
    existing.map((row) =>
      supabase.storage
        .from('rush-applications')
        .remove([`${row.id}/resume.pdf`, `${row.id}/cover-letter.pdf`, `${row.id}/headshot.png`]),
    ),
  )
  const { error: deleteError } = await supabase
    .from('rush_applications')
    .delete()
    .in('id', existing.map((r) => r.id))
  if (deleteError) throw deleteError

  for (const row of existing) console.log(`  - ${row.full_name}`)
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
