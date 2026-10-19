import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { initials } from '../../../lib/queries'
import { callLambda } from '../../../lib/lambdas'
import ConfirmModal from '../../../components/ConfirmModal'
import {
  canSeeResults,
  listApplications,
  getVoteTallies,
  getDecisions,
  resetAllVotes,
  getMaybeEnabled,
  setMaybeEnabled,
  subscribeToMaybeSetting,
} from '../../../lib/applications'
import { useVisibleThumbnailSignedUrls } from '../useVisibleThumbnailSignedUrls'

const RUSH_SHEETS_SYNC_URL = import.meta.env.VITE_RUSH_SHEETS_SYNC_URL

const CANDIDATE_CARDS_PER_PAGE = 48
const THUMBNAIL_EDGE_PIXELS = 256

// Only cards that scroll near the viewport ask for their thumbnail.
function CandidateCard({ application, thumbnailSignedUrl, requestThumbnailSignedUrl, children }) {
  const cardElementRef = useRef(null)

  useEffect(() => {
    const cardElement = cardElementRef.current
    if (!application.headshot_thumbnail_path || !cardElement) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      requestThumbnailSignedUrl(application.headshot_thumbnail_path)
      return undefined
    }
    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        requestThumbnailSignedUrl(application.headshot_thumbnail_path)
        visibilityObserver.disconnect()
      },
      { rootMargin: '300px' },
    )
    visibilityObserver.observe(cardElement)
    return () => visibilityObserver.disconnect()
  }, [application.headshot_thumbnail_path, requestThumbnailSignedUrl])

  return (
    <Link className="candidate-card" to={`/recruitment/${application.id}`} ref={cardElementRef}>
      {thumbnailSignedUrl ? (
        <img
          className="candidate-avatar"
          src={thumbnailSignedUrl}
          alt=""
          width={THUMBNAIL_EDGE_PIXELS}
          height={THUMBNAIL_EDGE_PIXELS}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="candidate-avatar-fallback">{initials(application.full_name)}</div>
      )}
      {children}
    </Link>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
    </svg>
  )
}

export default function Candidates({ profile }) {
  const isEboard = profile.role === 'eboard'
  const canSeeVoteResults = canSeeResults(profile)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [applications, setApplications] = useState([])
  const [tallies, setTallies] = useState(new Map())
  const [decisions, setDecisions] = useState(new Map())
  const [visibleCardCount, setVisibleCardCount] = useState(CANDIDATE_CARDS_PER_PAGE)
  const { thumbnailSignedUrlByStoragePath, requestThumbnailSignedUrl } = useVisibleThumbnailSignedUrls()
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [maybeEnabled, setMaybeEnabledState] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function load({ forceRefresh = false } = {}) {
    setLoading(true)
    setError(null)
    try {
      // Vote tallies and decisions are both restricted to VP Membership/VP
      // Internal/Secretary (see 0032, 0033) — skip the request entirely
      // rather than render an empty-but-present tally/badge that could be
      // misread as "nobody voted" / "no decision".
      const [apps, voteTallies, decisionMap] = await Promise.all([
        listApplications({ forceRefresh }),
        canSeeVoteResults ? getVoteTallies() : Promise.resolve(new Map()),
        canSeeVoteResults ? getDecisions() : Promise.resolve(new Map()),
      ])
      setApplications(apps)
      setTallies(voteTallies)
      setDecisions(decisionMap)
    } catch (err) {
      setError(err.message)
      toast.error(`Could not load applications: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const refresh = () => getMaybeEnabled().then(setMaybeEnabledState).catch(() => {})
    refresh()
    return subscribeToMaybeSetting(refresh)
  }, [])

  async function handleReset() {
    setResetting(true)
    try {
      const count = await resetAllVotes()
      toast.success(`Reset complete — ${count} vote${count === 1 ? '' : 's'} cleared.`)
      setConfirmingReset(false)
      await load()
    } catch (err) {
      toast.error(`Could not reset votes: ${err.message}`)
    } finally {
      setResetting(false)
    }
  }

  async function handleToggleMaybe() {
    try {
      await setMaybeEnabled(!maybeEnabled)
      setMaybeEnabledState(!maybeEnabled)
    } catch (err) {
      toast.error(`Could not update setting: ${err.message}`)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return applications
    return applications.filter((app) => app.full_name.toLowerCase().includes(q))
  }, [applications, search])

  useEffect(() => {
    setVisibleCardCount(CANDIDATE_CARDS_PER_PAGE)
  }, [search])

  const currentPageOfCandidates = filtered.slice(0, visibleCardCount)

  async function handleSync() {
    setSyncing(true)
    try {
      await callLambda(RUSH_SHEETS_SYNC_URL, {})
      toast.success('Synced to Google Sheets.')
    } catch (err) {
      toast.error(`Could not sync: ${err.message}`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Candidates</h1>
          <p className="page-subtitle">
            {applications.length} application{applications.length === 1 ? '' : 's'}
            {search && filtered.length !== applications.length ? ` · ${filtered.length} matching` : ''}
          </p>
        </div>
        {canSeeVoteResults && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn secondary" onClick={handleToggleMaybe}>
              {maybeEnabled ? 'Disable Maybe' : 'Enable Maybe'}
            </button>
            <button className="btn danger" onClick={() => setConfirmingReset(true)}>
              Reset all votes
            </button>
          </div>
        )}
        {isEboard && RUSH_SHEETS_SYNC_URL && (
          <button className="btn secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync to Google Sheets'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
        <button
          type="button"
          className="btn secondary small"
          onClick={() => load({ forceRefresh: true })}
          disabled={loading}
          title="The applicant list is cached for 5 minutes to save bandwidth; use this to pick up brand-new applications."
        >
          Refresh list
        </button>
      </div>

      <div className="recruitment-search-wrap">
        <SearchIcon />
        <input
          type="search"
          className="recruitment-search"
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search candidates"
        />
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && filtered.length === 0 && <p className="empty-state">No candidates found.</p>}

      {!loading && filtered.length > 0 && (
        <div className="candidate-grid">
          {currentPageOfCandidates.map((app) => {
            const t = tallies.get(app.id) || { yes: 0, no: 0, maybe: 0 }
            const decision = decisions.get(app.id) || 'pending'
            return (
              <CandidateCard
                key={app.id}
                application={app}
                thumbnailSignedUrl={thumbnailSignedUrlByStoragePath[app.headshot_thumbnail_path]}
                requestThumbnailSignedUrl={requestThumbnailSignedUrl}
              >
                <div className="candidate-body">
                  <div className="candidate-name">{app.full_name}</div>
                  <div className="candidate-meta">{app.standing} · {app.graduation_year}</div>
                </div>
                {canSeeVoteResults && (
                  <div className="candidate-foot">
                    <div className="candidate-tally">
                      <span className="yes">{t.yes} Y</span>
                      <span className="no">{t.no} N</span>
                      {maybeEnabled && <span className="maybe">{t.maybe} M</span>}
                    </div>
                    {decision !== 'pending' && <span className={`status-badge ${decision}`}>{decision}</span>}
                  </div>
                )}
              </CandidateCard>
            )
          })}
        </div>
      )}
      {!loading && filtered.length > visibleCardCount && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
          <button
            type="button"
            className="btn secondary"
            onClick={() => setVisibleCardCount((count) => count + CANDIDATE_CARDS_PER_PAGE)}
          >
            Show more ({filtered.length - visibleCardCount} remaining)
          </button>
        </div>
      )}
    
      {confirmingReset && (
        <ConfirmModal
          title="Reset ALL votes?"
          body="This permanently deletes every member's vote on every applicant, including applicants who already have a decision. It cannot be undone. Decisions are not changed."
          confirmLabel="Yes, reset all votes"
          confirmClassName="btn danger"
          busy={resetting}
          onConfirm={handleReset}
          onClose={() => setConfirmingReset(false)}
        />
      )}
    </div>
  )
}
