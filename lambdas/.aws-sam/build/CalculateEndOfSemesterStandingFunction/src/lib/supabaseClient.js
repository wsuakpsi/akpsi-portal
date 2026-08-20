import { createClient } from '@supabase/supabase-js';

let client;

// Lambda execution environments reuse the module scope across warm
// invocations, so the client (and its connection pool) is cached here
// rather than recreated on every call.
export function getSupabaseClient() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
