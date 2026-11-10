// Pure helpers for the "D.A.D. Info" alumni sheet — no Google/Supabase
// imports, so tests/alumniSheet.test.mjs can exercise them directly.
//
// Columns are matched by header text, not position, so E-Board can reorder
// or add columns in the sheet without breaking the sync. The first matcher
// that fits a header wins, so more specific patterns come first.
const FIELD_MATCHERS = [
  ['email', /e-?mail/],
  ['phone', /phone/],
  ['linkedin_url', /linkedin/],
  ['past_employers', /past employer/],
  ['employer', /employer|company/],
  ['job_title', /current role|job title|position/],
  ['secondary_education', /secondary education|grad school|masters/],
  ['wants_involvement', /involve/],
  ['graduation', /graduat/],
  ['pledge_class', /class/],
  ['major', /major/],
  ['city', /city|location/],
  ['industry', /industry/],
  ['full_name', /name/],
];

// Values people type to mean "nothing here".
const EMPTY_VALUES = new Set(['', 'none', 'n/a', 'na', '-', '--']);

function clean(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  return EMPTY_VALUES.has(text.toLowerCase()) ? null : text;
}

// Maps each known field to its column index. The name column is the one
// header we can't rely on (the live sheet's first header is just "ca"), so
// it falls back to column A.
export function mapColumns(headerRow) {
  const columns = {};
  (headerRow || []).forEach((header, index) => {
    const normalized = String(header || '').trim().toLowerCase();
    if (!normalized) return;
    const match = FIELD_MATCHERS.find(([field, pattern]) => !(field in columns) && pattern.test(normalized));
    if (match) columns[match[0]] = index;
  });
  if (!('full_name' in columns)) columns.full_name = 0;
  return columns;
}

// "May 2022" → 2022, "2017" → 2017, "WSU transfer 2021, U-M grad Apr 2023"
// → 2023. The latest year in the cell is the one that means "graduated".
export function parseGraduationYear(value) {
  const years = String(value || '').match(/\b(19|20)\d{2}\b/g);
  if (!years) return null;
  return Math.max(...years.map(Number));
}

// Only ever hand the browser an http(s) link, so a cell like
// "javascript:..." can't become a clickable href.
export function normalizeLinkedinUrl(value) {
  const text = clean(value);
  if (!text) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text.replace(/^\/+/, '')}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// Sheet values (header row first) → rows for replace_alumni(). Rows with no
// name are skipped. `sheet_row` is the 1-based row number in the sheet so a
// bad entry can be found and fixed there.
export function parseAlumniRows(values) {
  const [headerRow, ...dataRows] = values || [];
  const columns = mapColumns(headerRow);
  const cell = (row, field) => (field in columns ? clean(row[columns[field]]) : null);

  return dataRows
    .map((row, index) => {
      const graduation = cell(row, 'graduation');
      return {
        sheet_row: index + 2,
        full_name: cell(row, 'full_name'),
        pledge_class: cell(row, 'pledge_class'),
        graduation,
        graduation_year: parseGraduationYear(graduation),
        email: cell(row, 'email'),
        phone: cell(row, 'phone'),
        major: cell(row, 'major'),
        employer: cell(row, 'employer'),
        job_title: cell(row, 'job_title'),
        past_employers: cell(row, 'past_employers'),
        city: cell(row, 'city'),
        linkedin_url: normalizeLinkedinUrl(cell(row, 'linkedin_url')),
        secondary_education: cell(row, 'secondary_education'),
        wants_involvement: cell(row, 'wants_involvement'),
        industry: cell(row, 'industry'),
      };
    })
    .filter((row) => row.full_name);
}

// Builds a sheet row for a graduating brother, laid out to match whatever
// column order the sheet currently has. Fields the portal doesn't know
// (employer, city, ...) stay blank for the alum to fill in later.
export function buildSheetRow(headerRow, columns, values) {
  const width = Math.max((headerRow || []).length, ...Object.values(columns).map((i) => i + 1));
  const row = new Array(width).fill('');
  for (const [name, value] of Object.entries(values)) {
    if (name in columns && value) row[columns[name]] = value;
  }
  return row;
}

const normalizeKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Who's already in the sheet, by email and by name — graduating someone
// twice (double click, retry after a partial failure) must not add a
// duplicate row.
export function existingAlumniKeys(values) {
  const emails = new Set();
  const names = new Set();
  for (const row of parseAlumniRows(values)) {
    if (row.email) emails.add(normalizeKey(row.email));
    names.add(normalizeKey(row.full_name));
  }
  return {
    has: (member) =>
      (member.email && emails.has(normalizeKey(member.email))) || names.has(normalizeKey(member.full_name)),
  };
}
