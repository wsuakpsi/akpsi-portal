# Egress audit — recruitment / deliberation portal

Read-only audit of this repo (`akpsi-portal`) as of commit `966795f`. Byte figures are **estimates** from the code, not measurements: nothing here was run against the production project. Replace the assumed file sizes with real ones using the SQL in "Numbers I could not verify".

## Verdict on the hypothesis

Confirmed, with one correction.

- **Confirmed.** `Candidates.jsx` mints a new signed URL for every applicant's headshot on every mount of the list page. Every URL carries a fresh token, so the browser can never reuse a cached copy. Opening a candidate and pressing "All candidates" remounts the list and re-downloads every headshot.
- **Correction.** Headshots are *not* multi-megabyte originals. `Apply.jsx:298` runs `resizeImage()` (long side ≤ 1200 px, JPEG q 0.85), so a headshot is probably 150–400 KB, not ~3 MB. Resumes/cover letters are PDFs up to 10 MB each (bucket limit, `0029`) and are *not* loaded eagerly: they are plain `<a href>` links in `CandidateDetail.jsx:289-294`. The egress is therefore many repeats of a mid-size image, not a few huge ones. The fix is the same, but the "3 MB headshot" in the Phase 4 fixture is more pessimistic than production.

## Architecture facts that differ from the brief

1. **Recruitment and the chapter platform are the same Supabase project.** `.env.local`, `supabase/.temp/project-ref` and `HANDOFF.md` all point at `rmqgnapkcfbcksbrgnor`, and the recruitment tables/bucket live in migrations `0026`–`0039` of this repo next to the brother/E-Board portal. The recruitment portal is a build flag (`VITE_PORTAL=recruitment`) of this same app. If a *separate* chapter-platform project also exists, it is not referenced anywhere in this repo. No cross-project code exists here, so I am editing only recruitment code and a recruitment-only migration. Please confirm which project is which before anything is deployed.
2. **No local stack is possible on this machine yet:** `docker` is not installed, so `supabase start` cannot run. `.env.local` points at production and holds the service-role key, and every existing script (`seed-recruitment.mjs`, `unseed-recruitment.mjs`, `resize-avatars.mjs`) reads it. The new scripts do not.

## Findings, ranked by estimated bytes per deliberation session

Assumptions: N = 100 applicants, headshot H ≈ 300 KB, resume ≈ 1 MB, cover letter ≈ 0.5 MB, 15 devices.

| # | Where | What happens | Bytes per occurrence | Why it repeats |
|---|---|---|---|---|
| 1 | `src/portals/recruitment/pages/Candidates.jsx:66-77` (+ `src/lib/applications.js:93-97`) | After listing applicants, `createSignedUrl` is called once per applicant (N requests, no batching) and every URL is put in an `<img src>` at `:22`/`:187`. No `loading="lazy"`, no width/height, all N images load at once, including cards far off-screen. | N × H ≈ **30 MB per list load** | `load()` runs in a mount effect (`:86-88`). Returning from a candidate remounts the page, so it runs again with new tokens (new URL ⇒ cache miss). Also re-runs after "reset all votes" (`:102`). 15 devices × ~12 list loads ≈ **5.4 GB**, which matches the ~5 GB observed for delib 1. |
| 2 | `CandidateDetail.jsx:133-138`, `:271` | Opening a candidate signs resume, cover letter and headshot URLs and renders the headshot at full upload size (≤1200 px). The resume/cover URLs are only used as link targets (not downloaded until clicked). | H ≈ **0.3 MB per open** (+ 3 signing round-trips, ~1 KB each) | New token per open ⇒ revisiting or using Previous/Next never hits cache. 15 devices × 40 opens × 0.3 MB ≈ 180 MB. |
| 3 | `CandidateDetail.jsx:289-294` | Resume / cover letter open in a new tab via a pre-signed `href`. Not prefetched. | 0.5–10 MB per click | Signed URL is created on page load, so it expires after 10 min (`applications.js:94`) while the page is open, and each page load makes a different URL ⇒ second view of the same PDF re-downloads. Not eager; only an issue for repeat views. |
| 4 | `CandidateDetail.jsx:157-169` | Each detail mount re-runs `listApplications()` just to compute Previous/Next. | ~150 B × N ≈ 15 KB per open | No cache. 600 opens ≈ 9 MB total. Small but pure waste, and it duplicates the list query. |
| 5 | `applications.js:135` | `getApplication` uses `select('*')`. | ~2–4 KB per open | Fetches every column (incl. `deleted_at`, free-text answers). The detail page needs most of them, so the saving is small; fixed for hygiene and to stop future long columns leaking in. |
| 6 | `applications.js:240-256`, `CandidateDetail.jsx:150` | Realtime: one channel per open candidate listening to votes + comments, each event triggers a refetch of the vote tally/comments. | < 1 KB per event; the project saw ~4k messages total | Negligible. Votes RLS limits payloads to the caller's own row. Not changed. |
| 7 | `Candidates.jsx:90-94`, `CandidateDetail.jsx:82-86` | `recruitment_settings` is read once per mount plus once per Realtime event. | ~100 B | Negligible. |
| 8 | `Candidates.jsx:57-61` | Tallies (`get_all_vote_tallies`) and decisions are re-fetched on every list mount. | ~40 B × N ≈ 4 KB each | Small, and this is the live state we want fresh. Kept, but no polling. |
| 9 | `lambdas/src/syncRushApplicationsToSheets.js:45` | `select('*')` on all applications, run only when E-Board presses "Sync". | ~2 KB × N ≈ 200 KB per sync (Supabase → AWS) | Manual only, no schedule, no file bytes (paths are not downloaded). Replaced with an explicit column list. |
| 10 | `src/portals/brother/**`, `src/portals/eboard/**` | Brother/E-Board portals use `select('*')` on `events`, `members`, `rsvps`, etc. and public `avatars` URLs (`getPublicUrl`, stable ⇒ cacheable). | Tiny tables | Not part of the deliberation path. Left alone; avatars are served from a public bucket at stable URLs, so they already cache. |

### Checklist from the brief

1. **Storage fetches:** `createSignedUrl` only in `applications.js:94`. No `createSignedUrls`, `download` or `fetch` of storage URLs in app code. `<img>` at `Candidates.jsx:22`, `CandidateDetail.jsx:271`. No `<iframe>`/`<embed>`/`<object>`/PDF viewer.
2. **Signed URLs inside loops/render paths:** yes, `Candidates.jsx:67-76` (loop, per applicant, per mount) and `CandidateDetail.jsx:133-137`.
3. **`select('*')`:** `applications.js:135`, `lambdas/.../syncRushApplicationsToSheets.js:45`, `src/lib/queries.js:9` (members, not recruitment).
4. **Unpaginated lists:** `listApplications()` has no limit and every card renders at once.
5. **Refetches:** no polling, `setInterval`, `refetchInterval`, or focus handlers anywhere. No React Query / SWR; there is no client cache at all, so every mount refetches.
6. **Hidden tabs/modals/collapsed cards that fetch files:** none. Resume/cover letter are not mounted until clicked.
7. **Realtime with large payloads:** no (see #6).
8. **Sync Lambdas:** one (`syncRushApplicationsToSheets`), manual, writes metadata to Google Sheets, never reads file contents. `select('*')` only.

## Numbers I could not verify

Run this in the Supabase SQL editor (read-only) to replace my assumed file sizes:

```sql
select
  case when name like '%/headshot.%' then 'headshot'
       when name like '%/resume.%' then 'resume'
       when name like '%/cover-letter.%' then 'cover-letter' end as kind,
  count(*) as files,
  round(avg((metadata->>'size')::numeric) / 1024) as avg_kb,
  round(max((metadata->>'size')::numeric) / 1024) as max_kb
from storage.objects
where bucket_id = 'rush-applications'
group by 1;
```

Also unknown: the real applicant count and the number of list loads per device in delib 1. The ~5.4 GB model above is a plausibility check, not a measurement.

## Modeled before / after (arithmetic, not measurement)

Inputs: N = 100 applicants, 15 devices, 40 detail opens per device, headshot 300 KB (current, ≤1200 px), thumbnail ≤ 30 KB (assume 20 KB typical), display ≤ 300 KB, resume 1 MB, cover letter 0.5 MB, ~12 list loads per device (assumption fitted to the observed ~5 GB).

**Before** per device: list 12 × (100 × 0.3 MB) = 360 MB; detail 40 × 0.3 MB = 12 MB; total ≈ 372 MB. × 15 devices ≈ **5.6 GB** (observed delib 1: ~5 GB).

**After** per device:
- List: 100 × 20 KB = 2.0 MB once (≤ 3.0 MB at the 30 KB cap), then 0 B for every re-visit/sort/filter/refresh (identical URLs, 1-year Cache-Control). List JSON ≈ 15 KB, cached 5 min.
- Detail: 40 × ≤ 0.3 MB = ≤ 12 MB (less if display images are ~150 KB; revisits are cache hits).
- PDFs, only on click, worst case every open views both: 40 × 1.5 MB = 60 MB.
- Worst-case per device ≈ 3 + 12 + 60 = 75 MB → × 15 = **1.1 GB**. Without PDF clicks: ≈ 15 MB × 15 = **225 MB**.

Reduction: 5.6 GB → ≤ 1.1 GB worst case (5×), ~0.23 GB when PDFs are rarely opened (25×).

Not verified in a browser (see report): the "~0 bytes on revisit" claim depends on the browser honouring the cache headers on signed-URL responses.
