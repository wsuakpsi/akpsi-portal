// Tiny module-level read-through cache for heavy, rarely-changing data (the
// applicant list, a candidate's application row). Replaces "refetch on every
// mount" with "refetch only when older than `freshForMilliseconds`", and
// shares one in-flight request between callers that ask at the same time.
// No polling, no refetch on window focus.
//
// Live deliberation state (votes, comments, decisions) deliberately does NOT go
// through this — it is small and must be current.

export const HEAVY_DATA_FRESH_FOR_MILLISECONDS = 5 * 60 * 1000

export function createReadThroughCache({ getCurrentTimeInMilliseconds = () => Date.now() } = {}) {
  const cachedEntryByKey = new Map()
  const inFlightRequestByKey = new Map()

  async function readThrough(cacheKey, fetchFreshValue, { freshForMilliseconds = HEAVY_DATA_FRESH_FOR_MILLISECONDS, forceRefresh = false } = {}) {
    const cachedEntry = cachedEntryByKey.get(cacheKey)
    const isCachedEntryFresh =
      cachedEntry && getCurrentTimeInMilliseconds() - cachedEntry.fetchedAtMilliseconds < freshForMilliseconds
    if (isCachedEntryFresh && !forceRefresh) return cachedEntry.value

    const inFlightRequest = inFlightRequestByKey.get(cacheKey)
    if (inFlightRequest) return inFlightRequest

    const request = fetchFreshValue()
      .then((value) => {
        cachedEntryByKey.set(cacheKey, { value, fetchedAtMilliseconds: getCurrentTimeInMilliseconds() })
        return value
      })
      .finally(() => inFlightRequestByKey.delete(cacheKey))
    inFlightRequestByKey.set(cacheKey, request)
    return request
  }

  function invalidate(cacheKey) {
    cachedEntryByKey.delete(cacheKey)
  }

  function invalidateAll() {
    cachedEntryByKey.clear()
  }

  return { readThrough, invalidate, invalidateAll }
}
