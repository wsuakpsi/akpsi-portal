import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSignedUrlCache, SIGNED_URL_LIFETIME_SECONDS } from '../src/lib/signedUrlCache.js'
import { createReadThroughCache } from '../src/lib/readThroughCache.js'

function createFakeSigner() {
  const batchCallStoragePaths = []
  let tokenCounter = 0
  async function createSignedUrlsForStoragePaths(storagePaths) {
    batchCallStoragePaths.push(storagePaths)
    return storagePaths.map((path) =>
      path.startsWith('missing') ? { path, signedUrl: null, error: 'not found' } : { path, signedUrl: `https://x/${path}?token=${++tokenCounter}`, error: null },
    )
  }
  return { createSignedUrlsForStoragePaths, batchCallStoragePaths }
}

test('same path returns the identical URL across calls (no new token)', async () => {
  const fakeSigner = createFakeSigner()
  const cache = createSignedUrlCache({ createSignedUrlsForStoragePaths: fakeSigner.createSignedUrlsForStoragePaths })
  const first = await cache.getSignedUrlForStoragePath('a/thumb.jpg')
  const second = await cache.getSignedUrlForStoragePath('a/thumb.jpg')
  assert.equal(first, second)
  assert.equal(fakeSigner.batchCallStoragePaths.length, 1)
})

test('batch signs only uncached paths, in one request', async () => {
  const fakeSigner = createFakeSigner()
  const cache = createSignedUrlCache({ createSignedUrlsForStoragePaths: fakeSigner.createSignedUrlsForStoragePaths })
  await cache.getSignedUrlsForStoragePaths(['a', 'b'])
  const result = await cache.getSignedUrlsForStoragePaths(['a', 'b', 'c', 'c'])
  assert.deepEqual(fakeSigner.batchCallStoragePaths, [['a', 'b'], ['c']])
  assert.equal(result.size, 3)
})

test('concurrent callers for the same path share one request', async () => {
  const fakeSigner = createFakeSigner()
  const cache = createSignedUrlCache({ createSignedUrlsForStoragePaths: fakeSigner.createSignedUrlsForStoragePaths })
  const [one, two] = await Promise.all([cache.getSignedUrlForStoragePath('a'), cache.getSignedUrlForStoragePath('a')])
  assert.equal(one, two)
  assert.equal(fakeSigner.batchCallStoragePaths.length, 1)
})

test('regenerates only when under 5 minutes from expiry', async () => {
  const fakeSigner = createFakeSigner()
  let nowMilliseconds = 1_000_000
  const cache = createSignedUrlCache({
    createSignedUrlsForStoragePaths: fakeSigner.createSignedUrlsForStoragePaths,
    getCurrentTimeInMilliseconds: () => nowMilliseconds,
  })
  const original = await cache.getSignedUrlForStoragePath('a')
  nowMilliseconds += (SIGNED_URL_LIFETIME_SECONDS - 6 * 60) * 1000
  assert.equal(await cache.getSignedUrlForStoragePath('a'), original)
  nowMilliseconds += 2 * 60 * 1000
  assert.notEqual(await cache.getSignedUrlForStoragePath('a'), original)
  assert.equal(fakeSigner.batchCallStoragePaths.length, 2)
})

test('unsignable paths are absent and not cached as success', async () => {
  const fakeSigner = createFakeSigner()
  const cache = createSignedUrlCache({ createSignedUrlsForStoragePaths: fakeSigner.createSignedUrlsForStoragePaths })
  assert.equal(await cache.getSignedUrlForStoragePath('missing/x'), null)
  assert.equal(await cache.getSignedUrlForStoragePath('missing/x'), null)
  assert.equal(fakeSigner.batchCallStoragePaths.length, 2)
})

test('read-through cache serves within staleTime, refetches after, and dedupes in-flight', async () => {
  let nowMilliseconds = 0
  let fetchCount = 0
  const cache = createReadThroughCache({ getCurrentTimeInMilliseconds: () => nowMilliseconds })
  const fetchFreshValue = async () => ++fetchCount
  const [a, b] = await Promise.all([cache.readThrough('k', fetchFreshValue), cache.readThrough('k', fetchFreshValue)])
  assert.equal(a, 1); assert.equal(b, 1)
  nowMilliseconds = 4 * 60 * 1000
  assert.equal(await cache.readThrough('k', fetchFreshValue), 1)
  nowMilliseconds = 5 * 60 * 1000 + 1
  assert.equal(await cache.readThrough('k', fetchFreshValue), 2)
  assert.equal(await cache.readThrough('k', fetchFreshValue, { forceRefresh: true }), 3)
  cache.invalidate('k')
  assert.equal(await cache.readThrough('k', fetchFreshValue), 4)
})

test('read-through cache does not cache failures', async () => {
  const cache = createReadThroughCache()
  await assert.rejects(cache.readThrough('k', async () => { throw new Error('boom') }))
  assert.equal(await cache.readThrough('k', async () => 'ok'), 'ok')
})
