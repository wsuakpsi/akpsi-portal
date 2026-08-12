// Rich test dataset for E-Board portal manual testing.
// Run with: npm run seed:eboard
//
// Uses SUPABASE_SERVICE_ROLE_KEY (server-only, never VITE_-prefixed) to
// bypass RLS entirely. Safe to re-run — every insert is guarded so this
// script won't duplicate rows or violate the append-only / no-delete
// constraints on points_ledger and members.

import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const testEmail = process.env.SEED_EBOARD_EMAIL || 'samaksharora.09@gmail.com'

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function daysFromNow(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString()
}

async function main() {
  console.log(`Looking up auth user for ${testEmail}...`)
  const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 })
  if (listError) throw listError
  const authUser = usersPage.users.find((u) => u.email === testEmail)
  if (!authUser) {
    throw new Error(
      `No Supabase Auth user found for ${testEmail}. Create one first in Dashboard > Authentication > Users.`
    )
  }
  console.log(`Found auth user ${authUser.id}`)

  // 1. Members ---------------------------------------------------------
  const members = [
    { id: authUser.id, email: testEmail, full_name: 'Test Eboard', pledge_class: 'Fall 2022', role: 'eboard', eboard_position: 'VP Technology', status: 'active' },
    { email: 'alex.chen@akpsi.test', full_name: 'Alex Chen', pledge_class: 'Fall 2023', role: 'brother', status: 'active' },
    { email: 'brianna.diaz@akpsi.test', full_name: 'Brianna Diaz', pledge_class: 'Fall 2023', role: 'brother', status: 'active' },
    { email: 'carlos.nguyen@akpsi.test', full_name: 'Carlos Nguyen', pledge_class: 'Spring 2024', role: 'brother', status: 'active' },
    { email: 'devon.park@akpsi.test', full_name: 'Devon Park', pledge_class: 'Spring 2024', role: 'brother', status: 'probation' },
    { email: 'elena.ruiz@akpsi.test', full_name: 'Elena Ruiz', pledge_class: 'Fall 2024', role: 'brother', status: 'active' },
    { email: 'farid.hassan@akpsi.test', full_name: 'Farid Hassan', pledge_class: 'Fall 2024', role: 'brother', status: 'active' },
    { email: 'grace.kim@akpsi.test', full_name: 'Grace Kim', pledge_class: 'Fall 2023', role: 'brother', status: 'suspended' },
    { email: 'henry.osei@akpsi.test', full_name: 'Henry Osei', pledge_class: 'Spring 2024', role: 'brother', status: 'active' },
    { email: 'isla.thompson@akpsi.test', full_name: 'Isla Thompson', pledge_class: 'Fall 2024', role: 'eboard', eboard_position: 'VP Finance', status: 'active' },
  ]

  console.log('Upserting members...')
  // PostgREST bulk upsert uses one fixed column set for the whole batch, so a
  // row missing "id" would otherwise serialize as an explicit null instead of
  // falling back to the column default — split the id-bearing row out.
  const [withId, withoutId] = [members.filter((m) => m.id), members.filter((m) => !m.id)]

  const { data: upsertedWithId, error: withIdError } = await supabase
    .from('members')
    .upsert(withId, { onConflict: 'id' })
    .select('id, email, full_name')
  if (withIdError) throw withIdError

  const { data: upsertedWithoutId, error: withoutIdError } = await supabase
    .from('members')
    .upsert(withoutId, { onConflict: 'email' })
    .select('id, email, full_name')
  if (withoutIdError) throw withoutIdError

  const upsertedMembers = [...upsertedWithId, ...upsertedWithoutId]

  const memberIdByEmail = Object.fromEntries(upsertedMembers.map((m) => [m.email, m.id]))
  const byName = (name) => {
    const m = upsertedMembers.find((row) => row.full_name === name)
    if (!m) throw new Error(`Member not found: ${name}`)
    return m.id
  }

  // 2. Active semester ---------------------------------------------------
  console.log('Ensuring active semester...')
  let { data: semester, error: semError } = await supabase
    .from('semesters')
    .select('*')
    .eq('is_active', true)
    .maybeSingle()
  if (semError) throw semError

  if (!semester) {
    const { data: newSemester, error: insertSemError } = await supabase
      .from('semesters')
      .upsert(
        {
          name: 'Seed Semester',
          start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          is_active: true,
        },
        { onConflict: 'name' }
      )
      .select()
      .single()
    if (insertSemError) throw insertSemError
    semester = newSemester
  }
  console.log(`Using semester "${semester.name}" (${semester.id})`)

  // 3. Events --------------------------------------------------------------
  const eventDefs = [
    { name: 'Meeting Week 1', category: 'meeting', points_value: 0, starts_at: daysFromNow(-21), status: 'completed' },
    { name: 'Meeting Week 2', category: 'meeting', points_value: 0, starts_at: daysFromNow(-14), status: 'completed' },
    { name: 'Meeting Week 3', category: 'meeting', points_value: 0, starts_at: daysFromNow(-7), status: 'completed' },
    { name: 'Meeting Week 4', category: 'meeting', points_value: 0, starts_at: daysFromNow(-3), status: 'completed' },
    { name: 'Chapter Meeting', category: 'meeting', points_value: 0, starts_at: daysFromNow(2), status: 'scheduled' },
    { name: 'Alumni Panel', category: 'professional', points_value: 10, starts_at: daysFromNow(-10), status: 'completed' },
    { name: 'Community Service Day', category: 'service', points_value: 15, starts_at: daysFromNow(-12), status: 'completed' },
    { name: 'Resume Workshop', category: 'professional', points_value: 10, starts_at: daysFromNow(3), status: 'scheduled' },
    { name: 'Beach Cleanup', category: 'service', points_value: 15, starts_at: daysFromNow(5), status: 'scheduled' },
    { name: 'Bake Sale', category: 'fundraising', points_value: 5, starts_at: daysFromNow(7), status: 'scheduled' },
    { name: 'Bowling Social', category: 'social', points_value: 5, starts_at: daysFromNow(10), status: 'scheduled' },
    { name: 'Networking Night', category: 'professional', points_value: 10, starts_at: daysFromNow(14), status: 'scheduled' },
    { name: 'Rained Out Cookout', category: 'social', points_value: 5, starts_at: daysFromNow(1), status: 'cancelled' },
  ]

  console.log('Checking existing events...')
  const { data: existingEvents, error: eventsSelectError } = await supabase
    .from('events')
    .select('id, name')
    .eq('semester_id', semester.id)
  if (eventsSelectError) throw eventsSelectError
  const existingEventNames = new Set(existingEvents.map((e) => e.name))

  const eventsToInsert = eventDefs
    .filter((e) => !existingEventNames.has(e.name))
    .map((e) => ({ ...e, semester_id: semester.id }))

  if (eventsToInsert.length > 0) {
    console.log(`Inserting ${eventsToInsert.length} events...`)
    const { error: insertEventsError } = await supabase.from('events').insert(eventsToInsert)
    if (insertEventsError) throw insertEventsError
  } else {
    console.log('Events already seeded, skipping.')
  }

  const { data: allEvents, error: allEventsError } = await supabase
    .from('events')
    .select('id, name')
    .eq('semester_id', semester.id)
  if (allEventsError) throw allEventsError
  const eventIdByName = Object.fromEntries(allEvents.map((e) => [e.name, e.id]))

  // 4. RSVPs (for scheduled non-meeting events) -----------------------------
  const rsvpDefs = [
    ['Resume Workshop', ['Alex Chen', 'Brianna Diaz', 'Carlos Nguyen', 'Elena Ruiz', 'Henry Osei']],
    ['Beach Cleanup', ['Alex Chen', 'Devon Park', 'Farid Hassan']],
    ['Bake Sale', ['Brianna Diaz', 'Carlos Nguyen']],
    ['Bowling Social', ['Alex Chen', 'Brianna Diaz', 'Carlos Nguyen', 'Devon Park', 'Elena Ruiz', 'Farid Hassan', 'Henry Osei']],
  ]

  const rsvpRows = rsvpDefs.flatMap(([eventName, names]) =>
    names.map((name) => ({ event_id: eventIdByName[eventName], member_id: byName(name), status: 'going' }))
  )

  console.log(`Upserting ${rsvpRows.length} rsvps...`)
  const { error: rsvpError } = await supabase
    .from('rsvps')
    .upsert(rsvpRows, { onConflict: 'event_id,member_id' })
  if (rsvpError) throw rsvpError

  // 5. Attendance (for completed non-meeting events) -------------------------
  const attendanceDefs = [
    ['Alumni Panel', ['Alex Chen', 'Brianna Diaz', 'Carlos Nguyen', 'Elena Ruiz', 'Henry Osei']],
    ['Community Service Day', ['Devon Park', 'Farid Hassan', 'Grace Kim', 'Isla Thompson']],
  ]

  const attendanceRows = attendanceDefs.flatMap(([eventName, names]) =>
    names.map((name) => ({
      event_id: eventIdByName[eventName],
      member_id: byName(name),
      checked_in_at: eventDefs.find((e) => e.name === eventName).starts_at,
    }))
  )

  console.log(`Upserting ${attendanceRows.length} attendance rows...`)
  const { error: attendanceError } = await supabase
    .from('attendance')
    .upsert(attendanceRows, { onConflict: 'event_id,member_id', ignoreDuplicates: true })
  if (attendanceError) throw attendanceError

  // 6. Meeting attendance ----------------------------------------------------
  // Carlos and Farid each get one unexcused (flag via unexcused>=1).
  // Devon gets two excused (flag via excused>=2).
  const meetings = ['Meeting Week 1', 'Meeting Week 2', 'Meeting Week 3', 'Meeting Week 4']
  const meetingMatrix = {
    'Alex Chen': ['present', 'present', 'present', 'present'],
    'Brianna Diaz': ['present', 'excused', 'present', 'present'],
    'Carlos Nguyen': ['present', 'present', 'present', 'unexcused'],
    'Devon Park': ['excused', 'excused', 'present', 'present'],
    'Elena Ruiz': ['present', 'present', 'present', 'excused'],
    'Farid Hassan': ['present', 'present', 'unexcused', 'present'],
    'Grace Kim': ['present', 'present', 'excused', 'present'],
    'Henry Osei': ['present', 'present', 'present', 'present'],
    'Isla Thompson': ['present', 'present', 'present', 'present'],
  }

  const meetingAttendanceRows = Object.entries(meetingMatrix).flatMap(([name, statuses]) =>
    statuses.map((status, i) => ({
      event_id: eventIdByName[meetings[i]],
      member_id: byName(name),
      status,
    }))
  )

  console.log(`Upserting ${meetingAttendanceRows.length} meeting attendance rows...`)
  const { error: meetingAttendanceError } = await supabase
    .from('meeting_attendance')
    .upsert(meetingAttendanceRows, { onConflict: 'event_id,member_id' })
  if (meetingAttendanceError) throw meetingAttendanceError

  // 7. Points ledger (append-only — only insert categories not already present) --
  const pointsDefs = [
    ['Alex Chen', [['professional', 10], ['service', 15], ['social', 5]]],
    ['Brianna Diaz', [['professional', 20], ['fundraising', 10]]],
    ['Carlos Nguyen', [['service', 25], ['social', 15]]],
    ['Devon Park', [['professional', 5], ['fundraising', 5], ['adjustment', -5, 'Late report deduction']]],
    ['Elena Ruiz', [['social', 10], ['professional', 10]]],
    ['Farid Hassan', [['service', 20]]],
    ['Henry Osei', [['fundraising', 15], ['social', 5]]],
    ['Isla Thompson', [['professional', 30]]],
  ]

  console.log('Checking existing points_ledger categories...')
  const { data: existingLedger, error: ledgerSelectError } = await supabase
    .from('points_ledger')
    .select('member_id, category')
    .eq('semester_id', semester.id)
  if (ledgerSelectError) throw ledgerSelectError

  const existingKey = (memberId, category) => `${memberId}:${category}`
  const existingSet = new Set(existingLedger.map((r) => existingKey(r.member_id, r.category)))

  const ledgerRows = pointsDefs
    .flatMap(([name, entries]) =>
      entries.map(([category, delta, note]) => ({
        member_id: byName(name),
        semester_id: semester.id,
        category,
        delta,
        note: note || null,
      }))
    )
    .filter((row) => !existingSet.has(existingKey(row.member_id, row.category)))

  if (ledgerRows.length > 0) {
    console.log(`Inserting ${ledgerRows.length} points_ledger rows...`)
    const { error: ledgerInsertError } = await supabase.from('points_ledger').insert(ledgerRows)
    if (ledgerInsertError) throw ledgerInsertError
  } else {
    console.log('points_ledger already seeded, skipping.')
  }

  // 8. Missing meeting forms (pending, tied to real unexcused rows) ------------
  const mmfDefs = [
    { name: 'Farid Hassan', event: 'Meeting Week 3', reason: 'Family emergency, have documentation.' },
    { name: 'Carlos Nguyen', event: 'Meeting Week 4', reason: 'Was out of town for a job interview.' },
  ]

  console.log('Checking existing missing_meeting_forms...')
  const { data: existingMmf, error: mmfSelectError } = await supabase
    .from('missing_meeting_forms')
    .select('member_id, event_id')
  if (mmfSelectError) throw mmfSelectError
  const existingMmfSet = new Set(existingMmf.map((r) => `${r.member_id}:${r.event_id}`))

  const mmfRows = mmfDefs
    .map((d) => ({ member_id: byName(d.name), event_id: eventIdByName[d.event], reason: d.reason }))
    .filter((row) => !existingMmfSet.has(`${row.member_id}:${row.event_id}`))

  if (mmfRows.length > 0) {
    console.log(`Inserting ${mmfRows.length} missing_meeting_forms...`)
    const { error: mmfInsertError } = await supabase.from('missing_meeting_forms').insert(mmfRows)
    if (mmfInsertError) throw mmfInsertError
  } else {
    console.log('missing_meeting_forms already seeded, skipping.')
  }

  // 9. Lower threshold applications (pending) ----------------------------------
  const ltaDefs = [
    { name: 'Elena Ruiz', reason: 'Working 25 hrs/week this semester, requesting reduced event minimum.' },
    { name: 'Henry Osei', reason: 'Varsity athletics travel schedule conflicts with most events.' },
  ]

  console.log('Checking existing lower_threshold_applications...')
  const { data: existingLta, error: ltaSelectError } = await supabase
    .from('lower_threshold_applications')
    .select('member_id, semester_id')
    .eq('semester_id', semester.id)
  if (ltaSelectError) throw ltaSelectError
  const existingLtaSet = new Set(existingLta.map((r) => r.member_id))

  const ltaRows = ltaDefs
    .map((d) => ({ member_id: byName(d.name), semester_id: semester.id, reason: d.reason }))
    .filter((row) => !existingLtaSet.has(row.member_id))

  if (ltaRows.length > 0) {
    console.log(`Inserting ${ltaRows.length} lower_threshold_applications...`)
    const { error: ltaInsertError } = await supabase.from('lower_threshold_applications').insert(ltaRows)
    if (ltaInsertError) throw ltaInsertError
  } else {
    console.log('lower_threshold_applications already seeded, skipping.')
  }

  console.log('\nDone. Log into the e-board portal as', testEmail)
  console.log('Expect: 3 attendance-flagged brothers (Carlos, Devon, Farid), 2 pending missing-meeting forms,')
  console.log('2 pending lower-threshold applications, 13 events, points across 8 brothers.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
