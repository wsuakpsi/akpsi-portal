import { supabase } from './supabase'
import { createSignedUrlCache } from './signedUrlCache'
import { createReadThroughCache } from './readThroughCache'

// Shared between the public Apply form and the recruitment portal's
// deliberation dashboard. Field set + options mirror the chapter's Google
// Form exactly — see supabase/migrations/0026_recruitment.sql (graduation years
// extended in 0036_recruitment_graduation_2030.sql).

export const STANDING_OPTIONS = ['Freshman', 'Sophomore', 'Junior']

export const GRADUATION_YEAR_OPTIONS = [
  'May 2027',
  'December 2027',
  'May 2028',
  'December 2028',
  'May 2029',
  'December 2029',
  'May 2030',
  'December 2030',
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

// Immutable-path uploads: never `upsert`, so a cached copy can never go stale.
// Variants get a one-year Cache-Control (the Storage default is 1 hour).
const IMMUTABLE_FILE_CACHE_CONTROL_SECONDS = '31536000'

async function uploadFileAtStoragePath(storagePath, file) {
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type,
    cacheControl: IMMUTABLE_FILE_CACHE_CONTROL_SECONDS,
    upsert: false,
  })
  if (error) throw error
  return storagePath
}

async function uploadFile(applicationId, kind, file) {
  const ext = file.name.split('.').pop()
  return uploadFileAtStoragePath(`${applicationId}/${kind}.${ext}`, file)
}

// Thumbnail / display variants are an optimisation: if one fails to upload the
// application is still valid, the path stays null and the UI falls back.
async function uploadOptionalHeadshotVariant(applicationId, variantName, file) {
  if (!file) return null
  try {
    return await uploadFileAtStoragePath(`${applicationId}/headshot-${variantName}.jpg`, file)
  } catch {
    return null
  }
}

export async function submitApplication(fields, files) {
  const id = newApplicationId()

  const [resumePath, coverLetterPath, headshotPath, headshotThumbnailPath, headshotDisplayPath] = await Promise.all([
    uploadFile(id, 'resume', files.resume),
    uploadFile(id, 'cover-letter', files.coverLetter),
    uploadFile(id, 'headshot', files.headshot),
    uploadOptionalHeadshotVariant(id, 'thumbnail-256', files.headshotThumbnail),
    uploadOptionalHeadshotVariant(id, 'display-1024', files.headshotDisplay),
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
    headshot_thumbnail_path: headshotThumbnailPath,
    headshot_display_path: headshotDisplayPath,
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

// One signed URL per storage path for the whole page session (1 hour, renewed
// only inside the last 5 minutes). See signedUrlCache.js for why.
const applicationFileSignedUrlCache = createSignedUrlCache({
  createSignedUrlsForStoragePaths: async (storagePaths, lifetimeSeconds) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(storagePaths, lifetimeSeconds)
    if (error) throw error
    return data
  },
})

export const getSignedFileUrl = applicationFileSignedUrlCache.getSignedUrlForStoragePath
export const getSignedFileUrls = applicationFileSignedUrlCache.getSignedUrlsForStoragePaths

// Heavy, rarely-changing reads (applicant list, one application's answers) are
// cached for 5 minutes. Votes, comments and decisions are NOT cached here.
const applicationDataCache = createReadThroughCache()
const APPLICANT_LIST_CACHE_KEY = 'applicant-list'
const applicationCacheKey = (applicationId) => `application:${applicationId}`

// List view columns only: no essays, no free text, no file contents.
const APPLICANT_LIST_COLUMNS = 'id, full_name, standing, graduation_year, headshot_thumbnail_path, created_at'

export function listApplications({ forceRefresh = false } = {}) {
  return applicationDataCache.readThrough(
    APPLICANT_LIST_CACHE_KEY,
    async () => {
      const { data, error } = await supabase
        .from('rush_applications')
        .select(APPLICANT_LIST_COLUMNS)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    { forceRefresh },
  )
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

// Everything the detail page renders; explicit so new columns never ship by accident.
const APPLICATION_DETAIL_COLUMNS = [
  'id', 'full_name', 'pronouns', 'access_id', 'wayne_state_email', 'alternate_email',
  'standing', 'graduation_year', 'gpa', 'majors', 'minors',
  'resume_path', 'cover_letter_path', 'headshot_path', 'headshot_display_path',
  'ever_transferred', 'transfer_from_details', 'plans_to_transfer', 'transfer_to_details',
  'title_ix_violation', 'felony_conviction', 'how_heard', 'late_class_days', 'additional_comments',
  'created_at',
].join(', ')

export function getApplication(id) {
  return applicationDataCache.readThrough(applicationCacheKey(id), async () => {
    const { data, error } = await supabase
      .from('rush_applications')
      .select(APPLICATION_DETAIL_COLUMNS)
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  })
}

// Soft delete — the row stays in the DB but rush_applications_select (0032)
// hides it from everyone from this point on. This is also how E-Board
// manually lets someone reapply: the email is only unique among non-deleted
// rows, so deleting the old application frees it up.
export async function softDeleteApplication(applicationId) {
  const { error } = await supabase.rpc('soft_delete_rush_application', { p_application_id: applicationId })
  if (error) throw error
  applicationDataCache.invalidate(APPLICANT_LIST_CACHE_KEY)
  applicationDataCache.invalidate(applicationCacheKey(applicationId))
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

// Danger: deletes every member's vote on every applicant (decided ones too).
// VP Membership / VP Internal / Secretary only — enforced in the RPC.
export async function resetAllVotes() {
  const { data, error } = await supabase.rpc('reset_all_votes')
  if (error) throw error
  return data
}

export async function getMaybeEnabled() {
  const { data, error } = await supabase.from('recruitment_settings').select('maybe_enabled').eq('id', true).single()
  if (error) throw error
  return data.maybe_enabled
}

export async function setMaybeEnabled(enabled) {
  const { error } = await supabase.rpc('set_maybe_enabled', { p_enabled: enabled })
  if (error) throw error
}

export function subscribeToMaybeSetting(onChange) {
  const channel = supabase
    .channel('recruitment-settings')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recruitment_settings' }, onChange)
    .subscribe()
  return () => supabase.removeChannel(channel)
}
