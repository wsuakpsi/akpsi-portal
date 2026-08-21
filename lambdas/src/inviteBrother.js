import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';

const BROTHER_PORTAL_URL = process.env.BROTHER_PORTAL_URL || 'https://brother.wsuakpsi.com';

export async function inviteBrother(email, fullName, pledgeClass) {
  if (!email || !fullName || !pledgeClass) {
    return { success: false, error: 'email, fullName, and pledgeClass are required' };
  }

  const supabase = getSupabaseClient();

  // Check if a members row already exists for this email
  const { data: existing } = await supabase
    .from('members')
    .select('id, email')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    return { success: false, error: `A member with email ${email} already exists` };
  }

  // Create the members row with id=null — linked on first login by getMyProfile
  const { error: insertError } = await supabase.from('members').insert({
    id: null,
    email,
    full_name: fullName,
    pledge_class: pledgeClass,
    role: 'brother',
    status: 'active',
  });

  if (insertError) return { success: false, error: insertError.message };

  // Send the invite email via Supabase Auth admin API
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${BROTHER_PORTAL_URL}/set-password`,
  });

  if (inviteError) {
    // Roll back the members row so we don't have an orphaned record
    await supabase.from('members').delete().eq('email', email).is('id', null);
    return { success: false, error: inviteError.message };
  }

  return { success: true };
}

export const handler = wrapEboardHandler(inviteBrother, (payload) => [
  payload.email,
  payload.fullName,
  payload.pledgeClass,
]);
