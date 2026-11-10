import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';
import { getSheetsClient } from './lib/googleSheetsClient.js';
import { mapColumns, buildSheetRow, existingAlumniKeys } from './lib/alumniSheet.js';
import { readAlumniSheet, syncAlumniFromSheet } from './syncAlumniFromSheet.js';

// End-of-semester graduation, run by hand from the E-Board D.A.D. page
// (graduation dates move around too much to automate). For each brother
// E-Board picks, with the term they're actually graduating:
//   1. append a row to the D.A.D. sheet (name, class, graduation, email,
//      phone — the rest is left blank for the alum to fill in),
//   2. set their member status to 'alumni',
//   3. re-sync the sheet into the directory so they show up right away.
//
// Safe to re-run: anyone already in the sheet (same email or name) isn't
// appended again, so a retry after a partial failure just finishes the job.
const MAX_GRADUATES_PER_RUN = 100;

export async function graduateBrothers(graduates) {
  const spreadsheetId = process.env.DAD_SPREADSHEET_ID;
  if (!spreadsheetId) return { success: false, error: 'DAD_SPREADSHEET_ID must be set' };

  if (!Array.isArray(graduates) || graduates.length === 0) {
    return { success: false, error: 'Pick at least one brother to graduate' };
  }
  if (graduates.length > MAX_GRADUATES_PER_RUN) {
    return { success: false, error: `At most ${MAX_GRADUATES_PER_RUN} brothers per run` };
  }

  const termById = new Map();
  for (const g of graduates) {
    const term = typeof g?.graduation === 'string' ? g.graduation.trim() : '';
    if (!g?.memberId || !term) return { success: false, error: 'Every graduate needs a graduation term' };
    if (term.length > 40) return { success: false, error: `Graduation term is too long: "${term}"` };
    termById.set(g.memberId, term);
  }

  const supabase = getSupabaseClient();
  const { data: members, error: membersError } = await supabase
    .from('members')
    .select('id, full_name, pledge_class, email, phone_number, status')
    .in('id', [...termById.keys()]);
  if (membersError) return { success: false, error: membersError.message };
  if (members.length !== termById.size) return { success: false, error: 'Some selected brothers were not found' };

  let sheets;
  let title;
  let values;
  try {
    sheets = await getSheetsClient();
    ({ title, values } = await readAlumniSheet(sheets, spreadsheetId));
  } catch (err) {
    return { success: false, error: `Could not read the D.A.D. sheet: ${err.message}` };
  }
  if (values.length === 0) return { success: false, error: 'The D.A.D. sheet has no header row' };

  const headerRow = values[0];
  const columns = mapColumns(headerRow);
  const alreadyInSheet = existingAlumniKeys(values);

  const toAppend = members.filter((m) => !alreadyInSheet.has(m));
  const rows = toAppend.map((m) =>
    buildSheetRow(headerRow, columns, {
      full_name: m.full_name,
      pledge_class: m.pledge_class,
      graduation: termById.get(m.id),
      email: m.email,
      phone: m.phone_number,
    }),
  );

  if (rows.length > 0) {
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${title.replace(/'/g, "''")}'!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: rows },
      });
    } catch (err) {
      return { success: false, error: `Could not add rows to the D.A.D. sheet: ${err.message}` };
    }
  }

  // Suspended members keep their suspension; everyone else becomes alumni.
  const statusIds = members.filter((m) => m.status !== 'suspended' && m.status !== 'alumni').map((m) => m.id);
  if (statusIds.length > 0) {
    const { error: statusError } = await supabase.from('members').update({ status: 'alumni' }).in('id', statusIds);
    if (statusError) {
      return {
        success: false,
        error: `Added to the sheet, but could not mark them alumni: ${statusError.message}. Run it again to finish.`,
      };
    }
  }

  const sync = await syncAlumniFromSheet();

  return {
    success: true,
    appended: rows.length,
    alreadyInSheet: members.length - rows.length,
    markedAlumni: statusIds.length,
    alumniSynced: sync.success ? sync.alumniSynced : null,
    syncError: sync.success ? null : sync.error,
  };
}

export const handler = wrapEboardHandler(graduateBrothers, (payload) => [payload.graduates]);
