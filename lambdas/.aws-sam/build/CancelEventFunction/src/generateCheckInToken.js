import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';
import { signCheckInToken, CHECKIN_WINDOW_HOURS } from './lib/qrToken.js';

export async function generateCheckInToken(eventId) {
  if (!eventId) return { success: false, error: 'eventId is required' };
  const supabase = getSupabaseClient();

  const { data: event, error } = await supabase
    .from('events')
    .select('id, status')
    .eq('id', eventId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!event) return { success: false, error: `Event ${eventId} not found` };
  if (event.status !== 'scheduled') {
    return { success: false, error: `Event ${eventId} is not scheduled (status: ${event.status})` };
  }

  const expiresAt = new Date(Date.now() + CHECKIN_WINDOW_HOURS * 60 * 60 * 1000);

  let token;
  try {
    token = signCheckInToken(eventId, expiresAt);
  } catch (err) {
    return { success: false, error: err.message };
  }

  return { success: true, token, expiresAt: expiresAt.toISOString() };
}

export const handler = wrapEboardHandler(generateCheckInToken, (payload) => [payload.eventId]);
