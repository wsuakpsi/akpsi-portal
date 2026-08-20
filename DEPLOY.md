# Deploy guide — step by step

Follow these in order. Each section says exactly what to run/click. Stop and
ask if something errors in a way this doesn't cover.

---

## 1. AWS — deploy all 9 Lambdas + API Gateway

### 1a. One-time setup

1. Make sure you're using the chapter's **own** AWS account, not a personal
   or work one. Check which account your CLI is pointed at:
   ```bash
   aws sts get-caller-identity
   ```
   If the `Account` or `Arn` looks unfamiliar/wrong, run `aws configure
   --profile akpsi` and enter that account's access key/secret (from IAM →
   Users → your user → Security credentials → Create access key), then
   prefix every command below with `AWS_PROFILE=akpsi`.

2. Install the SAM CLI (one-time):
   ```bash
   brew install aws-sam-cli
   ```

3. Install the Lambda dependencies:
   ```bash
   cd lambdas
   npm install
   ```

### 1b. Deploy

The template is already written: `lambdas/template.yaml`. It defines all 9
API-facing Lambdas behind one shared HTTP API, plus the nightly Sheets-sync
cron (disabled by default until you've done step 2 below).

```bash
cd lambdas
sam build
sam deploy --guided
```

`--guided` will interactively ask you for:

| Prompt | What to enter |
|---|---|
| Stack Name | `akpsi-portal` (or anything memorable) |
| AWS Region | wherever the chapter wants this hosted, e.g. `us-east-1` |
| Parameter SupabaseUrl | your `VITE_SUPABASE_URL` value from `.env.local` |
| Parameter SupabaseServiceRoleKey | your `SUPABASE_SERVICE_ROLE_KEY` value from `.env.local` |
| Parameter QrCheckinJwtSecret | make up a new random string — e.g. run `openssl rand -hex 32` and paste the output. **Do not** reuse any Supabase-issued secret. |
| Parameter GoogleServiceAccountJson | leave blank for now (fill in after step 2) |
| Parameter GoogleSheetsSpreadsheetId | leave blank for now (fill in after step 2) |
| Parameter EnableNightlySync | `false` for now |
| Confirm changes before deploy | `Y` |
| Allow SAM to create IAM roles | `Y` |
| Disable rollback | `N` |
| Save arguments to samconfig.toml | `Y` — this makes every future `sam deploy` a one-liner |

It'll take a few minutes. When it finishes, it prints an `Outputs` section
with `ApiBaseUrl` — something like
`https://abc123xyz.execute-api.us-east-1.amazonaws.com`.

### 1c. Wire the URLs into the frontend

Take that base URL and fill in `.env.local` at the project root using this
mapping (path appended to the base URL):

| `.env.local` variable | Path to append |
|---|---|
| `VITE_COMPLETE_EVENT_URL` | `/complete-event` |
| `VITE_CANCEL_EVENT_URL` | `/cancel-event` |
| `VITE_POST_ADJUSTMENT_URL` | `/post-adjustment` |
| `VITE_REVIEW_FORM_URL` | `/review-form` |
| `VITE_CALCULATE_STANDING_URL` | `/calculate-standing` |
| `VITE_CREATE_SEMESTER_URL` | `/create-semester` |
| `VITE_GENERATE_CHECKIN_TOKEN_URL` | `/generate-checkin-token` |
| `VITE_RECORD_ATTENDANCE_URL` | `/record-attendance` |
| `VITE_RECORD_ATTENDANCE_QR_URL` | `/record-attendance-qr` |
| `VITE_REMOVE_ATTENDANCE_URL` | `/remove-attendance` |
| `VITE_RECORD_LATE_CANCEL_URL` | `/record-late-cancel` |
| `VITE_SHEETS_SYNC_URL` | `/sync-sheets` |

Example: if `ApiBaseUrl` is `https://abc123xyz.execute-api.us-east-1.amazonaws.com`,
then `VITE_COMPLETE_EVENT_URL=https://abc123xyz.execute-api.us-east-1.amazonaws.com/complete-event`.

Restart the dev server after editing `.env.local` (Vite only reads it on
startup).

**At this point every Lambda-gated action in the app should work** except
Sheets sync (needs step 2) and the nightly cron (also needs step 2).

---

## 2. Google Sheets integration

1. Go to [console.cloud.google.com](https://console.cloud.google.com),
   create a new project (or use an existing one for the chapter).
2. **APIs & Services → Library** → search "Google Sheets API" → Enable.
3. **APIs & Services → Credentials → Create Credentials → Service Account.**
   Name it anything (e.g. `akpsi-sheets-sync`). Skip granting it project
   roles — it doesn't need any.
4. Click into the new service account → **Keys** tab → **Add Key → Create
   new key → JSON**. This downloads a `.json` file — keep it private, it's
   a real credential.
5. Open the target Google Sheet (or create a new one for this). Click
   **Share**, paste the service account's email address (looks like
   `akpsi-sheets-sync@your-project.iam.gserviceaccount.com`, also inside
   the downloaded JSON as `client_email`), give it **Editor** access.
6. Grab the spreadsheet ID from its URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`.
7. Re-run the deploy with the two values filled in:
   ```bash
   cd lambdas
   sam deploy --parameter-overrides \
     GoogleServiceAccountJson="$(cat /path/to/downloaded-key.json | tr -d '\n')" \
     GoogleSheetsSpreadsheetId="<spreadsheet-id-from-step-6>" \
     EnableNightlySync=true
   ```
   (Since you saved `samconfig.toml` in step 1b, this reuses everything
   else from before — you're only overriding these three.)
8. Fill in `VITE_SHEETS_SYNC_URL` in `.env.local` if you haven't already
   (see the table in section 1c).

---

## 3. Create your test login

Claude won't do this part — see `HUMAN_TASKS.md` for why. It's quick:

1. Go to your Supabase project dashboard → **Authentication → Users → Add
   user**.
2. Email: `samaksharora.09@gmail.com` (or set `SEED_EBOARD_EMAIL` in
   `.env.local` to a different email if you'd rather use another address —
   the seed script reads that override).
3. Set any password you'll remember. Check "Auto Confirm User" if offered,
   so you don't need to click an email confirmation link.
4. Back in the terminal:
   ```bash
   npm run seed:eboard
   ```
   This backfills the `members` row for that email as an E-Board member
   with a realistic set of test data (points, events, forms, etc.) — safe
   to re-run, it won't duplicate anything.
5. Start the dev server (`npm run dev:eboard` for the E-Board portal, or
   `npm run dev` for brother) and log in with that email/password.

If you also want a **brother**-role test account to check the brother
portal and RLS boundaries (e.g. confirming a brother can't see another
brother's BiPs), repeat steps 1-3 with a second email, then insert its
`members` row directly:
```bash
supabase db query --linked "insert into members (email, full_name, pledge_class, role, status) values ('your-second-test-email@example.com', 'Test Brother', 'Test Class', 'brother', 'active');"
```

---

## 4. Click-test

Once you're logged in with Lambdas deployed, work through the punch list
in `HUMAN_TASKS.md` section 4, newest-code-first. Report anything that
breaks back here (or to a fresh Claude Code session with `HANDOFF.md` and
this file as context) and it can get fixed fast — nothing in this app has
been exercised against a real session before, so the first pass is where
real bugs will surface.
