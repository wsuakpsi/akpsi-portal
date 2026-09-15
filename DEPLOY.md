# Deploy guide — step by step

Follow these in order. Each section says exactly what to run/click. Stop and
ask if something errors in a way this doesn't cover.

---

## 1. AWS — deploy all Lambdas + API Gateway

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

The template is already written: `lambdas/template.yaml`. It defines all 14
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
| `VITE_ADD_TO_CALENDAR_URL` | `/add-to-calendar` |
| `VITE_INVITE_BROTHER_URL` | `/invite-brother` |

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


---

## 4. Supabase Auth — invite / password-reset links

The invite flow (E-Board "Invite brother" → email → set password → signed
in) depends on two dashboard settings that are **not** in this repo. If
either is wrong, brothers get logged in with no password and have to use
"Forgot password" to recover.

### 4a. Redirect URL allow-list (required)

Supabase only honours the `redirectTo` an invite/reset asks for if that
exact URL is on the allow-list; otherwise it silently redirects to the
**Site URL** instead.

**Authentication → URL Configuration:**

| Setting | Value |
|---|---|
| Site URL | `https://brother.wsuakpsi.com` |
| Redirect URLs | `https://brother.wsuakpsi.com/set-password`, `https://brother.wsuakpsi.com/reset-password`, `https://eboard.wsuakpsi.com/reset-password`, and the `http://localhost:5173/**` / `http://localhost:5180/**` equivalents for local dev |

(The app now also recognises an invite from the `type=invite` payload in
the URL, so a brother who lands on `/` still gets the set-password page —
but the allow-list is still the right fix, and it's what makes password
reset land on the right page.)

### 4b. Email templates (recommended — prefetch-proof links)

Default Supabase links point at `…/auth/v1/verify?token=…`, which is a
one-time link that gets consumed by whoever fetches it first. Corporate
mail scanners and some mobile clients pre-fetch links, so brothers see
"link expired / already used" on their very first click. The fix is to link
to our own page and only exchange the token when they press the button.

**Authentication → Email Templates → Invite user**, set the link to:

```
https://brother.wsuakpsi.com/set-password#token_hash={{ .TokenHash }}&type=invite
```

**Reset password** template, set the link to:

```
{{ .SiteURL }}/reset-password#token_hash={{ .TokenHash }}&type=recovery
```

Notes:

- The `#` (fragment) form is deliberate: S3/CloudFront 301-redirects
  `/set-password` → `/set-password/` and a query string can be dropped on
  that hop, but fragments always survive. The app accepts either form.
- With these templates the `redirectTo` passed by the Lambda / login page is
  no longer used, so 4a matters less — keep it anyway.
- Invite links expire after the "Email OTP expiration" in
  **Authentication → Providers → Email** (default 1 hour — raise it to
  24h, the max, so invites sent in the evening still work next morning).

### 4c. What the brother sees

1. Clicks the invite link → lands on **Set your password** (no "Verifying…"
   wait with the 4b template).
2. Enters a password → immediately signed in and taken to the portal.
3. On any other device, signs in with email + that password. "Forgot
   password" on the sign-in page sends a reset link (4b template) that works
   the same way.

---

## 5. Recruitment portal — recruitment.wsuakpsi.com

How the existing portals are actually hosted (discovered 2026-09-15, not
S3/CloudFront by hand): **AWS Amplify Hosting, region `us-east-2`**, one
Amplify app per portal, both connected to `github.com/wsuakpsi/akpsi-portal`
and auto-building the `main` branch on every push. The portals differ only
by the `VITE_PORTAL` env var set on each app. DNS for `wsuakpsi.com` is a
Route 53 hosted zone in the same AWS account, so Amplify wires subdomains
itself.

| App | Amplify app id | Domain | `VITE_PORTAL` |
|---|---|---|---|
| akpsi-portal | `d2s8e30x9bjue7` | eboard.wsuakpsi.com | `eboard` |
| akpsi-portal-brother | `d2pq2ttvw9cyox` | brother.wsuakpsi.com | `brother` |
| _(new)_ | — | recruitment.wsuakpsi.com | `recruitment` |

**Important consequence:** pushing to `main` redeploys *all* portals. The
recruitment code is gated on `VITE_PORTAL`, so it's inert in the other two
builds, but a broken build on `main` breaks everything.

### 5a. Push the code

Everything for the recruitment portal is on `main` locally but must be
pushed for Amplify to see it. Check `src/config/recruitment.js` first —
`APPLICATIONS_OPEN` should be `false` unless applications are open today.

```bash
git push origin main
```

### 5b. Create the Amplify app (console — needs the GitHub connection)

1. AWS Console → **Amplify** → region **us-east-2 (Ohio)** → **Create new
   app** → **GitHub**.
2. Pick `wsuakpsi/akpsi-portal`, branch `main`. (The Amplify GitHub App is
   already installed on the org for the other two apps.)
3. App name: `akpsi-portal-recruitment`. Leave the build settings as
   detected — it should match the other apps:
   ```yaml
   version: 1
   frontend:
     phases:
       preBuild:
         commands:
           - npm ci --cache .npm --prefer-offline
       build:
         commands:
           - npm run build
     artifacts:
       baseDirectory: dist
       files:
         - '**/*'
     cache:
       paths:
         - .npm/**/*
   ```
4. Under **Advanced settings → Environment variables**, add:

   | Key | Value |
   |---|---|
   | `VITE_PORTAL` | `recruitment` |
   | `VITE_SUPABASE_URL` | same value as the other apps |
   | `VITE_SUPABASE_ANON_KEY` | same value as the other apps |
   | `VITE_RUSH_SHEETS_SYNC_URL` | `https://xtaxg5inaa.execute-api.us-east-1.amazonaws.com/sync-rush-sheets` (only exists after 5d; the Sync button hides itself until this is set) |

   None of the other `VITE_*_URL` vars are needed — the recruitment portal
   only calls one Lambda.
5. **Save and deploy.** First build takes ~2–3 minutes.
6. **App settings → Rewrites and redirects** → add the SPA rule the other
   apps have, or `/login` will 404 on a hard refresh:
   `Source /<*>` → `Target /index.html` → Type `404 (Rewrite)`.

Steps 4 and 6 can also be done from the CLI once the app exists — see 5c.

### 5c. Custom domain

**Hosting → Custom domains → Add domain** → `wsuakpsi.com` (it's in Route 53
in this account, so it's offered) → subdomain prefix `recruitment` → branch
`main`. Amplify creates the CNAME + ACM cert; usually live in 5–15 minutes.

CLI equivalent (after 5b, with the new app id):

```bash
aws amplify create-domain-association --region us-east-2 \
  --app-id <NEW_APP_ID> --domain-name wsuakpsi.com \
  --sub-domain-settings prefix=recruitment,branchName=main
```

Then in **Supabase → Authentication → URL Configuration → Redirect URLs**
add `https://recruitment.wsuakpsi.com/reset-password` and
`http://localhost:5181/**` (so password resets from the recruitment login
page land on the right domain).

### 5d. Deploy the Sheets-sync Lambda + finish Sheets for every portal

`SyncRushApplicationsToSheetsFunction` is in `lambdas/template.yaml` but
hasn't been deployed. Sheets sync for the brother/E-Board portals was also
never finished (`GoogleSheetsSpreadsheetId` is still blank in the deployed
stack). One `sam deploy` covers both.

1. Do section **2** steps 1–5 once if you haven't (service account JSON +
   share the sheet with it). **Create two spreadsheets**: the chapter
   points/attendance one, and a separate one for applications. Share both
   with the service account (Editor).
2. Deploy, guided so every existing parameter keeps its current value and
   you only type the new ones:
   ```bash
   cd lambdas
   sam build
   sam deploy --guided
   ```
   When prompted:
   - `GoogleServiceAccountJson` → paste the JSON **as one line**
     (`cat key.json | tr -d '\n' | pbcopy` on a Mac copies it ready to paste)
   - `GoogleSheetsSpreadsheetId` → the points/attendance spreadsheet id
   - `RushApplicationsSpreadsheetId` → the applications spreadsheet id
   - `EnableNightlySync` → `true`
   - everything else → press Enter to keep the saved value
3. The output `RouteMap` now includes `/sync-rush-sheets`. Add the full URL
   as `VITE_RUSH_SHEETS_SYNC_URL` on the recruitment Amplify app (5b step 4)
   and redeploy it (**Redeploy this version** in the console is enough — env
   vars are read at build time).

After this: the E-Board portal's **Sheets sync** page and the recruitment
**Sync to Google Sheets** button both work, and the nightly cron writes the
points sheet at 07:00 UTC.

### 5e. Verify

- `https://recruitment.wsuakpsi.com/` → closed page (or the form if
  `APPLICATIONS_OPEN` is true).
- `https://recruitment.wsuakpsi.com/login` → sign in → candidate list.
- As E-Board: click **Sync to Google Sheets** → an `Applications` tab appears
  in the applications spreadsheet.
- Run `npm run unseed:recruitment` locally to remove the test candidates
  before real applications open.
