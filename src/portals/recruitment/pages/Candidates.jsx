import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { initials } from '../../../lib/queries'
import { callLambda } from '../../../lib/lambdas'
import { listApplications, getVoteTallies, getDecisions, getSignedFileUrl } from '../../../lib/applications'

const RUSH_SHEETS_SYNC_URL = import.meta.env.VITE_RUSH_SHEETS_SYNC_URL

function CandidateAvatar({ application, url }) {
  if (url) return <img className="candidate-avatar" src={url} alt="" />
  return <div className="candidate-avatar-fallback">{initials(application.full_name)}</div>
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [applications, setApplications] = useState([])
  const [tallies, setTallies] = useState(new Map())
  const [decisions, setDecisions] = useState(new Map())
  const [avatarUrls, setAvatarUrls] = useState({})
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // Vote tallies and decisions are E-Board-only — RLS returns them empty
      // for anyone else, but skip the request entirely rather than render an
      // empty-but-present tally that could be misread as "nobody voted".
      const [apps, voteTallies, decisionMap] = await Promise.all([
        listApplications(),
        isEboard ? getVoteTallies() : Promise.resolve(new Map()),
        isEboard ? getDecisions() : Promise.resolve(new Map()),
      ])
      setApplications(apps)
      setTallies(voteTallies)
      setDecisions(decisionMap)

      const urls = {}
      await Promise.all(
        apps.map(async (app) => {
          if (!app.headshot_path) return
          try {
            urls[app.id] = await getSignedFileUrl(app.headshot_path)
          } catch {
            // Missing/unreadable file — fall back to initials, not worth failing the page over.
          }
        }),
      )
      setAvatarUrls(urls)
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return applications
    return applications.filter((app) => app.full_name.toLowerCase().includes(q))
  }, [applications, search])

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
        {isEboard && RUSH_SHEETS_SYNC_URL && (
          <button className="btn secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync to Google Sheets'}
          </button>
        )}
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
          {filtered.map((app) => {
            const t = tallies.get(app.id) || { yes: 0, no: 0, maybe: 0 }
            const decision = decisions.get(app.id) || 'pending'
            return (
              <Link className="candidate-card" to={`/recruitment/${app.id}`} key={app.id}>
                <CandidateAvatar application={app} url={avatarUrls[app.id]} />
                <div className="candidate-body">
                  <div className="candidate-name">{app.full_name}</div>
                  <div className="candidate-meta">{app.standing} · {app.graduation_year}</div>
                </div>
                {isEboard && (
                  <div className="candidate-foot">
                    <div className="candidate-tally">
                      <span className="yes">{t.yes} Y</span>
                      <span className="no">{t.no} N</span>
                      <span className="maybe">{t.maybe} M</span>
                    </div>
                    {decision !== 'pending' && <span className={`status-badge ${decision}`}>{decision}</span>}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
