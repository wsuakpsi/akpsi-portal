// One signed URL per storage path, reused for as long as it has more than
// REFRESH_MARGIN left. Identical URL strings are what let the browser (and
// Supabase's CDN) serve a file from cache; a new token means a new URL means a
// full re-download.
//
// The cache lives at module level on purpose: it survives React remounts,
// route changes, filters and sorts for the whole page session.

export const SIGNED_URL_LIFETIME_SECONDS = 60 * 60
export const SIGNED_URL_REFRESH_MARGIN_MILLISECONDS = 5 * 60 * 1000

// `createSignedUrlsForStoragePaths(storagePaths, lifetimeSeconds)` must resolve
// to an array of `{ path, signedUrl, error }` — the shape of supabase-js
// `storage.from(bucket).createSignedUrls()` data. Injected so this file has no
// Supabase import and can be tested in plain Node.
export function createSignedUrlCache({
  createSignedUrlsForStoragePaths,
  getCurrentTimeInMilliseconds = () => Date.now(),
}) {
  const signedUrlEntryByStoragePath = new Map()
  const inFlightSignedUrlRequestByStoragePath = new Map()

  function readStillFreshSignedUrl(storagePath) {
    const cachedEntry = signedUrlEntryByStoragePath.get(storagePath)
    if (!cachedEntry) return null
    const millisecondsUntilExpiry = cachedEntry.expiresAtMilliseconds - getCurrentTimeInMilliseconds()
    return millisecondsUntilExpiry > SIGNED_URL_REFRESH_MARGIN_MILLISECONDS ? cachedEntry.signedUrl : null
  }

  // Returns a Map of storagePath -> signedUrl. Paths that could not be signed
  // (missing file, no permission) are simply absent from the result.
  async function getSignedUrlsForStoragePaths(storagePaths) {
    const uniqueStoragePaths = [...new Set(storagePaths.filter(Boolean))]
    const signedUrlByStoragePath = new Map()
    const storagePathsToRequest = []
    const pendingRequests = []

    for (const storagePath of uniqueStoragePaths) {
      const freshSignedUrl = readStillFreshSignedUrl(storagePath)
      if (freshSignedUrl) {
        signedUrlByStoragePath.set(storagePath, freshSignedUrl)
      } else if (inFlightSignedUrlRequestByStoragePath.has(storagePath)) {
        pendingRequests.push(inFlightSignedUrlRequestByStoragePath.get(storagePath))
      } else {
        storagePathsToRequest.push(storagePath)
      }
    }

    if (storagePathsToRequest.length > 0) {
      const batchRequest = createSignedUrlsForStoragePaths(storagePathsToRequest, SIGNED_URL_LIFETIME_SECONDS)
      const requestedAtMilliseconds = getCurrentTimeInMilliseconds()
      const batchRequestSettled = batchRequest.then((signedUrlResults) => {
        for (const { path, signedUrl, error } of signedUrlResults) {
          if (error || !signedUrl) continue
          signedUrlEntryByStoragePath.set(path, {
            signedUrl,
            expiresAtMilliseconds: requestedAtMilliseconds + SIGNED_URL_LIFETIME_SECONDS * 1000,
          })
        }
      })
      for (const storagePath of storagePathsToRequest) {
        inFlightSignedUrlRequestByStoragePath.set(storagePath, batchRequestSettled)
      }
      const clearInFlightMarkers = () => {
        for (const storagePath of storagePathsToRequest) inFlightSignedUrlRequestByStoragePath.delete(storagePath)
      }
      batchRequestSettled.then(clearInFlightMarkers, clearInFlightMarkers)
      pendingRequests.push(batchRequestSettled)
    }

    await Promise.all(pendingRequests)

    for (const storagePath of uniqueStoragePaths) {
      if (signedUrlByStoragePath.has(storagePath)) continue
      const signedUrl = signedUrlEntryByStoragePath.get(storagePath)?.signedUrl
      if (signedUrl) signedUrlByStoragePath.set(storagePath, signedUrl)
    }
    return signedUrlByStoragePath
  }

  async function getSignedUrlForStoragePath(storagePath) {
    const signedUrlByStoragePath = await getSignedUrlsForStoragePaths([storagePath])
    return signedUrlByStoragePath.get(storagePath) ?? null
  }

  return { getSignedUrlsForStoragePaths, getSignedUrlForStoragePath }
}
