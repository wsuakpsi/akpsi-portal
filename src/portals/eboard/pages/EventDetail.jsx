import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { callLambda } from '../../../lib/lambdas'
import { formatDateTime } from '../lib/queries'

const COMPLETE_EVENT_URL = import.meta.env.VITE_COMPLETE_EVENT_URL
const CANCEL_EVENT_URL = import.meta.env.VITE_CANCEL_EVENT_URL
const GENERATE_CHECKIN_TOKEN_URL = import.meta.env.VITE_GENERATE_CHECKIN_TOKEN_URL
const RECORD_ATTENDANCE_URL = import.meta.env.VITE_RECORD_ATTENDANCE_URL
const REMOVE_ATTENDANCE_URL = import.meta.env.VITE_REMOVE_ATTENDANCE_URL

function RemoveAttendanceForm({ member, onClose, onRemoved }) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onRemoved(note)
      toast.success(`Removed ${member.full_name}'s attendance.`)
      onClose()
    } catch (err) {
      toast.error(`Could not remove attendance: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Remove attendance</h2>
        <p className="note-text">{member.full_name}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="note">Correction note (required)</label>
            <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} required rows={3} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="submit" className="btn danger" disabled={submitting || !note.trim()}>
              {submitting ? 'Removing...' : 'Remove attendance'}
            </button>
            <button type="button" className="btn secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CheckInQr({ eventId }) {
  const [state, setState] = useState('idle') // idle | loading | ready | error
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [checkinUrl, setCheckinUrl] = useState(null)
  const [expiresAt, setExpiresAt] = useState(null)
  const [error, setError] = useState(null)

  async function handleGenerate() {
    setState('loading')
    setError(null)
    try {
      const res = await callLambda(GENERATE_CHECKIN_TOKEN_URL, { eventId })
      const url = `${window.location.origin}/brother/checkin?token=${encodeURIComponent(res.token)}`
      const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 1 })
      setCheckinUrl(url)
      setQrDataUrl(dataUrl)
      setExpiresAt(res.expiresAt)
      setState('ready')
    } catch (err) {
      setError(err.message)
      setState('error')
      toast.error(`Could not generate check-in QR: ${err.message}`)
    }
  }

  return (
    <div className="card">
      <h2>Check-in QR</h2>
      {state === 'idle' && (
        <button className="btn" onClick={handleGenerate}>
          Generate check-in QR
        </button>
      )}
      {state === 'loading' && <p className="empty-state">Generating...</p>}
      {state === 'error' && (
        <>
          <p className="error-text">{error}</p>
          <button className="btn" onClick={handleGenerate}>Try again</button>
        </>
      )}
      {state === 'ready' && (
        <>
          <img src={qrDataUrl} alt="Check-in QR code" style={{ maxWidth: 320, width: '100%' }} />
          <p className="note-text">
            Expires {new Date(expiresAt).toLocaleTimeString()}. <a href={checkinUrl}>{checkinUrl}</a>
          </p>
          <button className="btn small secondary" onClick={handleGenerate}>Regenerate</button>
        </>
      )}
    </div>
  )
}

function ManualCheckIn({ eventId, alreadyAttendedIds, onCheckedIn }) {
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState([])
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    supabase
      .from('members')
      .select('id, full_name, status')
      .neq('status', 'archived')
      .order('full_name')
      .then(({ data }) => setMembers(data || []))
  }, [])

  const matches = query.trim()
    ? members.filter(
        (m) => !alreadyAttendedIds.has(m.id) && m.full_name.toLowerCase().includes(query.trim().toLowerCase())
      )
    : []

  async function handleCheckIn(member) {
    setBusyId(member.id)
    try {
      await callLambda(RECORD_ATTENDANCE_URL, { eventId, memberId: member.id })
      setQuery('')
      toast.success(`Checked in ${member.full_name}.`)
      onCheckedIn()
    } catch (err) {
      toast.error(`Could not check in ${member.full_name}: ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="card">
      <h2>Manual check-in</h2>
      <input
        type="text"
        placeholder="Search brother by name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {matches.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          {matches.map((m) => (
            <div key={m.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{m.full_name}</span>
              <button className="btn small" disabled={busyId === m.id} onClick={() => handleCheckIn(m)}>
                {busyId === m.id ? 'Checking in...' : 'Check in'}
              </button>
            </div>
          ))}
        </div>
      )}
      {query.trim() && matches.length === 0 && <p className="empty-state">No matches.</p>}
    </div>
  )
}

export default function EventDetail() {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [event, setEvent] = useState(null)
  const [rsvps, setRsvps] = useState([])
  const [attendance, setAttendance] = useState([])
  const [removeTarget, setRemoveTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [eventRes, rsvpsRes, attendanceRes] = await Promise.all([
        supabase.from('events').select('*').eq('id', id).maybeSingle(),
        supabase.from('rsvps').select('*, members(full_name)').eq('event_id', id),
        // attendance has two FKs to members (member_id, recorded_by —
        // the latter added in migration 0008), so the embed must name
        // which relationship to follow or PostgREST rejects it as
        // ambiguous. This is the attendee, not who checked them in.
        supabase.from('attendance').select('*, members!member_id(full_name)').eq('event_id', id),
      ])
      if (eventRes.error) throw eventRes.error
      if (rsvpsRes.error) throw rsvpsRes.error
      if (attendanceRes.error) throw attendanceRes.error

      setEvent(eventRes.data)
      setRsvps(rsvpsRes.data || [])
      setAttendance(attendanceRes.data || [])
    } catch (err) {
      setError(err.message)
      toast.error(`Could not load event: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleMarkComplete() {
    setBusy(true)
    try {
      await callLambda(COMPLETE_EVENT_URL, { eventId: id })
      toast.success('Event marked complete.')
      await load()
    } catch (err) {
      toast.error(`Could not mark event complete: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    const confirmed = window.confirm(
      'Cancel this event? Any approved missing-meeting forms tied to it will be voided and affected brothers ' +
        'notified. This cannot be undone.'
    )
    if (!confirmed) return
    setBusy(true)
    try {
      await callLambda(CANCEL_EVENT_URL, { eventId: id })
      toast.success('Event cancelled.')
      await load()
    } catch (err) {
      toast.error(`Could not cancel event: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveAttendance(member, note) {
    await callLambda(REMOVE_ATTENDANCE_URL, { eventId: id, memberId: member.id, note })
    await load()
  }

  if (loading) return <div className="eboard-main">Loading...</div>
  if (error) return <div className="eboard-main"><p className="error-text">{error}</p></div>
  if (!event) return <div className="eboard-main">Event not found.</div>

  const attendedIds = new Set(attendance.map((a) => a.member_id))

  return (
    <div className="eboard-main">
      <p><Link to="/eboard/events">&larr; Back to events</Link></p>
      <h1>{event.name}</h1>

      <div className="card">
        <table>
          <tbody>
            <tr><th>Category</th><td><span className={`pill ${event.category}`}>{event.category}</span></td></tr>
            <tr><th>Date</th><td>{formatDateTime(event.starts_at)}</td></tr>
            <tr><th>Location</th><td>{event.location || '-'}</td></tr>
            <tr><th>Points value</th><td>{event.points_value}</td></tr>
            <tr><th>Status</th><td><span className={`status-badge ${event.status}`}>{event.status}</span></td></tr>
          </tbody>
        </table>
        {event.status === 'scheduled' && (
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem' }}>
            <button className="btn" disabled={busy} onClick={handleMarkComplete}>Mark complete</button>
            <button className="btn danger" disabled={busy} onClick={handleCancel}>Cancel event</button>
          </div>
        )}
      </div>

      {event.status === 'scheduled' && (
        <>
          <CheckInQr eventId={id} />
          <ManualCheckIn eventId={id} alreadyAttendedIds={attendedIds} onCheckedIn={load} />
        </>
      )}

      <div className="card">
        <h2>RSVPs ({rsvps.length})</h2>
        {rsvps.length === 0 && <p className="empty-state">No RSVPs yet.</p>}
        {rsvps.length > 0 && (
          <table>
            <thead><tr><th>Name</th><th>Status</th></tr></thead>
            <tbody>
              {rsvps.map((r) => (
                <tr key={r.id}>
                  <td>{r.members?.full_name || '-'}</td>
                  <td><span className={`status-badge ${r.status}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Attendance ({attendance.length})</h2>
        {attendance.length === 0 && <p className="empty-state">No one checked in yet.</p>}
        {attendance.length > 0 && (
          <table>
            <thead><tr><th>Name</th><th>Method</th><th></th></tr></thead>
            <tbody>
              {attendance.map((a) => (
                <tr key={a.id}>
                  <td>{a.members?.full_name || '-'}</td>
                  <td>{a.check_in_method || '-'}</td>
                  <td>
                    <button
                      className="btn small danger"
                      onClick={() => setRemoveTarget({ id: a.member_id, full_name: a.members?.full_name || '-' })}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {removeTarget && (
        <RemoveAttendanceForm
          member={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onRemoved={(note) => handleRemoveAttendance(removeTarget, note)}
        />
      )}
    </div>
  )
}
