import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mapColumns,
  parseGraduationYear,
  normalizeLinkedinUrl,
  parseAlumniRows,
  buildSheetRow,
  existingAlumniKeys,
} from '../lambdas/src/lib/alumniSheet.js'

// Header row exactly as it is in the live "D.A.D. Info" sheet.
const LIVE_HEADER = [
  'ca', 'AKPSI Class', 'Graduation Year', 'Email (you check most often)', 'Phone Number', 'Major',
  'Current Employer/School', 'Current Role', 'Past Employers', 'Current City, State', 'Linkedin',
  'Secondary Education', 'Interested in being involved in AKPsi?', 'Industry',
]

test('maps every live header to the right field', () => {
  assert.deepEqual(mapColumns(LIVE_HEADER), {
    full_name: 0, pledge_class: 1, graduation: 2, email: 3, phone: 4, major: 5, employer: 6,
    job_title: 7, past_employers: 8, city: 9, linkedin_url: 10, secondary_education: 11,
    wants_involvement: 12, industry: 13,
  })
})

test('finds a real Name column wherever it is', () => {
  assert.equal(mapColumns(['Industry', 'Full Name']).full_name, 1)
})

test('parses the messy graduation values in the sheet', () => {
  assert.equal(parseGraduationYear('May 2022'), 2022)
  assert.equal(parseGraduationYear('2017'), 2017)
  assert.equal(parseGraduationYear('May, 2018 (masters)'), 2018)
  assert.equal(parseGraduationYear('WSU transfer 2021, U-M grad Apr 2023'), 2023)
  assert.equal(parseGraduationYear('May 2018, May 2022'), 2022)
  assert.equal(parseGraduationYear(''), null)
  assert.equal(parseGraduationYear('soon'), null)
})

test('only keeps http(s) LinkedIn links', () => {
  assert.equal(normalizeLinkedinUrl('https://www.linkedin.com/in/x/'), 'https://www.linkedin.com/in/x/')
  assert.equal(normalizeLinkedinUrl('linkedin.com/in/x'), 'https://linkedin.com/in/x')
  assert.equal(normalizeLinkedinUrl('javascript:alert(1)'), null)
  assert.equal(normalizeLinkedinUrl('https://evil.example/linkedin.com'), null)
  assert.equal(normalizeLinkedinUrl(''), null)
})

test('parses rows, blanks out "None", skips nameless rows', () => {
  const rows = parseAlumniRows([
    LIVE_HEADER,
    ['Alex Cho', 'Epsilon', 'May 2022', 'a@x.com', '', 'Economics', 'None', 'None', 'Thummel Lab', 'Ann Arbor, MI', 'https://www.linkedin.com/in/alex/', '', '', 'Student'],
    ['', 'Kappa', 'May 2023'],
    ['  Short   Row  ', 'Pi'],
  ])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].sheet_row, 2)
  assert.equal(rows[0].employer, null)
  assert.equal(rows[0].job_title, null)
  assert.equal(rows[0].graduation_year, 2022)
  assert.equal(rows[0].linkedin_url, 'https://www.linkedin.com/in/alex/')
  assert.equal(rows[1].full_name, 'Short Row')
  assert.equal(rows[1].sheet_row, 4)
  assert.equal(rows[1].industry, null)
})

test('builds an appended row in the sheet\'s column order', () => {
  const row = buildSheetRow(LIVE_HEADER, mapColumns(LIVE_HEADER), {
    full_name: 'New Alum', pledge_class: 'Sigma', graduation: 'Dec 2026', email: 'n@x.com', phone: null,
  })
  assert.equal(row.length, LIVE_HEADER.length)
  assert.deepEqual(row.slice(0, 5), ['New Alum', 'Sigma', 'Dec 2026', 'n@x.com', ''])
})

test('detects brothers already in the sheet by email or name', () => {
  const keys = existingAlumniKeys([LIVE_HEADER, ['Alex Cho', '', '', 'A@X.com']])
  assert.ok(keys.has({ full_name: 'Someone Else', email: 'a@x.com' }))
  assert.ok(keys.has({ full_name: 'alex  cho', email: null }))
  assert.ok(!keys.has({ full_name: 'New Person', email: 'new@x.com' }))
})
