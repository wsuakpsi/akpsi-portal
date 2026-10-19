// One-time backfill: creates a 256px thumbnail and a 1024px display headshot
// for applications submitted before migration 0041.
//
//   DRY RUN (default, writes nothing):
//     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-headshot-variants.mjs
//   APPLY:
//     ... node scripts/backfill-headshot-variants.mjs --apply --confirm-project-ref=<ref from the URL>
//
// Safety properties:
//   - Secrets come from environment variables only. This script deliberately
//     does NOT read .env.local (which points at production).
//   - Never deletes or overwrites: variants are uploaded with upsert:false at new
//     paths; "already exists" counts as done. The row update only fills a column
//     that is currently NULL.
//   - Idempotent: rows that already have both variant paths are skipped, and a
//     re-run after a partial failure picks up where it stopped.
//   - Downloads each original headshot once (a one-time egress cost of roughly
//     rows x ~300 KB). Dry-run downloads nothing.

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const BUCKET_NAME = 'rush-applications'
const IMMUTABLE_CACHE_CONTROL_SECONDS = '31536000'
const THUMBNAIL_MAX_EDGE_PIXELS = 256
const THUMBNAIL_TARGET_MAX_BYTES = 30 * 1024
const DISPLAY_MAX_EDGE_PIXELS = 1024
const DISPLAY_TARGET_MAX_BYTES = 300 * 1024

const shouldApplyChanges = process.argv.includes('--apply')
const confirmedProjectRef = process.argv.find((arg) => arg.startsWith('--confirm-project-ref='))?.split('=')[1]
const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.')
  process.exit(1)
}
const projectRefFromUrl = new URL(supabaseUrl).hostname.split('.')[0]
console.log(`Target: ${new URL(supabaseUrl).host}  mode: ${shouldApplyChanges ? 'APPLY' : 'DRY RUN (no changes)'}`)
if (shouldApplyChanges && confirmedProjectRef !== projectRefFromUrl) {
  console.error(`Refusing to apply: pass --confirm-project-ref=${projectRefFromUrl} to confirm this is the intended project.`)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

async function encodeJpegWithinByteBudget(originalImageBytes, maxEdgePixels, maxBytes) {
  for (let jpegQuality = 80; jpegQuality >= 40; jpegQuality -= 10) {
    const encodedBytes = await sharp(originalImageBytes)
      .rotate() // honour EXIF orientation
      .resize({ width: maxEdgePixels, height: maxEdgePixels, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: jpegQuality, mozjpeg: true })
      .toBuffer()
    if (encodedBytes.length <= maxBytes || jpegQuality === 40) return encodedBytes
  }
}

async function uploadImmutableVariant(storagePath, jpegBytes) {
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(storagePath, jpegBytes, {
    contentType: 'image/jpeg',
    cacheControl: IMMUTABLE_CACHE_CONTROL_SECONDS,
    upsert: false,
  })
  const alreadyExists = error && /already exists|Duplicate|409/i.test(`${error.message} ${error.statusCode ?? ''}`)
  if (error && !alreadyExists) throw error
}

const { data: applicationsMissingVariants, error: listError } = await supabase
  .from('rush_applications')
  .select('id, headshot_path, headshot_thumbnail_path, headshot_display_path')
  .is('deleted_at', null)
  .or('headshot_thumbnail_path.is.null,headshot_display_path.is.null')
  .order('created_at', { ascending: true })
if (listError) throw listError

console.log(`${applicationsMissingVariants.length} application(s) need variants.`)
let succeededCount = 0
let failedCount = 0

for (const application of applicationsMissingVariants) {
  const thumbnailStoragePath = application.headshot_thumbnail_path ?? `${application.id}/headshot-thumbnail-256.jpg`
  const displayStoragePath = application.headshot_display_path ?? `${application.id}/headshot-display-1024.jpg`
  if (!shouldApplyChanges) {
    console.log(`[dry-run] ${application.id}: would create ${thumbnailStoragePath} and ${displayStoragePath} from ${application.headshot_path}`)
    continue
  }
  try {
    const { data: originalBlob, error: downloadError } = await supabase.storage.from(BUCKET_NAME).download(application.headshot_path)
    if (downloadError) throw downloadError
    const originalImageBytes = Buffer.from(await originalBlob.arrayBuffer())

    const thumbnailBytes = await encodeJpegWithinByteBudget(originalImageBytes, THUMBNAIL_MAX_EDGE_PIXELS, THUMBNAIL_TARGET_MAX_BYTES)
    const displayBytes = await encodeJpegWithinByteBudget(originalImageBytes, DISPLAY_MAX_EDGE_PIXELS, DISPLAY_TARGET_MAX_BYTES)
    await uploadImmutableVariant(thumbnailStoragePath, thumbnailBytes)
    await uploadImmutableVariant(displayStoragePath, displayBytes)

    // Only fills NULL columns; never replaces a path that is already set.
    for (const [columnName, storagePath] of [
      ['headshot_thumbnail_path', thumbnailStoragePath],
      ['headshot_display_path', displayStoragePath],
    ]) {
      const { error: updateError } = await supabase
        .from('rush_applications')
        .update({ [columnName]: storagePath })
        .eq('id', application.id)
        .is(columnName, null)
      if (updateError) throw updateError
    }
    succeededCount += 1
    console.log(`ok ${application.id}: thumbnail ${(thumbnailBytes.length / 1024).toFixed(1)} KB, display ${(displayBytes.length / 1024).toFixed(1)} KB`)
  } catch (err) {
    failedCount += 1
    console.error(`FAILED ${application.id}: ${err.message}`)
  }
}

console.log(shouldApplyChanges ? `Done. ${succeededCount} succeeded, ${failedCount} failed.` : 'Dry run complete. Re-run with --apply --confirm-project-ref=<ref> to write.')
process.exit(failedCount > 0 ? 1 : 0)
