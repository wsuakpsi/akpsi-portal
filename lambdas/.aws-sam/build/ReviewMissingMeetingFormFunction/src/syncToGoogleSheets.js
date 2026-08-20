import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';
import { getSheetsClient } from './lib/googleSheetsClient.js';
import { fetchMemberPointTotals, fetchMeetingAttendanceCounts } from './lib/pointsAggregation.js';

const CURRENT_SEMESTER_SHEET_TITLE = 'Current Semester';
const ARCHIVE_SHEET_TITLE = 'Archive';

const SHEET_COLUMNS = [
  'Name',
  'Pledge Class',
  'Role',
  'Status',
  'Professional',
  'Service',
  'Fundraising',
  'Social',
  'Total',
  'Meetings Present',
  'Excused',
  'Unexcused',
];

// Archive rows carry the same columns plus a semester name and snapshot
// timestamp up front, since the Archive tab holds rows from every semester
// that's ever been snapshotted, not just the active one.
const ARCHIVE_COLUMNS = ['Semester', 'Snapshotted At', ...SHEET_COLUMNS];

// `archive: true` is set by calculateEndOfSemesterStanding right after it
// locks standing results (spec 14.2) — it appends a snapshot to the Archive
// tab in addition to the normal Current Semester overwrite. Plain syncs
// (on-demand button, nightly cron) only touch Current Semester.
export async function syncToGoogleSheets(semesterId, { archive = false } = {}) {
  if (!semesterId) return { success: false, error: 'semesterId is required' };
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) return { success: false, error: 'GOOGLE_SHEETS_SPREADSHEET_ID must be set' };

  const supabase = getSupabaseClient();

  const { data: semester, error: semesterError } = await supabase
    .from('semesters')
    .select('id, name')
    .eq('id', semesterId)
    .maybeSingle();
  if (semesterError) return { success: false, error: semesterError.message };
  if (!semester) return { success: false, error: `Semester ${semesterId} not found` };

  const { data: members, error: membersError } = await supabase
    .from('members')
    .select('id, full_name, pledge_class, role, status')
    .order('full_name');
  if (membersError) return { success: false, error: membersError.message };

  let totalsByMember;
  let meetingCountsByMember;
  try {
    totalsByMember = await fetchMemberPointTotals(supabase, semesterId);
    meetingCountsByMember = await fetchMeetingAttendanceCounts(supabase, semesterId);
  } catch (err) {
    return { success: false, error: err.message };
  }

  const rows = members.map((member) => {
    const totals = totalsByMember.get(member.id) || { total: 0 };
    const meetings = meetingCountsByMember.get(member.id) || { present: 0, excused: 0, unexcused: 0 };
    return [
      member.full_name,
      member.pledge_class,
      member.role,
      member.status,
      totals.professional || 0,
      totals.service || 0,
      totals.fundraising || 0,
      totals.social || 0,
      totals.total || 0,
      meetings.present,
      meetings.excused,
      meetings.unexcused,
    ];
  });

  let sheets;
  try {
    sheets = await getSheetsClient();
  } catch (err) {
    return { success: false, error: err.message };
  }

  try {
    await ensureSheetExists(sheets, spreadsheetId, CURRENT_SEMESTER_SHEET_TITLE);
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${CURRENT_SEMESTER_SHEET_TITLE}'`,
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${CURRENT_SEMESTER_SHEET_TITLE}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_COLUMNS, ...rows] },
    });
  } catch (err) {
    return { success: false, error: err.message };
  }

  let archivedRows = 0;
  if (archive) {
    const snapshotAt = new Date().toISOString();
    const archiveRows = rows.map((row) => [semester.name, snapshotAt, ...row]);
    try {
      await ensureSheetExists(sheets, spreadsheetId, ARCHIVE_SHEET_TITLE, ARCHIVE_COLUMNS);
      await appendRows(sheets, spreadsheetId, ARCHIVE_SHEET_TITLE, archiveRows);
    } catch (err) {
      return { success: false, error: err.message };
    }
    archivedRows = archiveRows.length;
  }

  return {
    success: true,
    sheetTitle: CURRENT_SEMESTER_SHEET_TITLE,
    rowsWritten: rows.length,
    archived: archive,
    archivedRows,
  };
}

async function ensureSheetExists(sheets, spreadsheetId, title, headerRow) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some((s) => s.properties.title === title);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });

  if (headerRow) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${title}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headerRow] },
    });
  }
}

async function appendRows(sheets, spreadsheetId, title, rows) {
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${title}'!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

export const handler = wrapEboardHandler(syncToGoogleSheets, (payload) => [
  payload.semesterId,
  { archive: Boolean(payload.archive) },
]);
