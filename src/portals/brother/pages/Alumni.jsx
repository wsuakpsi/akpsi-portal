import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { initials } from '../../../lib/queries'
import { createReadThroughCache } from '../../../lib/readThroughCache'
import Topbar from '../components/Topbar'
import { BrotherPageSkeleton } from '../../../components/Skeleton'

// D.A.D. — the alumni directory. Read-only mirror of the "D.A.D. Info"
// Google Sheet (see migration 0042 and lambdas/src/syncAlumniFromSheet.js);
// it only changes when E-Board syncs, so one fetch per few minutes is plenty.
const alumniCache = createReadThroughCache()

const ALUMNI_COLUMNS =
  'id, full_name, pledge_class, graduation, graduation_year, email, phone, major, employer, job_title, past_employers, city, linkedin_url, secondary_education, industry'

async function fetchAlumni() {
  const { data, error } = await supabase.from('alumni').select(ALUMNI_COLUMNS).order('full_name')
  if (error) throw error
  return data || []
}

const CLASS_ORDER = [
  'Founding', 'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa',
  'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega',
]
const CLASS_ALIASES = { lamda: 'Lambda' }

// Groups spelling variants ("Lamda", "kappa ") under one filter option
// without touching what's shown on the card.
function classKey(pledgeClass) {
  if (!pledgeClass) return null
  const lower = pledgeClass.trim().toLowerCase()
  if (CLASS_ALIASES[lower]) return CLASS_ALIASES[lower]
  return CLASS_ORDER.find((c) => c.toLowerCase() === lower) || pledgeClass.trim()
}

function classRank(name) {
  const i = CLASS_ORDER.indexOf(name)
  return i === -1 ? CLASS_ORDER.length : i
}

function headline(alum) {
  if (alum.job_title && alum.employer) return `${alum.job_title} at ${alum.employer}`
  return alum.job_title || alum.employer || null
}

function phoneHref(phone) {
  const digits = phone.replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : null
}

function AlumCard({ alum, expanded, onToggle }) {
  const role = headline(alum)
  const sub = [alum.pledge_class, alum.graduation].filter(Boolean).join(' – ')
  const details = [
    ['Major', alum.major],
    ['City', alum.city],
    ['Further education', alum.secondary_education],
    ['Email', alum.email],
    ['Phone', alum.phone],
  ].filter(([, value]) => value)
  const tel = alum.phone ? phoneHref(alum.phone) : null

  return (
    <div className={`alum-card ${expanded ? 'open' : ''}`}>
      <button type="button" className="alum-summary" onClick={onToggle} aria-expanded={expanded}>
        <div className="avatar">{initials(alum.full_name)}</div>
        <div className="alum-body">
          <div className="alum-name">{alum.full_name}</div>
          {sub && <div className="alum-sub">{sub}</div>}
          {role && (
            <div className="alum-job">
              <span className="alum-job-label">Now</span>
              <span className="alum-job-text">{role}</span>
            </div>
          )}
          {alum.past_employers && (
            <div className="alum-job past">
              <span className="alum-job-label">Past</span>
              <span className="alum-job-text">{alum.past_employers}</span>
            </div>
          )}
        </div>
        {alum.industry && <span className="alum-industry">{alum.industry}</span>}
      </button>

      {expanded && (
        <div className="alum-details">
          {details.length > 0 && (
            <div className="roster-detail-list">
              {details.map(([label, value]) => (
                <div className="roster-detail-row" key={label}>
                  <span className="roster-detail-label">{label}</span>
                  <span className="roster-detail-value">{value}</span>
                </div>
              ))}
            </div>
          )}
          <div className="alum-actions">
            {alum.linkedin_url && (
              <a className="alum-action primary" href={alum.linkedin_url} target="_blank" rel="noreferrer">
                LinkedIn
              </a>
            )}
            {alum.email && (
              <a className="alum-action" href={`mailto:${alum.email}`}>
                Email
              </a>
            )}
            {tel && (
              <a className="alum-action" href={tel}>
                Call
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Alumni({ profile }) {
  const [alumni, setAlumni] = useState(null)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [industry, setIndustry] = useState('all')
  const [pledgeClass, setPledgeClass] = useState('all')
  const [sort, setSort] = useState('recent')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    let cancelled = false
    alumniCache
      .readThrough('alumni', fetchAlumni)
      .then((rows) => {
        if (!cancelled) setAlumni(rows)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        toast.error(`Could not load alumni: ${err.message}`)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const industries = useMemo(
    () => [...new Set((alumni || []).map((a) => a.industry).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [alumni]
  )
  const classes = useMemo(
    () =>
      [...new Set((alumni || []).map((a) => classKey(a.pledge_class)).filter(Boolean))].sort(
        (a, b) => classRank(a) - classRank(b) || a.localeCompare(b)
      ),
    [alumni]
  )

  const filtered = useMemo(() => {
    if (!alumni) return []
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const rows = alumni.filter((a) => {
      if (industry !== 'all' && a.industry !== industry) return false
      if (pledgeClass !== 'all' && classKey(a.pledge_class) !== pledgeClass) return false
      if (terms.length === 0) return true
      const haystack = [a.full_name, a.employer, a.job_title, a.past_employers, a.city, a.major, a.industry, a.pledge_class]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return terms.every((t) => haystack.includes(t))
    })
    if (sort === 'recent') {
      rows.sort((a, b) => (b.graduation_year || 0) - (a.graduation_year || 0) || a.full_name.localeCompare(b.full_name))
    }
    return rows
  }, [alumni, search, industry, pledgeClass, sort])

  const filtersActive = search || industry !== 'all' || pledgeClass !== 'all'

  return (
    <div>
      <Topbar profile={profile}>
        <div>
          <div className="topbar-title">D.A.D.</div>
          <div className="home-greeting">Beta Omicron alumni directory</div>
        </div>
      </Topbar>
      <div className="page">
        {error && <p className="error-text" role="alert">{error}</p>}
        {!alumni && !error && <BrotherPageSkeleton variant="list" />}

        {alumni && (
          <>
            <input
              type="search"
              className="alum-search"
              placeholder="Search name, company, city, major…"
              aria-label="Search alumni"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="alum-filters">
              <select aria-label="Filter by industry" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                <option value="all">All industries</option>
                {industries.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
              <select aria-label="Filter by class" value={pledgeClass} onChange={(e) => setPledgeClass(e.target.value)}>
                <option value="all">All classes</option>
                {classes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select aria-label="Sort alumni" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="recent">Newest grads</option>
                <option value="name">A–Z</option>
              </select>
            </div>

            <div className="alum-count">
              {filtersActive ? `${filtered.length} of ${alumni.length} alumni` : `${alumni.length} alumni`}
              {filtersActive && (
                <button
                  type="button"
                  className="alum-clear"
                  onClick={() => {
                    setSearch('')
                    setIndustry('all')
                    setPledgeClass('all')
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {alumni.length === 0 && <p className="empty-state">The directory hasn't been synced yet.</p>}
            {alumni.length > 0 && filtered.length === 0 && <p className="empty-state">No alumni match that search.</p>}

            {filtered.map((alum) => (
              <AlumCard
                key={alum.id}
                alum={alum}
                expanded={expandedId === alum.id}
                onToggle={() => setExpandedId(expandedId === alum.id ? null : alum.id)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
