# Security & UX review notes

Findings from a full pass over the portal (frontend, Lambdas, migrations,
landing page). Items marked **fixed** were changed in code; the rest need a
decision or a change outside this repo (Supabase dashboard, CloudFront, AWS).

## Fixed in code

| Area | Issue | Fix |
|---|---|---|
| Lambda `/record-attendance` | Used a "self **or** officer" rule, so any signed-in brother could POST `{eventId, memberId: <own id>}` and award themselves attendance points for any scheduled event without a QR code. The brother portal never calls this route. | Officer-only (`wrapEventManagerHandler`). The unused self-or-officer wrapper was deleted so it can't be reached for again. |
| All Lambdas | Unexpected errors returned the raw `err.message` (DB error text, env-var names) to the browser. | 500s now return a generic message; the real error still goes to CloudWatch. |
| `/invite-brother` | No email format check; free-text fields not trimmed. | Basic shape check + trim before spending an Auth admin call. |
| `/add-to-calendar` | Missing `category` crashed with a 500; bad `startsAt`/`durationMinutes` were passed straight to Google. | Validated up front, returns 400-style `{ success:false }`. |
| `/post-adjustment` | No bound on `delta` or note length. | ±1000 points / 1000 chars max. |
| Brothers CSV export | Cells were not protected against spreadsheet formula injection. Full names are user-entered on `/join`, so `=HYPERLINK(...)` as a name would execute when the CSV opened in Excel/Sheets. | Cells starting with `= + - @ \t \r` are prefixed with `'`. |
| Portal `index.html` | No CSP, no referrer policy. | Production builds inject a `Content-Security-Policy` `<meta>` whose allowed origins are derived from the `VITE_*_URL` env vars (see `vite.config.js`; `VITE_CSP=off` disables it). `referrer` set to `strict-origin-when-cross-origin`. |
| Landing page | Inline script, no CSP, `rel="noopener"` only. | Script moved to `year.js`, strict CSP meta, `noopener noreferrer`. |

UX / accessibility fixes (no behaviour change):

- Shared `src/components/Modal.jsx`: every E-Board modal and the brother "Add to Home Screen" sheet now have `role="dialog"`, `aria-modal`, a labelled heading, Escape-to-close, focus moved in on open and restored on close, Tab kept inside the dialog, and body scroll locked. Backdrop-click-to-close is unchanged.
- Notification rows in the brother top bar are real `<button>`s (keyboard reachable); the bell announces unread count and its expanded state; Escape closes the dropdown.
- Tabs on the brother Attendance/Events pages use `role="tablist"` / `role="tab"` / `aria-selected`.
- Error messages use `role="alert"`; loading placeholders use `role="status"`.
- Every unlabeled search box / filter `<select>` has an `aria-label`; empty table header cells for action columns have screen-reader-only "Actions" text.
- Visible keyboard focus rings (`:focus-visible`) in all three stylesheets; `prefers-reduced-motion` respected.
- E-Board portal: disabled buttons now look disabled; wide tables scroll inside their card; a `max-width: 820px` breakpoint collapses the fixed sidebar into a top bar so the portal is usable on a phone.
- Password inputs carry `minLength={8}` (matches the existing client check).

## Needs a decision / change outside this repo

### 1. First-login member promotion happens client-side (high)

`src/lib/auth.js#getMyProfile` inserts the new `members` row from the
browser, copying `role` / `status` from `pending_invites`. That only works if
the live DB has an INSERT policy on `members` for `authenticated` — none of
the tracked migrations create one (0002 explicitly says "service_role only").
Whatever that live policy is, it must **not** let the client choose `role`,
or a user could insert themselves as `eboard`. Verify with:

```sql
select policyname, cmd, qual, with_check from pg_policies where tablename = 'members';
```

Recommended: move the promotion into a `security definer` RPC
(`claim_pending_invite()`) that reads `pending_invites` for `auth.email()`
and inserts the member row itself, then drop the client-side insert policy.

### 2. `/join` is open self-registration (high, by design?)

Anyone with the URL can create an account and land in the brother portal as
an active brother (events, leaderboard, other brothers' names via the
leaderboard RPC). If the link is meant to be semi-private, consider a join
code stored in a table and checked by the `pending_invites_insert_self`
policy, or an "approved by E-Board" status that gates portal access.

### 3. `proofs` storage bucket is public (medium)

Missing-meeting and lower-threshold proofs (doctor's notes, work schedules)
are uploaded to a public bucket and stored as public URLs. Anyone with the
URL can read them. Recommended: make the bucket private, store the object
path instead of the public URL, and have the Forms page create short-lived
signed URLs (`storage.from('proofs').createSignedUrl(path, 60)`).

### 4. API Gateway: CORS `*` and no throttling (low/medium)

Bearer-token auth means the wildcard CORS is not exploitable for CSRF, but
tightening `AllowOrigins` to the two portal origins in `lambdas/template.yaml`
removes a class of mistakes. Also add a default throttle
(`DefaultRouteSettings: { ThrottlingBurstLimit, ThrottlingRateLimit }`) so a
scripted client can't hammer `/invite-brother` (each call sends an email).

### 5. Response headers at CloudFront (low)

A `<meta>` CSP can't set `frame-ancestors`. Attach a CloudFront Response
Headers Policy to both distributions with:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

### 6. Repo hygiene (low)

- `supabase/.temp/*` is tracked in git despite the `.gitignore` entry
  (project ref and pooler host — no secret, but noise). `git rm -r --cached supabase/.temp`.
- `lambdas/service-account.json` and `lambdas/.aws-sam/` exist on disk and
  are correctly ignored; nothing sensitive is in git history.
- `.env.local` holds `SUPABASE_SERVICE_ROLE_KEY`. It is not `VITE_`-prefixed
  so Vite never bundles it, but it lives next to the frontend build — keep it
  out of any CI artifact.

### 7. Smaller UX follow-ups (not done, would change behaviour)

- Proof/file uploads have no size or type limit client-side; a >50 MB file
  fails with a raw storage error.
- `window.confirm` dialogs (late-cancel, cancel event, promote/demote) could
  move to the shared `Modal` for consistency with "Mark complete".
- Supabase auth error strings are shown verbatim on the login page; mapping
  the common ones to friendlier copy would help.
