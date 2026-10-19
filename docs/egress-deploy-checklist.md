# Egress fixes — deploy checklist

Order matters. Do these in sequence; each step says how to confirm it and how to undo it. Nothing here has been run against production. Target: finished before the deliberation, ideally by Friday.

Production project: `rmqgnapkcfbcksbrgnor` (the same project the brother/E-Board portals use — see EGRESS_AUDIT.md). The migration and backfill touch only `rush_applications` and the `rush-applications` bucket.

## 0. Before you start

- [ ] Run the size query at the bottom of `EGRESS_AUDIT.md` in the SQL editor (read-only) and note the numbers.
- [ ] Check Supabase usage: org egress so far this cycle, and the Oct 25 grace-period end. If you are already near quota, tell me before step 2, because the backfill itself downloads each original headshot once (roughly applicants × avg headshot size, about 30 MB for 100 applicants at 300 KB).
- [ ] `git log --oneline` on `main` shows the egress commits (`feat(recruitment): store thumbnail/display headshot variants…` through `test: add local-only egress fixture seeder…`). Pushing `main` redeploys all three Amplify apps, so don't push unrelated work with it.
- [ ] `npm test` and `npm run check:egress` pass locally.

## 1. Migration 0041 (additive, do this first)

Adds two nullable columns: `rush_applications.headshot_thumbnail_path` and `headshot_display_path`. No policy, bucket or RLS change.

```bash
supabase db push --linked --dry-run
supabase db push --linked
```

Confirm the dry run lists only `0041_recruitment_headshot_variants.sql`. If it lists anything else, stop and look.

- Verify: `select column_name from information_schema.columns where table_name = 'rush_applications' and column_name like 'headshot_%';` returns 4 rows.
- **Why first:** the new frontend selects these columns by name; deploying it before the migration makes the candidate list fail with "column does not exist".
- Rollback: the old frontend ignores the columns, so leaving them is harmless. Only if you must: `alter table rush_applications drop column headshot_thumbnail_path, drop column headshot_display_path;` (loses nothing but the variant paths; the files stay in storage).

## 2. Backfill thumbnails (dry run, then apply)

**Required, not optional:** applications are closed, so every existing applicant lacks variants. Until this runs, list cards show initials (by design; the list never falls back to the full-size original).

Secrets come from your shell environment only. Do not put them in `.env.local` and do not paste them into chat. The script ignores `.env.local` on purpose.

```bash
export SUPABASE_URL="https://rmqgnapkcfbcksbrgnor.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<from Supabase dashboard → Project Settings → API>"
npm run backfill:headshot-variants
```

- [ ] Dry run prints `Target: rmqgnapkcfbcksbrgnor.supabase.co`, the number of applications needing variants (should equal the non-deleted applicant count), and `[dry-run]` lines. It downloads and writes nothing.
- [ ] Then apply. The extra flag is a guard against pointing at the wrong project:

```bash
npm run backfill:headshot-variants -- --apply --confirm-project-ref=rmqgnapkcfbcksbrgnor
```

- [ ] Output ends `Done. N succeeded, 0 failed.` Re-run the dry run: it must say `0 application(s) need variants`.
- Verify in SQL: `select count(*) from rush_applications where deleted_at is null and (headshot_thumbnail_path is null or headshot_display_path is null);` → 0. Spot-check object sizes: thumbnails should be under ~30 KB, display images under ~300 KB.
- Safe to re-run at any time: it only creates new objects (never overwrites), treats "already exists" as done, and fills only NULL columns. If some rows fail, fix the cause and run it again.
- Rollback: nothing to undo for the app. Variant objects are new files at new paths; you could delete them later, but there's no reason to. (This script never deletes.)
- Unset the key afterwards: `unset SUPABASE_SERVICE_ROLE_KEY`.

## 3. Frontend (Amplify)

Pushing `main` triggers Amplify for the brother, E-Board and recruitment apps. The changed code is gated by `VITE_PORTAL=recruitment` plus the shared `src/lib/applications.js` and `Apply.jsx`; the other two builds only need to compile.

- [ ] `npm run build` succeeds locally (it did on the last commit).
- [ ] `git push origin main`; watch all three Amplify builds go green.
- Verify on recruitment.wsuakpsi.com, signed in as an E-Board member, with DevTools → Network open (check "Disable cache" **off**):
  - [ ] Opening the list shows thumbnails loading as you scroll, total transfer well under 5 MB, and a single batched `object/sign` POST.
  - [ ] Opening a candidate loads one headshot (the 1024px one) and no PDF.
  - [ ] Clicking Resume / Cover letter opens the PDF in a new tab; clicking again reuses the same URL.
  - [ ] Clicking "All candidates" and re-sorting/searching transfers ~0 bytes of images and sends no new signing requests.
  - [ ] "Refresh list" fetches the applicant list again (use it if an application arrives late).
  - [ ] Votes, comments and the E-Board decision buttons still work, and live updates still arrive on a second device.
- Rollback: revert in Amplify to the previous successful build (Amplify console → the app → the earlier deployment → Redeploy this version), or `git revert` the egress commits and push. The old frontend still works with the migration and backfill in place, but it goes back to downloading full-size headshots.

## 4. Lambda (Google Sheets sync) — lowest priority

Only change: `syncRushApplicationsToSheets` selects an explicit column list instead of `*`. It does not affect egress meaningfully (manual button, ~200 KB per run), so it can wait until after the deliberation. When you do it:

```bash
cd lambdas
./deploy.sh
```

Always use `deploy.sh`, never a bare `sam deploy` (a bare deploy would wipe the Google credentials from every Lambda; see the script header). Confirm the AWS identity first with `aws sts get-caller-identity`.

- Verify: press "Sync to Google Sheets" on the Candidates page; the sheet's Applications tab has the same columns and row count as before.
- Note for later: this job runs with the service role, so it also exports soft-deleted applications. That predates this work and I did not change it.
- Rollback: `git revert 9a36af8` (the Lambda commit) and run `./deploy.sh` again.

## 5. After the deliberation

- [ ] Compare Supabase usage for the delib days with Sep 23–24 (~2.8 GB and ~2.4 GB). Target: under 1.5 GB for the whole delib.
- [ ] If the number is higher than expected, open `docs/egress-rules.md` and check which rule slipped, then tell me what the dashboard shows.
- [ ] Not verified before deploy: real production file sizes, Safari/mobile caching, a real multi-device session, and caching after the 1-hour URL expiry.
