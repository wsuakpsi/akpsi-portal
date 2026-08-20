import { getSupabaseClient } from './supabaseClient.js';

// Thrown by the requireX helpers below; wrapEboardHandler/wrapAuthedHandler
// catch it and translate it into the matching HTTP status.
export class AuthError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function extractBearerToken(event) {
  const header = event?.headers?.Authorization || event?.headers?.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

// Verifies the caller's Supabase session JWT and loads their member row.
// Every Lambda runs with the service role key (bypasses RLS), so this is the
// only thing standing between "anyone with the API Gateway URL" and a write
// — it must run before any business logic, not be left to RLS.
async function requireCaller(event) {
  const token = extractBearerToken(event);
  if (!token) throw new AuthError(401, 'Missing bearer token');

  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) throw new AuthError(401, 'Invalid or expired session');

  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('id, role, status')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (memberError) throw new AuthError(500, memberError.message);
  if (!member) throw new AuthError(403, 'No member record for this account');
  if (member.status === 'suspended') throw new AuthError(403, 'Account is suspended');

  return member;
}

// For endpoints only E-Board may call (manual adjustments, form review,
// event completion, standing calculation, sheets sync).
export async function requireEboardCaller(event) {
  const member = await requireCaller(event);
  if (member.role !== 'eboard') throw new AuthError(403, 'E-Board access required');
  return member;
}

// For endpoints a brother can call on their own behalf (QR self check-in,
// cancelling their own RSVP) — E-Board may also act on behalf of others
// (manual check-in, forced cancellation). `subjectMemberId` is whichever
// member_id the request body targets.
export async function requireSelfOrEboardCaller(event, subjectMemberId) {
  const member = await requireCaller(event);
  if (member.role === 'eboard' || member.id === subjectMemberId) return member;
  throw new AuthError(403, 'Not authorized for this member');
}
