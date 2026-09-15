import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';
import { getSheetsClient } from './lib/googleSheetsClient.js';

const SHEET_TITLE = 'Applications';

const SHEET_COLUMNS = [
  'Name',
  'Pronouns',
  'Access ID',
  'Wayne State Email',
  'Alternate Email',
  'Standing',
  'Graduation Year',
  'GPA',
  'Major(s)',
  'Minor(s)',
  'Ever Transferred',
  'Transfer From Details',
  'Plans to Transfer',
  'Transfer To Details',
  'Title IX Violation',
  'Felony Conviction',
  'How Heard',
  'Late Class Days',
  'Comments (form)',
  'Decision',
  'Yes Votes',
  'No Votes',
  'Maybe Votes',
  'Deliberation Comments',
  'Submitted At',
];

// Separate spreadsheet from the chapter's brother/points one (see
// GOOGLE_SHEETS_SPREADSHEET_ID) — same Google service account, different
// target sheet, set via RUSH_APPLICATIONS_SPREADSHEET_ID.
export async function syncRushApplicationsToSheets() {
  const spreadsheetId = process.env.RUSH_APPLICATIONS_SPREADSHEET_ID;
  if (!spreadsheetId) return { success: false, error: 'RUSH_APPLICATIONS_SPREADSHEET_ID must be set' };

  const supabase = getSupabaseClient();

  const [applicationsRes, votesRes, commentsRes, decisionsRes] = await Promise.all([
    supabase.from('rush_applications').select('*').order('created_at', { ascending: true }),
    supabase.from('rush_application_votes').select('application_id, vote'),
    supabase.from('rush_application_comments').select('application_id'),
    supabase.from('rush_application_decisions').select('application_id, decision'),
  ]);
  if (applicationsRes.error) return { success: false, error: applicationsRes.error.message };
  if (votesRes.error) return { success: false, error: votesRes.error.message };
  if (commentsRes.error) return { success: false, error: commentsRes.error.message };
  if (decisionsRes.error) return { success: false, error: decisionsRes.error.message };

  const decisionByApplication = new Map(
    (decisionsRes.data || []).map((row) => [row.application_id, row.decision]),
  );

  const tallyByApplication = new Map();
  for (const { application_id, vote } of votesRes.data || []) {
    const t = tallyByApplication.get(application_id) || { yes: 0, no: 0, maybe: 0 };
    t[vote] += 1;
    tallyByApplication.set(application_id, t);
  }

  const commentCountByApplication = new Map();
  for (const { application_id } of commentsRes.data || []) {
    commentCountByApplication.set(application_id, (commentCountByApplication.get(application_id) || 0) + 1);
  }

  const rows = (applicationsRes.data || []).map((app) => {
    const tally = tallyByApplication.get(app.id) || { yes: 0, no: 0, maybe: 0 };
    return [
      app.full_name,
      app.pronouns,
      app.access_id,
      app.wayne_state_email,
      app.alternate_email,
      app.standing,
      app.graduation_year,
      app.gpa,
      app.majors,
      app.minors,
      app.ever_transferred ? 'Yes' : 'No',
      app.transfer_from_details || '',
      app.plans_to_transfer,
      app.transfer_to_details || '',
      app.title_ix_violation ? 'Yes' : 'No',
      app.felony_conviction ? 'Yes' : 'No',
      app.how_heard,
      (app.late_class_days || []).join(', '),
      app.additional_comments || '',
      decisionByApplication.get(app.id) || 'pending',
      tally.yes,
      tally.no,
      tally.maybe,
      commentCountByApplication.get(app.id) || 0,
      app.created_at,
    ];
  });

  let sheets;
  try {
    sheets = await getSheetsClient();
  } catch (err) {
    return { success: false, error: err.message };
  }

  try {
    await ensureSheetExists(sheets, spreadsheetId, SHEET_TITLE);
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${SHEET_TITLE}'` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${SHEET_TITLE}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_COLUMNS, ...rows] },
    });
  } catch (err) {
    return { success: false, error: err.message };
  }

  return { success: true, sheetTitle: SHEET_TITLE, rowsWritten: rows.length };
}

async function ensureSheetExists(sheets, spreadsheetId, title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some((s) => s.properties.title === title);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
}

export const handler = wrapEboardHandler(syncRushApplicationsToSheets, () => []);
