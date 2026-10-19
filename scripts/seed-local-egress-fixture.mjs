// LOCAL-ONLY fixture for egress measurement. Seeds fake applicants with
// realistically heavy files (headshot ~3 MB, resume ~1 MB, cover letter ~0.5 MB)
// plus one fake E-Board login. Refuses to run against anything but localhost.
//
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local key> \
//     node scripts/seed-local-egress-fixture.mjs [--count=100] [--with-variants]
//
// Without --with-variants the rows look like pre-0041 data (the "before" state).
// Variants are normally produced by scripts/backfill-headshot-variants.mjs.

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
if (!['127.0.0.1', 'localhost'].includes(new URL(supabaseUrl).hostname)) {
  throw new Error(`Refusing to seed non-local project ${new URL(supabaseUrl).host}`)
}
const applicantCount = Number(process.argv.find((a) => a.startsWith('--count='))?.split('=')[1] ?? 100)

export const LOCAL_FIXTURE_EBOARD_EMAIL = 'local-eboard@example.test'
export const LOCAL_FIXTURE_EBOARD_PASSWORD = 'local-fixture-password-1'

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

async function createFakeHeadshotJpeg(seed, width = 2400, height = 3200) {
  const rawPixels = Buffer.alloc(width * height * 3)
  let randomState = seed * 2654435761 >>> 0
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex++) {
    const x = pixelIndex % width, y = (pixelIndex / width) | 0
    randomState = (randomState * 1664525 + 1013904223) >>> 0
    const noise = (randomState >>> 24) % 28 - 14
    rawPixels[pixelIndex * 3] = Math.max(0, Math.min(255, 90 + (x / width) * 120 + noise))
    rawPixels[pixelIndex * 3 + 1] = Math.max(0, Math.min(255, 80 + (y / height) * 120 + noise))
    rawPixels[pixelIndex * 3 + 2] = Math.max(0, Math.min(255, 140 + noise * 2))
  }
  return sharp(rawPixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 88 }).toBuffer()
}

function createFakePdf(targetBytes) {
  const header = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n'
  const padding = Buffer.alloc(Math.max(0, targetBytes - header.length - 40), 'x')
  return Buffer.concat([Buffer.from(header), Buffer.from('%'), padding, Buffer.from('\ntrailer<</Root 1 0 R>>')])
}

async function uploadFixtureFile(storagePath, bytes, contentType) {
  const { error } = await supabase.storage.from('rush-applications').upload(storagePath, bytes, { contentType, upsert: false })
  if (error && !/already exists/i.test(error.message)) throw error
}

// E-Board login (VP Membership so tallies and decisions render).
const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
  email: LOCAL_FIXTURE_EBOARD_EMAIL, password: LOCAL_FIXTURE_EBOARD_PASSWORD, email_confirm: true,
})
const eboardUserId = createdUser?.user?.id ?? (await supabase.auth.admin.listUsers()).data.users.find((u) => u.email === LOCAL_FIXTURE_EBOARD_EMAIL).id
if (createUserError && !/already/i.test(createUserError.message)) throw createUserError
const { error: memberError } = await supabase.from('members').upsert(
  { id: eboardUserId, email: LOCAL_FIXTURE_EBOARD_EMAIL, full_name: 'Local Fixture EBoard', pledge_class: 'Fixture', role: 'eboard', eboard_position: 'VP Membership', status: 'active' },
  { onConflict: 'id' },
)
if (memberError) throw memberError

const headshotBytesBySeed = await Promise.all([1, 2, 3, 4, 5].map((seed) => createFakeHeadshotJpeg(seed)))
console.log(`fixture headshot sizes MB: ${headshotBytesBySeed.map((b) => (b.length / 1048576).toFixed(2)).join(', ')}`)
const resumeBytes = createFakePdf(1024 * 1024)
const coverLetterBytes = createFakePdf(512 * 1024)

for (let applicantNumber = 1; applicantNumber <= applicantCount; applicantNumber++) {
  const applicationId = crypto.randomUUID()
  const fullName = `Fixture Applicant ${String(applicantNumber).padStart(3, '0')}`
  await Promise.all([
    uploadFixtureFile(`${applicationId}/resume.pdf`, resumeBytes, 'application/pdf'),
    uploadFixtureFile(`${applicationId}/cover-letter.pdf`, coverLetterBytes, 'application/pdf'),
    uploadFixtureFile(`${applicationId}/headshot.jpg`, headshotBytesBySeed[applicantNumber % 5], 'image/jpeg'),
  ])
  const { error } = await supabase.from('rush_applications').insert({
    id: applicationId, full_name: fullName, pronouns: 'they/them', access_id: `FIX-${applicantNumber}`,
    wayne_state_email: `fixture${applicantNumber}@example.test`, alternate_email: `fixture${applicantNumber}@example.test`,
    standing: ['Freshman', 'Sophomore', 'Junior'][applicantNumber % 3], graduation_year: 'May 2029', gpa: '3.5',
    majors: 'Finance', minors: 'None', resume_path: `${applicationId}/resume.pdf`,
    cover_letter_path: `${applicationId}/cover-letter.pdf`, headshot_path: `${applicationId}/headshot.jpg`,
    ever_transferred: false, plans_to_transfer: 'No', title_ix_violation: false, felony_conviction: false,
    how_heard: 'Fixture', late_class_days: ['None'], additional_comments: null,
  })
  if (error) throw error
  if (applicantNumber % 10 === 0) console.log(`seeded ${applicantNumber}/${applicantCount}`)
}
console.log('done')
