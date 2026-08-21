# AKPsi Portal — Handoff

Working directory: `/Users/samaksh/akpsi-folder/akpsi-portal`

All 8 original spec phases are done. An MVP is live with test data — Lambdas deployed, app hosted and working. This file covers what's still open: edge cases, end-to-end testing, and upcoming features.

---

## ⚠️ Read this before doing anything

1. **Live database, no local option.** There is no Docker/local Postgres — all schema work happens directly against the linked live Supabase project (`rmqgnapkcfbcksbrgnor`, org `wsuakpsi's Project`) via `supabase db push` / `supabase db query --linked "<sql>"`. No sandbox — check existing data before any backfill or destructive migration.

2. **AWS credentials on a new machine** — the AKPsi AWS account is separate from any employer/work account. Verify with `aws sts get-caller-identity` before running any `aws`/`sam` commands — should show the AKPsi account, not a work account.

---

## AWS Account

A dedicated AKPsi AWS account exists. An IAM admin user has been created with an access key (Access Key ID + Secret Access Key saved by Samaksh).

**To set up AWS CLI on a new machine:**
1. Install AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
2. Install AWS SAM CLI: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html
3. `aws configure` — enter the IAM access key ID + secret, region `us-east-1`, output `json`
4. Verify with `aws sts get-caller-identity`

**Before handing this account to the next tech chair:**
- Change the root email to a chapter-owned email in AWS account settings
- Swap the credit card to the chapter card in Billing → Payment methods
- Add the next person as an IAM admin user

---

## What's still open

### 1. End-to-end testing & edge cases

MVP is live with test data. Still needs a real test pass covering:
- Full attendance flow: QR check-in → complete event → points ledger updated correctly
- Cancel event → approved missing-meeting forms voided → brothers notified
- Calculate standing → per-check breakdown correct, double-run guard works, Sheets archive fires
- LTA application → first-semester block, duplicate guard, resubmission after denial
- BiP create → resolve/escalate (note required for both) → brother sees it on profile
- Role flip → DB constraint rejects any mismatch
- Semester creation → scheduled-events warning → trigger flips previous semester inactive

### 2. Google Calendar integration (code done, needs Google Workspace setup)

The code is merged to `main`. When an E-Board member adds an event in the portal, a corresponding event is automatically created on the shared chapter Google Calendar.

**What you need to do in Google Workspace (use the AKPsi chapter Google account):**

1. **Enable the Google Calendar API** — go to [console.cloud.google.com](https://console.cloud.google.com) → the same project as your Sheets service account → APIs & Services → Library → search "Google Calendar API" → Enable.

2. **Share the chapter calendar with the service account** — Google Calendar → chapter calendar settings → "Share with specific people" → add the service account email (the `client_email` field in your `GOOGLE_SERVICE_ACCOUNT_JSON`) → give it "Make changes to events" permission.

3. **Get the Calendar ID** — same calendar settings page → "Integrate calendar" → copy the Calendar ID (looks like `abc123@group.calendar.google.com`).

4. **Deploy with the new param** — `sam deploy --guided` will now prompt for `GoogleCalendarId` — paste the ID from step 3. Also set `VITE_ADD_TO_CALENDAR_URL` in your frontend env to the new `/add-to-calendar` API Gateway route.

If `VITE_ADD_TO_CALENDAR_URL` is not set, calendar sync is silently skipped — no breakage. If it is set but the Calendar API fails, the event is still saved to the DB and the user gets a warning toast (best-effort sync, not blocking).

### 3. Email notifications (not implemented yet — Resend recommended)

Currently the DB has a `notifications` table that the app reads, but nothing sends actual emails. The recommendation is **Resend** (not AWS SES, not Gmail API):

- No AWS approval process to worry about
- Resend can also serve as Supabase's custom SMTP provider — meaning auth emails (magic links, `inviteUserByEmail`) come from your own domain too, not Supabase's default sender
- One API key covers both use cases
- Free tier: 3,000 emails/month, 100/day — more than enough for a chapter

**Setup:**
1. Create a Resend account at [resend.com](https://resend.com) using the AKPsi chapter email
2. Add your domain's DNS records (Resend walks you through it)
3. In Supabase dashboard → Settings → Auth → SMTP — plug in Resend's SMTP credentials so auth emails come from your domain
4. Add a `RESEND_API_KEY` env var to the Lambda stack (new `template.yaml` parameter, same pattern as `GoogleServiceAccountJson`)
5. Create a `lambdas/src/lib/resendClient.js` (same pattern as `googleSheetsClient.js`) and call it from whatever Lambda triggers the notification (event creation, cancellation, form review, etc.)

The existing `notifications` table rows are already being inserted by Lambdas on relevant events — email sending would just be an additional step in those same Lambdas after the DB insert.

---

## Quick reference

- **Migrations applied**: `0001`–`0012`, all confirmed live (`supabase migration list` shows matching local/remote versions)
- **Auth pattern for any new Lambda**: use `wrapEboardHandler` or `wrapAuthedHandler` from `lambdas/src/lib/httpResponse.js` — never a bare handler. Lambdas run with the service-role key and bypass RLS entirely, so the wrapper is the only auth check.
- **Frontend pattern for calling a Lambda**: `callLambda(url, body)` from `src/lib/lambdas.js`, url from an env var following the `VITE_<THING>_URL` naming in `.env.example`.
- **Testing pattern that actually hits the DB**: `node -e "import('./lambdas/src/<file>.js').then(m => m.<coreFn>(...))"` with `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` sourced from `.env.local`. Always create and delete a throwaway row rather than mutating real data.
- **Current state**: MVP live with test data, Lambdas deployed behind API Gateway, app hosted. Full E2E testing against real logins is now possible — see "End-to-end testing & edge cases" above.
