import { supabase } from './supabase'

// Shared between the public Apply form and the recruitment portal's
// deliberation dashboard. Field set + options mirror the chapter's Google
// Form exactly — see supabase/migrations/0026_recruitment.sql.

export const STANDING_OPTIONS = ['Freshman', 'Sophomore', 'Junior']

export const GRADUATION_YEAR_OPTIONS = [
  'May 2027',
  'December 2027',
  'May 2028',
  'December 2028',
  'May 2029',
  'December 2029',
]

export const YES_NO_OPTIONS = ['Yes', 'No']
export const YES_NO_MAYBE_OPTIONS = ['Yes', 'No', 'Maybe']

export const LATE_CLASS_DAY_OPTIONS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'None']

export const VOTE_VALUES = ['yes', 'no', 'maybe']

export const RESULTS_VIEWER_POSITIONS = ['VP Membership', 'VP Internal', 'Secretary']

export function canSeeResults(profile) {
  return profile.role === 'eboard' && RESULTS_VIEWER_POSITIONS.includes(profile.eboard_position)
}

const BUCKET = 'rush-applications'

// Applicant is unauthenticated, so the id has to exist before the row does —
// generate it client-side, use it as the storage folder, then insert the row
// with that same id.
export function newApplicationId() {
  return crypto.randomUUID()
}

async function uploadFile(applicationId, kind, file) {
  const ext = file.name.split('.').pop()
  const path = `${applicationId}/${kind}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function submitApplication(fields, files) {
  const id = newApplicationId()

  const [resumePath, coverLetterPath, headshotPath] = await Promise.all([
    uploadFile(id, 'resume', files.resume),
    uploadFile(id, 'cover-letter', files.coverLetter),
    uploadFile(id, 'headshot', files.headshot),
  ])

  const { error } = await supabase.from('rush_applications').insert({
    id,
    full_name: fields.fullName.trim(),
    pronouns: fields.pronouns.trim(),
    access_id: fields.accessId.trim(),
    wayne_state_email: fields.wayneStateEmail.trim(),
    alternate_email: fields.alternateEmail.trim(),
    standing: fields.standing,
    graduation_year: fields.graduationYear,
    gpa: fields.gpa.trim(),
    majors: fields.majors.trim(),
    minors: fields.minors.trim(),
    resume_path: resumePath,
    cover_letter_path: coverLetterPath,
    headshot_path: headshotPath,
    ever_transferred: fields.everTransferred === 'Yes',
    transfer_from_details: fields.transferFromDetails?.trim() || null,
    plans_to_transfer: fields.plansToTransfer,
    transfer_to_details: fields.transferToDetails?.trim() || null,
    title_ix_violation: fields.titleIxViolation === 'Yes',
    felony_conviction: fields.felonyConviction === 'Yes',
    how_heard: fields.howHeard.trim(),
    late_class_days: fields.lateClassDays,
    additional_comments: fields.additionalComments?.trim() || null,
  })
  if (error) throw error

  return id
}

export async function getSignedFileUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10)
  if (error) throw error
  return data.signedUrl
}

export async function listApplications() {
  const { data, error } = await supabase
    .from('rush_applications')
    .select('id, full_name, standing, graduation_year, headshot_path, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Voting is anonymous — rush_application_votes RLS only ever returns the
// caller's own row (see 0032). Tallies come from a SECURITY DEFINER RPC that
// returns counts only (no member_id) and is itself gated to VP Membership /
// VP Internal / Secretary (is_recruitment_results_viewer, 0032) — callers
// must not invoke this for anyone else (see canSeeResults()).
export async function getVoteTallies() {
  const { data, error } = await supabase.rpc('get_all_vote_tallies')
  if (error) throw error
  const tallies = new Map()
  for (const row of data || []) {
    const t = tallies.get(row.application_id) || { yes: 0, no: 0, maybe: 0 }
    t[row.vote] = Number(row.votes_count)
    tallies.set(row.application_id, t)
  }
  return tallies
}

// RLS only lets a non-E-Board member see decisions for rows they decided
// (never, in practice) — so this map comes back empty for them. Only render
// it for E-Board.
export async function getDecisions() {
  const { data, error } = await supabase.from('rush_application_decisions').select('application_id, decision')
  if (error) throw error
  return new Map((data || []).map((row) => [row.application_id, row.decision]))
}

export async function getApplication(id) {
  const { data, error } = await supabase.from('rush_applications').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

// Soft delete — the row stays in the DB but rush_applications_select (0032)
// hides it from everyone from this point on. This is also how E-Board
// manually lets someone reapply: the email is only unique among non-deleted
// rows, so deleting the old application frees it up.
export async function softDeleteApplication(applicationId, memberId) {
  const { error } = await supabase
    .from('rush_applications')
    .update({ deleted_at: new Date().toISOString(), deleted_by: memberId })
    .eq('id', applicationId)
  if (error) throw error
}

// Own vote only — RLS never returns another member's row (voting is
// anonymous, see 0032).
export async function getMyVote(applicationId, memberId) {
  const { data, error } = await supabase
    .from('rush_application_votes')
    .select('vote')
    .eq('application_id', applicationId)
    .eq('member_id', memberId)
    .maybeSingle()
  if (error) throw error
  return data?.vote || null
}

// Aggregate tally (counts only, no member identity) — gated server-side to
// VP Membership / VP Internal / Secretary. Callers must not invoke this for
// anyone else (see canSeeResults()).
export async function getVoteTally(applicationId) {
  const { data, error } = await supabase.rpc('get_vote_tally', { p_application_id: applicationId })
  if (error) throw error
  const tally = { yes: 0, no: 0, maybe: 0 }
  for (const row of data || []) tally[row.vote] = Number(row.votes_count)
  return tally
}

export async function getComments(applicationId) {
  const { data, error } = await supabase
    .from('rush_application_comments')
    .select('id, member_id, body, created_at, members(full_name)')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function castVote(applicationId, memberId, vote) {
  const { error } = await supabase
    .from('rush_application_votes')
    .upsert(
      { application_id: applicationId, member_id: memberId, vote },
      { onConflict: 'application_id,member_id' },
    )
  if (error) throw error
}

export async function retractVote(applicationId, memberId) {
  const { error } = await supabase
    .from('rush_application_votes')
    .delete()
    .eq('application_id', applicationId)
    .eq('member_id', memberId)
  if (error) throw error
}

export async function addComment(applicationId, memberId, body) {
  const { error } = await supabase
    .from('rush_application_comments')
    .insert({ application_id: applicationId, member_id: memberId, body: body.trim() })
  if (error) throw error
}

export async function deleteComment(commentId) {
  const { error } = await supabase.from('rush_application_comments').delete().eq('id', commentId)
  if (error) throw error
}

export async function getDecision(applicationId) {
  const { data, error } = await supabase
    .from('rush_application_decisions')
    .select('decision')
    .eq('application_id', applicationId)
    .maybeSingle()
  if (error) throw error
  return data?.decision || 'pending'
}

export async function setDecision(applicationId, decision, memberId) {
  // The pending/decided consistency check requires decided_by/decided_at to
  // both be null when decision is 'pending' — "reset to pending" clears them.
  const isPending = decision === 'pending'
  const { error } = await supabase.from('rush_application_decisions').upsert(
    {
      application_id: applicationId,
      decision,
      decided_by: isPending ? null : memberId,
      decided_at: isPending ? null : new Date().toISOString(),
    },
    { onConflict: 'application_id' },
  )
  if (error) throw error
}

export function subscribeToApplication(applicationId, { onVote, onComment }) {
  const channel = supabase
    .channel(`rush-application-${applicationId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rush_application_votes', filter: `application_id=eq.${applicationId}` },
      onVote,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rush_application_comments', filter: `application_id=eq.${applicationId}` },
      onComment,
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}
