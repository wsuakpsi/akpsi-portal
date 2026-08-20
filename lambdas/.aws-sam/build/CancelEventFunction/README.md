# AKPsi Lambdas

Node.js (ESM) Lambda functions for the chapter management platform. Each
file in `src/` exports:

- a core function (e.g. `completeEvent(eventId)`) that always resolves to
  `{ success: true, ... }` or `{ success: false, error }` and never throws
  for expected business errors — safe to call directly or from tests.
- a `handler` export wrapping it for API Gateway (Lambda proxy
  integration): parses `event.body` as JSON, maps fields to the core
  function's positional args, and returns `{ statusCode, headers, body }`.

## Authentication

Every Lambda runs with `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS
entirely — there is no database-level enforcement backing these endpoints,
so each `handler` authenticates the caller itself (`src/lib/auth.js`)
before running any business logic:

- Callers must send `Authorization: Bearer <supabase_access_token>` — the
  same access token the frontend already holds from `supabase.auth
  .getSession()`. There is no separate API key.
- `wrapEboardHandler` (completeEvent, cancelEvent, postManualPointAdjustment,
  reviewMissingMeetingForm, calculateEndOfSemesterStanding,
  syncToGoogleSheets) requires the token to resolve to a member with
  `role = 'eboard'`.
- `wrapAuthedHandler` (recordAttendance, recordLateCancel) requires the
  token to resolve to either the `member_id` the request acts on, or an
  E-Board member acting on someone else's behalf.
- Any "who did this" field (`createdBy`, `reviewedBy`) is taken from the
  verified caller, never from the request body — the client can't claim to
  be someone else.
- A suspended member's token is rejected regardless of role.

## Environment variables

| Var | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL` | all | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | all | Service role key (server-side only — never expose to clients) |
| `STANDARD_THRESHOLDS_JSON` | `calculateEndOfSemesterStanding` | Optional override of the default `{"professional":40,"service":20,"fundraising":20,"social":20,"total":100}` |
| `LOWER_THRESHOLDS_JSON` | `calculateEndOfSemesterStanding` | Optional override of the default `{"professional":20,"service":10,"fundraising":10,"social":10,"total":50}` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `syncToGoogleSheets` | Full service account credentials JSON (as a string) |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | `syncToGoogleSheets` | Target spreadsheet ID |
| `QR_CHECKIN_JWT_SECRET` | `generateCheckInToken`, `recordAttendance` (`qrHandler`) | Signs/verifies the QR check-in token. A different secret from Supabase's own JWT — this one is ours, not delegated. |

## Rulings on spec gaps

- **Point thresholds**: pinned per the chapter policies doc — 4 professional
  events, 2 service, 2 fundraising, 2 social, at 10 pts/event; lower
  threshold halves each category. Set as the defaults in
  `src/lib/thresholds.js`, still overridable via env vars.
- **`completeEvent` idempotency**: `points_ledger` is append-only with no
  dedupe key, so re-completing an already-completed event would double-post
  points. The function short-circuits with an error if `events.status` is
  already `'completed'`.
- **No-show penalty category**: inherits the event's own `category`, so a
  no-show on a Professional event dings the Professional bucket — same
  category the member was trying to earn points in.
- **`postManualPointAdjustment`**: has no `category` param.
  `points_ledger.category` is hardcoded to `'adjustment'`; the `note` field
  carries the officer's explanation.
- **`calculateEndOfSemesterStanding` "active member"**: only
  `status IN ('active', 'probation')` is evaluated. Suspended members are
  skipped entirely — that status is sticky until an E-Board member manually
  lifts it. The function only ever *sets* `probation`; it never reverts a
  member back to `active`.
- **`recordLateCancel` window**: "within 24 hours" is computed as
  `event.starts_at - now() <= 24h`, which also treats cancellations after
  the event has already started as late.
- **`syncToGoogleSheets` tabs**: writes a fixed `Current Semester` tab,
  overwritten on every call. Pass `{ archive: true }` (or `archive: true`
  in the request body over HTTP) to also append a timestamped snapshot to
  an `Archive` tab — `calculateEndOfSemesterStanding` does this once it
  locks results, per spec 14.2. Plain on-demand/nightly syncs don't archive.
- **Nightly sync**: `nightlySheetsSync.js` is a separate, unauthenticated
  entrypoint meant for an EventBridge schedule (see
  `infra/nightly-sheets-sync.template.yaml`) — it isn't deployed by
  anything in this repo, the template is a reference to wire into whatever
  stack deploys the other Lambdas, against the chapter's own AWS account.
- **No-show sweep**: lives inside `completeEvent`, not a separate function —
  it flips any `rsvps.status = 'going'` row with no matching `attendance`
  row to `no_show` right before the penalty pass, so there's one atomic
  "complete this event" operation rather than a sweep that has to run
  before completion and hope nothing races it. Skipped for `category =
  'meeting'` (meetings don't use `rsvps` at all, but the check is explicit
  rather than incidental).
- **QR check-in expiry**: spec says "event end time or fixed 2-hour
  window" — events have no explicit end time in this schema, so
  `generateCheckInToken` always uses a fixed 2-hour window from generation
  time (`CHECKIN_WINDOW_HOURS` in `src/lib/qrToken.js`).
- **`recordAttendance` has two handlers**: the default `handler` takes a
  raw `eventId` (manual check-in, where E-Board already knows which event
  they're on). `qrHandler` takes a `token` from the scanned QR URL instead
  and resolves the event from it (`recordAttendanceViaQr`) — same
  dedupe/RSVP logic either way, just a different way of naming the event.
- **`removeAttendance`**: the correction path from spec 6.8. Deletes the
  `attendance` row and posts an offsetting `-points_value` ledger entry
  with a required note (the original `+points_value` entry stays
  immutable — net effect zero, full audit trail). No ledger entry for
  meetings, same rule as everywhere else.
- **`createSemester`**: only inserts the new row with `is_active = true` —
  the previous active semester's flip to `is_active = false` is a DB
  trigger (`semesters_flip_active`, migration 0009), per spec 10.1's own
  wording ("Database trigger flips previous active semester"), not
  something this function does itself. Warns (`error:
  'active_semester_has_scheduled_events'`) if the current active semester
  has any `status = 'scheduled'` events and `confirm` wasn't passed;
  passing `confirm: true` skips the check and proceeds regardless.

## Deploying

`template.yaml` in this directory is a ready-to-use AWS SAM template
covering all 9 API Gateway-fronted functions (including `recordAttendance`'s
two separate routes for its `handler`/`qrHandler` exports) behind one
shared HTTP API, plus the nightly Sheets sync cron gated behind an
`EnableNightlySync` parameter. It doesn't bundle per-function (no esbuild
tree-shaking) — every function ships with the full `node_modules`,
including `googleapis` even though only `syncToGoogleSheets` needs it.
That's a deliberate simplicity-over-package-size tradeoff for a small
chapter deployment; revisit with per-function esbuild bundling if package
size ever becomes a real problem.

Step-by-step deploy instructions (including exactly what to enter for
`sam deploy --guided`'s prompts) are in `../DEPLOY.md`, not here — that
file also covers the Google Sheets credential setup and test-account
creation steps that have to happen alongside this.
