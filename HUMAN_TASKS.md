# Human-only next steps

Everything below requires you specifically — credentials, account creation, and
real-device/browser testing are all things Claude won't do (see the "why" notes).
Cross-reference with `HANDOFF.md` for the full technical writeup of what's been built.

## 1. AWS — deploy the Lambdas

Nothing in `lambdas/src/` has ever been deployed. Until this is done, every
"E-Board clicks a button" action in the app (point adjustments, event
complete/cancel, attendance check-in, form review, calculate standing,
sheets sync, create semester, remove attendance, late-cancel RSVP) has
nowhere to send its request and will fail.

- [ ] Decide which AWS account this chapter actually owns. **Do not use the
      AWS credentials configured in this dev environment** — they resolve to
      an unrelated employer/work account (see HANDOFF.md warning #2).
- [ ] Bundle each file in `lambdas/src/*.js` as a Lambda (exclude `googleapis`
      from bundles other than `syncToGoogleSheets.js` to keep them small —
      see `lambdas/README.md`'s Deploying section).
- [ ] Stand up API Gateway routes in front of each Lambda's `handler` export.
      `recordAttendance.js` needs **two** routes — one for `handler` (manual),
      one for `qrHandler` (QR scan) — since it's one file with two entrypoints.
- [ ] Set Lambda env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (both
      already in your local `.env.local`, just copy them in), plus
      `QR_CHECKIN_JWT_SECRET` (make up a new secret, don't reuse anything
      Supabase-issued). Full table in `lambdas/README.md`.
- [ ] Fill in every `VITE_*_URL` in `.env.local` (frontend) with the real
      API Gateway URLs once deployed — see `.env.example` for the full list,
      including the two new ones from this session:
      `VITE_CREATE_SEMESTER_URL` and (already there) `VITE_CALCULATE_STANDING_URL`.
- [ ] Optional but recommended: wire up the nightly Sheets sync cron.
      `lambdas/src/nightlySheetsSync.js` + `lambdas/infra/nightly-sheets-sync.template.yaml`
      are ready but not deployed — needs an EventBridge schedule pointing at it.

## 2. Google Sheets integration

`syncToGoogleSheets` needs its own credentials, separate from AWS:

- [ ] Create a Google Cloud service account, share the target spreadsheet
      with its email address (Editor access).
- [ ] Set `GOOGLE_SERVICE_ACCOUNT_JSON` (full credentials JSON as a string)
      and `GOOGLE_SHEETS_SPREADSHEET_ID` as Lambda env vars.

## 3. Create real test accounts (Claude will never do this step)

Claude does not create accounts or enter passwords into any login form —
including test/dev accounts — as a hard rule, regardless of how low-stakes
it seems. This has blocked click-testing since Phase 1 and is unrelated to
AWS.

- [ ] In the Supabase dashboard (Auth → Users), create at least two test
      logins: one E-Board (`role = 'eboard'`, `eboard_position` set), one
      brother (`role = 'brother'`). Set a real password on each — `supabase
      auth admin` or the dashboard's "reset password" flow both work.
- [ ] `scripts/seed-eboard.mjs` (`npm run seed:eboard`) looks up a
      *pre-existing* Supabase Auth user by email and backfills their
      `members` row — it does not create the Auth user or set a password.
      Run it after creating the Auth user, not instead of.
- [ ] Once you have working logins, you (or Claude driving the browser tool
      while you're signed in) can finally click-test the full list below.

## 4. Click-test punch list, once you have logins + deployed Lambdas

Nothing in this project has been tested end-to-end. Priority order —
newest/least-verified code first:

- [ ] **Phase 8, this session**: create a semester (with and without
      scheduled events on the current one, to hit the confirm-dialog path),
      brother notifications page (read + mark-read), LTA application submit
      (proof required, denied → resubmit, duplicate-application rejection,
      first-semester block after setting `first_semester_initiated` on a
      test brother from Brother Detail).
- [ ] **Phase 7**: create a BiP, resolve one, escalate one (both require a
      note — this was a correction to my own earlier plan, worth double-checking),
      brother-side read-only BiP view.
- [ ] **Phase 6**: role flip promote/demote (confirmation dialog fires,
      notification arrives), status change, manual point adjustment.
- [ ] **Phase 5**: Calculate Standing — run it once, verify the results
      table, verify notifications went to *every* brother (not just failing
      ones), verify `member.status` did **not** auto-change (this was a
      deliberate spec-driven fix — see HANDOFF.md if you want to revert it),
      run it again to confirm the double-run confirmation prompt works,
      check the Sheets Archive tab got a snapshot.
- [ ] **Phases 1–4** (never tested either, just older): QR check-in, manual
      check-in, remove-attendance correction, event cancel cascade
      (voids approved forms, notifies), no-show sweep on event completion,
      missing-meeting-form review, Sheets sync (current-semester tab).

## 5. Decisions worth revisiting once you can actually see it running

- [ ] `member.status` no longer auto-changes after Calculate Standing (spec
      says this should be manual). You approved this — just flagging it's a
      one-line revert if it turns out to be annoying in practice.
- [ ] Spec 2.4 suggests (doesn't require) restricting the role-flip control
      to President/VP Membership only. Not built — every E-Board member can
      currently do it, consistent with how every other E-Board action in
      this app works.
- [ ] `first_semester_initiated` has no data for any existing member. Decide
      how/when E-Board actually populates it for the current roster (there's
      no bulk-import tool, just the one-at-a-time field on Brother Detail).

## 6. Real infrastructure hygiene (lower priority, not blocking)

- [ ] Three moderate/high npm vulnerabilities were surfaced in Phase 4
      (`googleapis`→`uuid`, `vite`→`esbuild`, `react-router`), all requiring
      breaking major-version bumps. Not fixed — out of scope for this
      project, but worth a look before this goes to production.
