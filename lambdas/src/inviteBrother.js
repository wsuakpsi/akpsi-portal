import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';

const BROTHER_PORTAL_URL = process.env.BROTHER_PORTAL_URL || 'https://brother.wsuakpsi.com';

export async function inviteBrother(email, fullName, pledgeClass) {
  if (!email || !fullName || !pledgeClass) {
    return { success: false, error: 'email, fullName, and pledgeClass are required' };
  }

  const supabase = getSupabaseClient();

  // Check if already a member or already has a pending invite
  const [{ data: existingMember }, { data: existingInvite }] = await Promise.all([
    supabase.from('members').select('email').eq('email', email).maybeSingle(),
    supabase.from('pending_invites').select('email').eq('email', email).maybeSingle(),
  ]);

  if (existingMember) return { success: false, error: `A member with email ${email} already exists` };
  if (existingInvite) return { success: false, error: `An invite for ${email} is already pending` };

  // Store invite info in pending_invites — members row gets created on first login
  const { error: insertError } = await supabase.from('pending_invites').insert({
    email,
    full_name: fullName,
    pledge_class: pledgeClass,
  });

  if (insertError) return { success: false, error: insertError.message };

  // Send the invite email via Supabase Auth admin API
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${BROTHER_PORTAL_URL}/set-password`,
  });

  if (inviteError) {
    await supabase.from('pending_invites').delete().eq('email', email);
    return { success: false, error: inviteError.message };
  }

  return { success: true };
}

export const handler = wrapEboardHandler(inviteBrother, (payload) => [
  payload.email,
  payload.fullName,
  payload.pledgeClass,
]);
