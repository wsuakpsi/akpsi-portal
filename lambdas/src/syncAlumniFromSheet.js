import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';
import { getSheetsClient } from './lib/googleSheetsClient.js';
import { parseAlumniRows } from './lib/alumniSheet.js';

// D.A.D. sync: the "D.A.D. Info" Google Sheet is the source of truth and the
// `alumni` table is a mirror of it. Reads the sheet's first tab and replaces
// the whole table in one transaction (replace_alumni, migration 0042).
//
// Called from the E-Board "Sync from sheet" button, the once-a-semester
// schedule (scheduledHandler), and graduateBrothers right after it appends
// new rows.

// The first tab, whatever it's named — so renaming "Sheet1" doesn't break it.
export async function readAlumniSheet(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title,sheets.properties.index',
  });
  const firstTab = [...meta.data.sheets].sort((a, b) => a.properties.index - b.properties.index)[0];
  if (!firstTab) throw new Error('The D.A.D. spreadsheet has no tabs');
  const title = firstTab.properties.title;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${title.replace(/'/g, "''")}'` });
  return { title, values: res.data.values || [] };
}

export async function syncAlumniFromSheet() {
  const spreadsheetId = process.env.DAD_SPREADSHEET_ID;
  if (!spreadsheetId) return { success: false, error: 'DAD_SPREADSHEET_ID must be set' };

  let values;
  try {
    const sheets = await getSheetsClient();
    ({ values } = await readAlumniSheet(sheets, spreadsheetId));
  } catch (err) {
    return { success: false, error: `Could not read the D.A.D. sheet: ${err.message}` };
  }

  const rows = parseAlumniRows(values);
  // An empty read almost always means a permissions or tab problem, not a
  // sheet that's really been emptied — don't wipe the directory over it.
  if (rows.length === 0) {
    return { success: false, error: 'The D.A.D. sheet returned no alumni rows — directory left unchanged.' };
  }

  const supabase = getSupabaseClient();
  const { data: inserted, error } = await supabase.rpc('replace_alumni', { rows });
  if (error) return { success: false, error: error.message };

  return { success: true, alumniSynced: inserted };
}

export const handler = wrapEboardHandler(syncAlumniFromSheet, () => []);

// EventBridge entrypoint for the once-a-semester schedule — no human
// session, so no auth wrapper.
export const scheduledHandler = async () => {
  const result = await syncAlumniFromSheet();
  if (!result.success) console.error('Scheduled D.A.D. sync failed:', result.error);
  return result;
};
