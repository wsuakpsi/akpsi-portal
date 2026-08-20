import { getSupabaseClient } from './lib/supabaseClient.js';
import { syncToGoogleSheets } from './syncToGoogleSheets.js';

// EventBridge-invoked entrypoint (see infra/nightly-sheets-sync.template.yaml)
// — unlike the API Gateway `handler` export in syncToGoogleSheets.js, there's
// no human session to authenticate here, so this calls the core function
// directly rather than going through wrapEboardHandler. Looks up the active
// semester itself instead of taking one as input, since a cron trigger has
// no request body to read it from.
export async function nightlySheetsSync() {
  const supabase = getSupabaseClient();

  const { data: semester, error } = await supabase
    .from('semesters')
    .select('id, name')
    .eq('is_active', true)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!semester) return { success: false, error: 'No active semester' };

  return syncToGoogleSheets(semester.id);
}

export const handler = async () => {
  const result = await nightlySheetsSync();
  if (!result.success) console.error('Nightly sheets sync failed:', result.error);
  return result;
};
