# Bulk Invite Plan

## Goal
Allow eboard to upload a roster file (Excel or CSV) and send invites to all brothers in one action, instead of inviting one at a time.

---

## Flow

1. Eboard clicks **"Import roster"** button on the Brothers page
2. File picker opens — they select their Excel or CSV file
3. App parses the file client-side and shows a **preview table** with all rows found (name, email, pledge class)
4. Eboard reviews — can remove individual rows before sending
5. They hit **"Send invites"** — app calls the Lambda for each row
6. Progress shown as invites go out (e.g. "12 / 40 sent")
7. Summary shown at the end (succeeded, skipped/already exists, failed)

---

## What needs to be built

### Frontend
- **"Import roster" button** on the Brothers page (next to the existing "Invite brother" button)
- **File parser** — reads `.csv` or `.xlsx` client-side
  - For CSV: use the native `FileReader` API, no library needed
  - For Excel: use `xlsx` (SheetJS) — lightweight, client-side only
- **Column mapping step** — let eboard pick which column maps to name/email/pledge class (handles any column header naming)
- **Preview table** — shows parsed rows, allows removing individual rows
- **Bulk send logic** — calls `inviteBrother` Lambda for each row sequentially (not parallel, to avoid rate limits)
- **Progress + summary UI**

### Backend (Lambda)
- No changes needed — existing `inviteBrother` Lambda already handles one invite at a time and handles resends gracefully

---

## Key decisions to make

1. **File format** — support CSV only, or Excel too?
   - CSV is simpler (no library needed)
   - Excel is what most people actually have
   - Recommendation: support both via SheetJS which handles both formats

2. **Column mapping** — auto-detect headers or let eboard map manually?
   - Auto-detect if headers are close matches (case-insensitive "full name", "email", "pledge class")
   - Fall back to manual mapping if headers don't match

3. **Send rate** — how fast to send invites?
   - Send sequentially with a small delay to avoid hammering Supabase/Resend
   - Resend free tier: 3,000 emails/month, no per-minute rate limit documented
   - Recommendation: send one at a time, no artificial delay needed

4. **Error handling** — what to do if one invite fails mid-batch?
   - Don't stop the whole batch
   - Collect failures and show them in the summary so eboard can retry individually

---

## Open questions
- What are the exact column header names in the roster file?
- Is the file always the same format semester to semester, or does it vary?
- Should we support re-importing (skip already-invited/already-member emails automatically)? — the Lambda already handles this gracefully
