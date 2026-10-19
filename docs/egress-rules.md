# Egress rules (Supabase Free plan: 5 GB uncached + 5 GB cached per cycle, shared by every project in the org)

Going over quota returns 402 for *all* projects in the org. One deliberation once cost ~5 GB, so these are not optional.

1. **Select explicit columns.** Never `select('*')` or `select()`. List views never fetch essays, notes or jsonb; load the full row when a card is opened. `npm run check:egress` enforces this for recruitment code.
2. **No eager file loads.** Resumes and cover letters load only on an explicit click — never prefetched, never embedded in a list, iframe or hidden tab.
3. **Stable signed URLs.** Get URLs through `getSignedFileUrl(s)` in `src/lib/applications.js` (module-level cache, 1-hour expiry, renewed only in the last 5 minutes). Never call `createSignedUrl(s)` in a render, effect or loop. A new URL means a guaranteed browser-cache miss.
4. **Thumbnails in lists, display size in detail.** Lists use the 256px thumbnail, the detail page the 1024px variant, the original only as a fallback. Variants are written once to new paths with `cacheControl: '31536000'`. Never `upsert` onto an existing path.
5. **No polling by default.** No `setInterval` refetch, no refetch on window focus. Heavy data is cached for 5 minutes (`readThroughCache.js`). Live state (votes, comments, decisions) updates via Realtime on small columns only.
6. **Budget estimate for any feature that loads files.** In the PR, write `files per view × bytes per file × views per session × devices`. If a session total exceeds ~200 MB, redesign.

Dev tip: in `npm run dev:recruitment`, `window.__egressMeter.report()` shows bytes transferred (see `src/lib/devEgressMeter.js` for its limits).
