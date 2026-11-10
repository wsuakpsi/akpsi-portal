import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { callLambda } from '../../../lib/lambdas'
import { initials } from '../lib/queries'

const ALUMNI_SYNC_URL = import.meta.env.VITE_ALUMNI_SYNC_URL
const GRADUATE_BROTHERS_URL = import.meta.env.VITE_GRADUATE_BROTHERS_URL
const DAD_SHEET_URL = import.meta.env.VITE_DAD_SHEET_URL

// Graduation terms, in the same style the D.A.D. sheet already uses.
function termFor(date) {
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  if (month <= 5) return `May ${year}`
  if (month <= 8) return `Aug ${year}`
  return `Dec ${year}`
}

function upcomingTerms(from = new Date()) {
  const terms = []
  for (let year = from.getFullYear(); year <= from.getFullYear() + 2; year++) {
    for (const month of ['May', 'Aug', 'Dec']) terms.push(`${month} ${year}`)
  }
  return terms
}

function DirectoryStatus({ status, onSynced }) {
  const [running, setRunning] = useState(false)

  async function handleSync() {
    setRunning(true)
    try {
      const res = await callLambda(ALUMNI_SYNC_URL, {})
      toast.success(`D.A.D. synced — ${res.alumniSynced} alumni.`)
      onSynced()
    } catch (err) {
      toast.error(`Could not sync D.A.D.: ${err.message}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="sync-cta" style={{ marginBottom: '1rem' }}>
      <div>
        <div className="sync-cta-title">
          {status === undefined ? 'Loading…' : `${status.count} alumni in D.A.D.`}
        </div>
        <div className="sync-cta-sub">
          {status?.lastSyncedAt
            ? `Last synced from the sheet ${new Date(status.lastSyncedAt).toLocaleString()}. `
            : 'Never synced. '}
          The "D.A.D. Info" Google Sheet is the source of truth — edit alumni there, then sync. It also syncs
          automatically on 1 Jan, 1 May and 1 Sep.
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
        {DAD_SHEET_URL && (
          <a className="btn secondary" href={DAD_SHEET_URL} target="_blank" rel="noreferrer">
            Open sheet
          </a>
        )}
        <button className="btn gold" disabled={running} onClick={handleSync}>
          {running ? 'Syncing…' : 'Sync from sheet'}
        </button>
      </div>
    </div>
  )
}

function GraduateBrothers({ onGraduated }) {
  const [members, setMembers] = useState(undefined)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [termById, setTermById] = useState({})
  const [selected, setSelected] = useState(() => new Set())
  const [defaultTerm, setDefaultTerm] = useState(() => termFor(new Date()))
  const [running, setRunning] = useState(false)
  const terms = useMemo(() => upcomingTerms(), [])

  async function load() {
    const { data, error: queryError } = await supabase
      .from('members')
      .select('id, full_name, pledge_class, email, status')
      .in('status', ['active', 'probation'])
      .order('full_name')
    if (queryError) {
      setError(queryError.message)
      return
    }
    setMembers(data || [])
  }

  useEffect(() => {
    load()
  }, [])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (members || []).filter(
      (m) => !q || m.full_name.toLowerCase().includes(q) || (m.pledge_class || '').toLowerCase().includes(q)
    )
  }, [members, search])

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const termOf = (id) => termById[id] ?? defaultTerm
  const picked = (members || []).filter((m) => selected.has(m.id))
  const missingTerm = picked.some((m) => !termOf(m.id).trim())

  async function handleGraduate() {
    if (picked.length === 0 || missingTerm) return
    const list = picked.map((m) => `• ${m.full_name} — ${termOf(m.id).trim()}`).join('\n')
    const confirmed = window.confirm(
      `Graduate ${picked.length} brother${picked.length === 1 ? '' : 's'}?\n\n${list}\n\n` +
        'They will be added to the D.A.D. sheet and marked alumni in the portal.'
    )
    if (!confirmed) return

    setRunning(true)
    try {
      const res = await callLambda(GRADUATE_BROTHERS_URL, {
        graduates: picked.map((m) => ({ memberId: m.id, graduation: termOf(m.id).trim() })),
      })
      const parts = [`${res.markedAlumni} marked alumni`, `${res.appended} added to the sheet`]
      if (res.alreadyInSheet) parts.push(`${res.alreadyInSheet} already in the sheet`)
      toast.success(`Done — ${parts.join(', ')}.`)
      if (res.syncError) toast.error(`Directory didn't refresh: ${res.syncError}. Press "Sync from sheet".`)
      setSelected(new Set())
      setTermById({})
      await load()
      onGraduated()
    } catch (err) {
      toast.error(`Could not graduate brothers: ${err.message}`)
    } finally {
      setRunning(false)
    }
  }

  if (error) return <p className="error-text" role="alert">{error}</p>
  if (members === undefined) return <p className="note-text">Loading brothers…</p>

  return (
    <>
      <h2>Graduate brothers</h2>
      <p className="note-text">
        Run this at the end of the semester. Check who's graduating and confirm each person's term — it's copied into
        the sheet as written. Graduation is never automatic, since dates change.
      </p>

      <div className="toolbar">
        <input
          type="search"
          aria-label="Search brothers"
          placeholder="Search by name or pledge class"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: '220px' }}
        />
        <label className="note-text" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          Default term
          <select value={defaultTerm} onChange={(e) => setDefaultTerm(e.target.value)} aria-label="Default graduation term">
            {terms.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <div className="spacer" />
        <button className="btn gold" disabled={running || picked.length === 0 || missingTerm} onClick={handleGraduate}>
          {running
            ? 'Graduating…'
            : picked.length === 0
            ? 'Graduate brothers'
            : `Graduate ${picked.length} brother${picked.length === 1 ? '' : 's'}`}
        </button>
      </div>

      <datalist id="graduation-terms">
        {terms.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="card">
        {visible.length === 0 && <p className="empty-state">No active brothers match.</p>}
        {visible.length > 0 && (
          <table>
            <thead>
              <tr>
                <th style={{ width: '2.5rem' }}><span className="sr-only">Graduating</span></th>
                <th>Member</th>
                <th>Email</th>
                <th>Graduation term</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => {
                const checked = selected.has(m.id)
                return (
                  <tr key={m.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(m.id)}
                        aria-label={`Graduate ${m.full_name}`}
                      />
                    </td>
                    <td>
                      <div className="member-cell">
                        <div className="avatar">{initials(m.full_name)}</div>
                        <div>
                          <div className="member-name">{m.full_name}</div>
                          <div className="member-sub">{m.pledge_class}</div>
                        </div>
                      </div>
                    </td>
                    <td className="member-sub">{m.email}</td>
                    <td>
                      <input
                        type="text"
                        list="graduation-terms"
                        disabled={!checked}
                        value={checked ? termOf(m.id) : ''}
                        placeholder={checked ? '' : '—'}
                        onChange={(e) => setTermById((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        aria-label={`Graduation term for ${m.full_name}`}
                        style={{ width: '8rem' }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default function Alumni() {
  const [status, setStatus] = useState(undefined)

  async function loadStatus() {
    const [{ count, error: countError }, { data: latest, error: latestError }] = await Promise.all([
      supabase.from('alumni').select('id', { count: 'exact', head: true }),
      supabase.from('alumni').select('synced_at').order('synced_at', { ascending: false }).limit(1),
    ])
    if (countError || latestError) {
      toast.error(`Could not load D.A.D. status: ${(countError || latestError).message}`)
      setStatus({ count: 0, lastSyncedAt: null })
      return
    }
    setStatus({ count: count || 0, lastSyncedAt: latest?.[0]?.synced_at || null })
  }

  useEffect(() => {
    loadStatus()
  }, [])

  return (
    <div className="eboard-main">
      <div className="page-header">
        <div>
          <h1>D.A.D. alumni</h1>
          <p className="page-subtitle">The alumni directory brothers see in the portal</p>
        </div>
      </div>

      <DirectoryStatus status={status} onSynced={loadStatus} />
      <GraduateBrothers onGraduated={loadStatus} />
    </div>
  )
}
