// Temporary test data for the recruitment portal (VITE_PORTAL=recruitment).
// Run with: npm run seed:recruitment
// Remove everything this script created with: npm run unseed:recruitment
//
// Every seeded application gets access_id starting with "SEED-" so it's
// trivially distinguishable from a real applicant and safe to bulk-delete.
// Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS (server-only, never VITE_-prefixed).

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

// A minimal but valid single blank-page PDF, so "View" links open something
// real instead of erroring on a corrupt file.
const PLACEHOLDER_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n' +
    'trailer<</Root 1 0 R>>',
)

// 1x1 transparent PNG.
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

const applicants = [
  {
    full_name: 'Jordan Ellis',
    pronouns: 'she/her',
    standing: 'Freshman',
    graduation_year: 'May 2029',
    gpa: '3.8',
    majors: 'Finance',
    minors: 'N/A',
    how_heard: 'Involvement fair',
    late_class_days: ['None'],
    plans_to_transfer: 'No',
  },
  {
    full_name: 'Marcus Webb',
    pronouns: 'he/him',
    standing: 'Sophomore',
    graduation_year: 'May 2028',
    gpa: '3.4',
    majors: 'Marketing',
    minors: 'Communications',
    how_heard: 'A friend in the chapter',
    late_class_days: ['Tuesday', 'Thursday'],
    plans_to_transfer: 'No',
  },
  {
    full_name: 'Priya Nair',
    pronouns: 'she/her',
    standing: 'Freshman',
    graduation_year: 'December 2028',
    gpa: '3.95',
    majors: 'Accounting',
    minors: 'Data Science',
    how_heard: 'Instagram',
    late_class_days: ['None'],
    plans_to_transfer: 'Maybe',
    transfer_to_details: 'Considering a 4+1 program elsewhere, not decided.',
    decision: 'accepted',
  },
  {
    full_name: 'Diego Fuentes',
    pronouns: 'he/him',
    standing: 'Junior',
    graduation_year: 'May 2027',
    gpa: '3.1',
    majors: 'Supply Chain Management',
    minors: 'N/A',
    how_heard: 'Class announcement',
    late_class_days: ['Monday'],
    plans_to_transfer: 'No',
    ever_transferred: true,
    transfer_from_details: 'Transferred from a community college after freshman year.',
    decision: 'waitlisted',
  },
  {
    full_name: 'Ava Lindqvist',
    pronouns: 'she/her',
    standing: 'Sophomore',
    graduation_year: 'December 2027',
    gpa: '3.6',
    majors: 'Business Analytics',
    minors: 'Economics',
    how_heard: 'Career fair',
    late_class_days: ['Wednesday'],
    plans_to_transfer: 'No',
  },
  {
    full_name: 'Tyler Brooks',
    pronouns: 'he/him',
    standing: 'Freshman',
    graduation_year: 'May 2029',
    gpa: '2.9',
    majors: 'Undeclared Business',
    minors: 'N/A',
    how_heard: 'Word of mouth',
    late_class_days: ['None'],
    plans_to_transfer: 'No',
    decision: 'rejected',
  },
]

async function upload(id, kind, buffer, contentType, ext) {
  const path = `${id}/${kind}.${ext}`
  const { error } = await supabase.storage.from('rush-applications').upload(path, buffer, {
    contentType,
    upsert: true,
  })
  if (error) throw error
  return path
}

async function main() {
  console.log('Looking up demo voter accounts (Samaksh, Test Brother, Test brother 2)...')
  const { data: voters, error: votersError } = await supabase
    .from('members')
    .select('id, full_name, email')
    .in('email', ['samaksharora.09@gmail.com', 'wsuakpsi15@gmail.com', 'test@testmail.com'])
  if (votersError) throw votersError
  const eboardVoter = voters.find((v) => v.email === 'samaksharora.09@gmail.com')

  console.log('Removing any previously seeded applications (access_id starting with SEED-)...')
  const { data: existing } = await supabase
    .from('rush_applications')
    .select('id')
    .like('access_id', 'SEED-%')
  if (existing?.length) {
    const ids = existing.map((r) => r.id)
    await Promise.all(
      ids.map((appId) =>
        supabase.storage
          .from('rush-applications')
          .remove([`${appId}/resume.pdf`, `${appId}/cover-letter.pdf`, `${appId}/headshot.png`]),
      ),
    )
    await supabase.from('rush_applications').delete().in('id', ids)
    console.log(`Removed ${ids.length} previously seeded application(s).`)
  }

  console.log(`Seeding ${applicants.length} test applications...`)
  for (const [i, a] of applicants.entries()) {
    const id = crypto.randomUUID()
    const [resumePath, coverLetterPath, headshotPath] = await Promise.all([
      upload(id, 'resume', PLACEHOLDER_PDF, 'application/pdf', 'pdf'),
      upload(id, 'cover-letter', PLACEHOLDER_PDF, 'application/pdf', 'pdf'),
      upload(id, 'headshot', PLACEHOLDER_PNG, 'image/png', 'png'),
    ])

    const decision = a.decision || 'pending'
    const { error: insertError } = await supabase.from('rush_applications').insert({
      id,
      full_name: a.full_name,
      pronouns: a.pronouns,
      access_id: `SEED-${String(i + 1).padStart(2, '0')}`,
      wayne_state_email: `${a.full_name.toLowerCase().replace(/\s+/g, '.')}@wayne.edu`,
      alternate_email: `${a.full_name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      standing: a.standing,
      graduation_year: a.graduation_year,
      gpa: a.gpa,
      majors: a.majors,
      minors: a.minors,
      resume_path: resumePath,
      cover_letter_path: coverLetterPath,
      headshot_path: headshotPath,
      ever_transferred: a.ever_transferred || false,
      transfer_from_details: a.transfer_from_details || null,
      plans_to_transfer: a.plans_to_transfer,
      transfer_to_details: a.transfer_to_details || null,
      title_ix_violation: false,
      felony_conviction: false,
      how_heard: a.how_heard,
      late_class_days: a.late_class_days,
      additional_comments: null,
    })
    if (insertError) throw insertError

    if (decision !== 'pending' && eboardVoter) {
      const { error: decisionError } = await supabase.from('rush_application_decisions').insert({
        application_id: id,
        decision,
        decided_by: eboardVoter.id,
        decided_at: new Date().toISOString(),
      })
      if (decisionError) throw decisionError
    }

    // A couple of demo votes/comments so the live tally + thread aren't empty.
    if (voters.length > 0) {
      const votesToCast = voters.slice(0, i % voters.length === 0 ? voters.length : (i % 3) + 1)
      const voteValues = ['yes', 'no', 'maybe']
      const voteRows = votesToCast.map((voter, vi) => ({
        application_id: id,
        member_id: voter.id,
        vote: voteValues[(i + vi) % 3],
      }))
      await supabase.from('rush_application_votes').upsert(voteRows, { onConflict: 'application_id,member_id' })

      if (eboardVoter) {
        await supabase.from('rush_application_comments').insert({
          application_id: id,
          member_id: eboardVoter.id,
          body: `Test comment on ${a.full_name}'s application — seed data, safe to delete.`,
        })
      }
    }

    console.log(`  + ${a.full_name} (${decision})`)
  }

  console.log('\nDone. Sign into the recruitment portal as samaksharora.09@gmail.com to see it:')
  console.log('  npm run dev:recruitment   (http://localhost:5181)')
  console.log('\nClean up any time with: npm run unseed:recruitment')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
