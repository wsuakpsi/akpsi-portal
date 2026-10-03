// One-off backfill: shrink existing avatars to cut Storage egress.
//
// Dry run (default, changes nothing):
//   node --env-file=.env.local scripts/resize-avatars.mjs
// Apply:
//   node --env-file=.env.local scripts/resize-avatars.mjs --apply
// Delete the old originals afterwards (only after you've checked the app):
//   node --env-file=.env.local scripts/resize-avatars.mjs --delete-originals
//
// For each member with an avatar_url it downloads the original, resizes it to
// 256px JPEG, uploads it to a NEW path (long cache header), then points
// members.avatar_url at it. Originals are left in place until
// --delete-originals, so the old URL keeps working if anything goes wrong.
// Members already pointing at a "-resized.jpg" file are skipped, so it is
// safe to re-run.
//
// Needs: npm i -D sharp   (and SUPABASE_SERVICE_ROLE_KEY in .env.local)

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'node:fs'

const BUCKET = 'avatars'
const MAX_SIZE = 256
const QUALITY = 82
const SKIP_UNDER_BYTES = 40 * 1024 // already small enough, leave alone
const BACKUP_DIR = 'scripts/.avatar-backup'

const apply = process.argv.includes('--apply')
const deleteOriginals = process.argv.includes('--delete-originals')

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Public URLs look like <url>/storage/v1/object/public/avatars/<path>
function pathFromUrl(avatarUrl) {
  const marker = `/object/public/${BUCKET}/`
  const i = avatarUrl.indexOf(marker)
  return i === -1 ? null : decodeURIComponent(avatarUrl.slice(i + marker.length).split('?')[0])
}

const mb = (n) => (n / 1024 / 1024).toFixed(2)

async function main() {
  const { data: members, error } = await supabase
    .from('members')
    .select('id, full_name, avatar_url')
    .not('avatar_url', 'is', null)
  if (error) throw error

  if (deleteOriginals) return removeOriginals(members)

  console.log(`${apply ? 'APPLYING' : 'DRY RUN'}: ${members.length} members with avatars\n`)
  if (apply) mkdirSync(BACKUP_DIR, { recursive: true })

  let before = 0
  let after = 0
  let changed = 0

  for (const m of members) {
    const oldPath = pathFromUrl(m.avatar_url)
    if (!oldPath) {
      console.log(`SKIP  ${m.full_name}: unrecognised URL`)
      continue
    }
    if (oldPath.endsWith('-resized.jpg')) {
      console.log(`SKIP  ${m.full_name}: already resized`)
      continue
    }

    const { data: blob, error: dlError } = await supabase.storage.from(BUCKET).download(oldPath)
    if (dlError) {
      console.log(`FAIL  ${m.full_name}: download: ${dlError.message}`)
      continue
    }
    const original = Buffer.from(await blob.arrayBuffer())
    before += original.length

    if (original.length < SKIP_UNDER_BYTES) {
      after += original.length
      console.log(`SKIP  ${m.full_name}: ${mb(original.length)} MB is already small`)
      continue
    }

    let resized
    try {
      resized = await sharp(original)
        .rotate() // apply EXIF orientation
        .resize(MAX_SIZE, MAX_SIZE, { fit: 'cover' })
        .flatten({ background: '#ffffff' }) // transparent PNGs -> white, not black
        .jpeg({ quality: QUALITY })
        .toBuffer()
    } catch (err) {
      console.log(`FAIL  ${m.full_name}: could not decode: ${err.message}`)
      after += original.length
      continue
    }
    after += resized.length
    console.log(`${apply ? 'DONE ' : 'WOULD'} ${m.full_name}: ${mb(original.length)} MB -> ${mb(resized.length)} MB`)
    if (!apply) continue

    // Local backup of the original, in case it needs restoring.
    writeFileSync(`${BACKUP_DIR}/${m.id}-${oldPath.split('/').pop()}`, original)

    const newPath = `${m.id}/${Date.now()}-resized.jpg`
    const { error: upError } = await supabase.storage.from(BUCKET).upload(newPath, resized, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: false,
    })
    if (upError) {
      console.log(`FAIL  ${m.full_name}: upload: ${upError.message}`)
      continue
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(newPath)
    const { error: updError } = await supabase.from('members').update({ avatar_url: pub.publicUrl }).eq('id', m.id)
    if (updError) {
      console.log(`FAIL  ${m.full_name}: members update: ${updError.message} (new file uploaded at ${newPath})`)
      continue
    }
    changed += 1
  }

  console.log(`\nTotal: ${mb(before)} MB -> ${mb(after)} MB (${apply ? `${changed} members updated` : 'nothing changed'})`)
  if (!apply) console.log('Re-run with --apply to do it.')
}

// Deletes every object in the bucket that no member's avatar_url points to.
// Run only after confirming the app looks right.
async function removeOriginals(members) {
  const inUse = new Set(members.map((m) => pathFromUrl(m.avatar_url)).filter(Boolean))
  const { data: folders, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000 })
  if (error) throw error

  const stale = []
  for (const folder of folders) {
    const { data: files, error: listError } = await supabase.storage.from(BUCKET).list(folder.name, { limit: 1000 })
    if (listError) throw listError
    for (const f of files) {
      const path = `${folder.name}/${f.name}`
      if (!inUse.has(path)) stale.push(path)
    }
  }

  console.log(`${stale.length} objects not referenced by any member`)
  stale.forEach((p) => console.log(`  ${p}`))
  if (!apply) return console.log('\nDry run. Add --apply with --delete-originals to delete them.')
  const { error: rmError } = await supabase.storage.from(BUCKET).remove(stale)
  if (rmError) throw rmError
  console.log('Deleted.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
