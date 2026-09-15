# Human-only next steps

Everything below requires you specifically — credentials, account creation, and
real-device/browser testing are all things Claude won't do (see the "why" notes).
Cross-reference with `HANDOFF.md` for the full technical writeup of what's been built.

**→ For exact step-by-step commands for sections 1-3, see [`DEPLOY.md`](DEPLOY.md).**
It has a ready-to-use SAM template (`lambdas/template.yaml`) covering all
Lambdas + API Gateway in one deploy, plus a URL-to-env-var mapping table so
wiring `.env.local` afterward is copy/paste, not guesswork.

## 1. AWS — deploy the Lambdas

Nothing in `lambdas/src/` has ever been deployed. Until this is done, every
"E-Board clicks a button" action in the app (point adjustments, event
complete/cancel, attendance check-in, form review, calculate standing,
sheets sync, create semester, remove attendance, late-cancel RSVP) has
nowhere to send its request and will fail.

- [ ] Decide which AWS account this chapter actually owns. **Do not use the
      AWS credentials configured in this dev environment** — they resolve to
      an unrelated employer/work account (see HANDOFF.md warning #2).
- [ ] `DEPLOY.md` section 1: `sam build && sam deploy --guided` from
      `lambdas/`, using `lambdas/template.yaml` (already written — covers
      all API-facing functions behind one shared HTTP API, including
      `recordAttendance.js`'s two separate routes for its two handlers).
- [ ] Fill in every `VITE_*_URL` in `.env.local` (frontend) with the real
      API Gateway URLs from the deploy output — mapping table in
      `DEPLOY.md` section 1c.
- [ ] Optional but recommended: the nightly Sheets sync cron is in the same
      template (`NightlySheetsSyncFunction`, EventBridge `ScheduleV2`),
      gated behind the `EnableNightlySync` parameter — flip it on once
      Google Sheets (section 2) is set up.

## 2. Google Sheets integration

`syncToGoogleSheets` needs its own credentials, separate from AWS. Full
click-by-click steps in `DEPLOY.md` section 2 (create a Google Cloud
service account, share the target spreadsheet with it, feed the two values
back into a `sam deploy --parameter-overrides` call).

## 2b. Supabase Auth URL settings + email templates (invite flow)

The "invite link logs people in with no password" bug is a dashboard
configuration issue, not (only) code — see `DEPLOY.md` section 4.

- [ ] Add `https://brother.wsuakpsi.com/set-password` and
      `…/reset-password` to **Authentication → URL Configuration → Redirect
      URLs** (and set Site URL to the brother portal).
- [ ] Switch the **Invite user** and **Reset password** email templates to
      the `token_hash` links in `DEPLOY.md` 4b so link pre-fetchers can't
      burn the one-time token.
- [ ] Raise **Email OTP expiration** to 24h.
- [ ] Send yourself a test invite from the Brothers page and confirm: link →
      set password → straight into the portal → sign out → sign back in with
      that password on another browser.
- [x] Self-serve join is disabled: `src/pages/Join.jsx` now shows an
      "invite only, contact VP Membership or VP Technology" message instead
      of a sign-up form, and migration `0031_disable_self_join.sql` drops
      migration 0020's `pending_invites_insert_self` policy so the API can't
      be called directly either. **Run `supabase db push` (or apply
      `0031_disable_self_join.sql`) against the live project** — this repo
      change alone doesn't touch the deployed database. The `isJoin` branch
      in `src/App.jsx` and `src/pages/Join.jsx` itself can still be deleted
      outright later if nothing should ever land on `/join` again.

## 3. Create real test accounts (Claude will never do this step)

Claude does not create accounts or enter passwords into any login form —
including test/dev accounts — as a hard rule, regardless of how low-stakes
it seems. This has blocked click-testing since Phase 1 and is unrelated to
AWS. Steps in `DEPLOY.md` section 3 — it's smaller than it sounds:
`scripts/seed-eboard.mjs` already defaults to seeding
`samaksharora.09@gmail.com` as the E-Board test account, so the only human
step is creating that one Supabase Auth user + password in the dashboard,
then Claude (or you) can run `npm run seed:eboard` to backfill realistic
test data — that part needs no password, just the already-configured
service role key.

- [ ] Once you have a working login, you (or Claude driving the browser tool
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

## 6. Recruitment portal (new — public applications + deliberation)

Schema is live (migrations `0026`/`0027`), and the frontend
(`VITE_PORTAL=recruitment`, `npm run dev:recruitment`) works against it
already — anonymous applicants can submit at `/`, and any signed-in member
can vote/comment/deliberate at `/recruitment`. What's still needed:

- [ ] **Host it** at `recruitment.wsuakpsi.com` — a third **Amplify** app
      (us-east-2) on the same repo/branch as brother and eboard, with
      `VITE_PORTAL=recruitment`. Exact steps: `DEPLOY.md` section 5.
- [x] **Google Sheets + Calendar credentials deployed** (2026-09-15) — see `DEPLOY.md` 5d; deploy Lambdas with `lambdas/deploy.sh` from now on.
- [ ] **Click-test once deployed**: submit a real application through the
      public form, confirm it shows up in the deliberation dashboard, vote
      as two different members and check the tally updates live for the
      E-Board one without a refresh (Realtime), post and delete a comment as
      E-Board, and confirm a brother account can't see the tally, the
      decision, or the comment box (they can read notes, not write them).

## 7. Real infrastructure hygiene (lower priority, not blocking)

- [ ] Three moderate/high npm vulnerabilities were surfaced in Phase 4
      (`googleapis`→`uuid`, `vite`→`esbuild`, `react-router`), all requiring
      breaking major-version bumps. Not fixed — out of scope for this
      project, but worth a look before this goes to production.
