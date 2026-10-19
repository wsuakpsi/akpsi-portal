// Dev-only egress meter. Sums `transferSize` of every resource the page
// loads and logs a running total, so a change that makes the deliberation view
// heavier shows up immediately. Inspect with `window.__egressMeter.report()`.
//
// Limitation: for cross-origin responses (Supabase) browsers report
// transferSize 0 unless the server sends Timing-Allow-Origin. If the numbers
// read 0, use the DevTools Network tab ("transferred" in the footer) instead.

export function startDevEgressMeter() {
  if (!import.meta.env.DEV || typeof PerformanceObserver === 'undefined') return

  const transferredBytesByResourceKind = { image: 0, document: 0, apiAndOther: 0 }
  let totalTransferredBytes = 0
  let totalResourceCount = 0

  function classifyResourceKind(resourceEntry) {
    if (resourceEntry.initiatorType === 'img') return 'image'
    if (/\.(pdf)(\?|$)/i.test(resourceEntry.name)) return 'document'
    return 'apiAndOther'
  }

  const resourceObserver = new PerformanceObserver((entryList) => {
    for (const resourceEntry of entryList.getEntries()) {
      const transferredBytes = resourceEntry.transferSize || 0
      transferredBytesByResourceKind[classifyResourceKind(resourceEntry)] += transferredBytes
      totalTransferredBytes += transferredBytes
      totalResourceCount += 1
      if (transferredBytes > 0) {
        console.debug(
          `[egress] +${(transferredBytes / 1024).toFixed(1)} KB  total ${(totalTransferredBytes / 1024 / 1024).toFixed(2)} MB  ${resourceEntry.name.split('?')[0]}`,
        )
      }
    }
  })
  resourceObserver.observe({ type: 'resource', buffered: true })

  window.__egressMeter = {
    report: () => ({
      totalMegabytes: totalTransferredBytes / 1024 / 1024,
      totalResourceCount,
      megabytesByKind: Object.fromEntries(
        Object.entries(transferredBytesByResourceKind).map(([kind, bytes]) => [kind, bytes / 1024 / 1024]),
      ),
    }),
  }
}
