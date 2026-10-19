import { useCallback, useEffect, useRef, useState } from 'react'
import { getSignedFileUrls } from '../../lib/applications'

// Batches thumbnail signing requests from cards as they scroll into view into
// one createSignedUrls call. Signed URLs themselves are cached for the page
// session (signedUrlCache.js), so remounting the list re-signs nothing.
const MILLISECONDS_TO_COLLECT_VISIBLE_CARDS_BEFORE_SIGNING = 75

export function useVisibleThumbnailSignedUrls() {
  const [thumbnailSignedUrlByStoragePath, setThumbnailSignedUrlByStoragePath] = useState({})
  const storagePathsAlreadyRequested = useRef(new Set())
  const storagePathsWaitingForNextBatch = useRef(new Set())
  const batchTimerId = useRef(null)
  const isUnmounted = useRef(false)

  useEffect(() => {
    isUnmounted.current = false
    return () => {
      isUnmounted.current = true
      clearTimeout(batchTimerId.current)
    }
  }, [])

  const signWaitingStoragePaths = useCallback(async () => {
    batchTimerId.current = null
    const storagePathsInThisBatch = [...storagePathsWaitingForNextBatch.current]
    storagePathsWaitingForNextBatch.current.clear()
    if (storagePathsInThisBatch.length === 0) return
    try {
      const signedUrlByStoragePath = await getSignedFileUrls(storagePathsInThisBatch)
      if (isUnmounted.current) return
      setThumbnailSignedUrlByStoragePath((previous) => ({
        ...previous,
        ...Object.fromEntries(signedUrlByStoragePath),
      }))
    } catch {
      // Thumbnail is decoration; the card keeps its initials fallback. Allow a retry on next scroll-in.
      for (const storagePath of storagePathsInThisBatch) storagePathsAlreadyRequested.current.delete(storagePath)
    }
  }, [])

  const requestThumbnailSignedUrl = useCallback(
    (thumbnailStoragePath) => {
      if (!thumbnailStoragePath || storagePathsAlreadyRequested.current.has(thumbnailStoragePath)) return
      storagePathsAlreadyRequested.current.add(thumbnailStoragePath)
      storagePathsWaitingForNextBatch.current.add(thumbnailStoragePath)
      if (batchTimerId.current === null) {
        batchTimerId.current = setTimeout(signWaitingStoragePaths, MILLISECONDS_TO_COLLECT_VISIBLE_CARDS_BEFORE_SIGNING)
      }
    },
    [signWaitingStoragePaths],
  )

  return { thumbnailSignedUrlByStoragePath, requestThumbnailSignedUrl }
}
