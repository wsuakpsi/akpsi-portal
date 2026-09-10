import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { callLambda } from '../../../lib/lambdas'
import { formatDateTime, toDatetimeLocalValue, EVENT_CATEGORIES } from '../lib/queries'

const COMPLETE_EVENT_URL = import.meta.env.VITE_COMPLETE_EVENT_URL
const CANCEL_EVENT_URL = import.meta.env.VITE_CANCEL_EVENT_URL
const GENERATE_CHECKIN_TOKEN_URL = import.meta.env.VITE_GENERATE_CHECKIN_TOKEN_URL
const RECORD_ATTENDANCE_URL = import.meta.env.VITE_RECORD_ATTENDANCE_URL
const REMOVE_ATTENDANCE_URL = import.meta.env.VITE_REMOVE_ATTENDANCE_URL
const BROTHER_PORTAL_URL = import.meta.env.VITE_BROTHER_PORTAL_URL

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

function ConfirmModal({ title, body, confirmLabel, busy, onConfirm, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="note-text">{body}</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button type="button" className="btn" disabled={busy} onClick={onConfirm}>
            {busy ? 'Working...' : confirmLabel}
          </button>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function EditEventForm({ event, onClose, onSaved }) {
  const [name, setName] = useState(event.name)
  const [category, setCategory] = useState(event.category)
  const [pointsValue, setPointsValue] = useState(event.points_value)
  const [isRequired, setIsRequired] = useState(event.is_required)
  const [location, setLocation] = useState(event.location || '')
  const [startsAt, setStartsAt] = useState(toDatetimeLocalValue(event.starts_at))
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('events')
        .update({
          name,
          category,
          points_value: Number(pointsValue) || 0,
          is_required: isRequired,
          location: location || null,
          starts_at: new Date(startsAt).toISOString(),
        })
        .eq('id', event.id)
      if (error) throw error

      if (event.google_calendar_event_id) {
        toast('Saved. Note: this does not update the existing Google Calendar event.', { icon: 'ℹ️' })
      } else {
        toast.success('Event updated.')
      }
      onSaved()
    } catch (err) {
      toast.error(`Could not update event: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit event</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="edit-name">Name</label>
            <input id="edit-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="edit-category">Category</label>
            <select id="edit-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {EVENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="edit-points_value">Points value</label>
            <input
              id="edit-points_value"
              type="number"
              min="0"
              value={pointsValue}
              onChange={(e) => setPointsValue(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-location">Location</label>
            <input id="edit-location" type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="edit-starts_at">Starts at</label>
            <input
              id="edit-starts_at"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </div>
          <div className="form-field checkbox">
            <input
              id="edit-is_required"
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            <label htmlFor="edit-is_required" style={{ marginBottom: 0 }}>Required event</label>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save changes'}
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

function CheckInQr({ eventId, eventName }) {
  const [state, setState] = useState('idle') // idle | loading | error
  const [error, setError] = useState(null)

  async function handleOpen() {
    setState('loading')
    setError(null)
    // Open the tab synchronously, before the await below, so browsers (Safari
    // in particular) still count it as triggered directly by the click and
    // don't silently block it — then navigate that tab once the token is ready.
    const tab = window.open('', '_blank')
    try {
      if (!BROTHER_PORTAL_URL) throw new Error('VITE_BROTHER_PORTAL_URL is not configured')
      const res = await callLambda(GENERATE_CHECKIN_TOKEN_URL, { eventId })
      const params = new URLSearchParams({ token: res.token, expiresAt: res.expiresAt, eventName: eventName || '' })
      if (tab) {
        tab.location.href = `/eboard/checkin-qr?${params.toString()}`
      } else {
        throw new Error('Popup blocked — allow popups for this site to show the QR code.')
      }
      setState('idle')
    } catch (err) {
      if (tab) tab.close()
      setError(err.message)
      setState('error')
      toast.error(`Could not generate check-in QR: ${err.message}`)
    }
  }

  return (
    <div className="card">
      <h2>Check-in QR</h2>
      <p className="note-text">Opens in a new tab you can put fullscreen for scanning.</p>
      <button className="btn" disabled={state === 'loading'} onClick={handleOpen}>
        {state === 'loading' ? 'Opening...' : 'Open check-in QR'}
      </button>
      {state === 'error' && <p className="error-text">{error}</p>}
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
  const [showEditForm, setShowEditForm] = useState(false)
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rsvpSearch, setRsvpSearch] = useState('')
  const [attendanceSearch, setAttendanceSearch] = useState('')

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
      setShowCompleteConfirm(false)
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
      const result = await callLambda(CANCEL_EVENT_URL, { eventId: id })
      toast.success('Event cancelled.')
      if (result.calendarDeleted) toast.success('Removed from Google Calendar.')
      if (result.calendarError) toast.error(`Calendar removal failed: ${result.calendarError}`)
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
  const filteredRsvps = rsvps.filter((r) =>
    (r.members?.full_name || '').toLowerCase().includes(rsvpSearch.trim().toLowerCase())
  )
  const filteredAttendance = attendance.filter((a) =>
    (a.members?.full_name || '').toLowerCase().includes(attendanceSearch.trim().toLowerCase())
  )

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
            <button className="btn secondary" disabled={busy} onClick={() => setShowEditForm(true)}>Edit event</button>
            {new Date(event.starts_at) <= new Date() && (
              <button className="btn" disabled={busy} onClick={() => setShowCompleteConfirm(true)}>Mark complete</button>
            )}
            <button className="btn danger" disabled={busy} onClick={handleCancel}>Cancel event</button>
          </div>
        )}
      </div>

      {event.status === 'scheduled' && (
        <>
          <CheckInQr eventId={id} eventName={event.name} />
          <ManualCheckIn eventId={id} alreadyAttendedIds={attendedIds} onCheckedIn={load} />
        </>
      )}

      <div className="card">
        <h2>RSVPs ({rsvps.length})</h2>
        {rsvps.length === 0 && <p className="empty-state">No RSVPs yet.</p>}
        {rsvps.length > 0 && (
          <>
            <div className="toolbar">
              <input
                type="text"
                placeholder="Search RSVPs by name"
                value={rsvpSearch}
                onChange={(e) => setRsvpSearch(e.target.value)}
              />
            </div>
            {filteredRsvps.length === 0 && <p className="empty-state">No RSVPs match "{rsvpSearch}".</p>}
            {filteredRsvps.length > 0 && (
              <table>
                <thead><tr><th>Name</th><th>Status</th></tr></thead>
                <tbody>
                  {filteredRsvps.map((r) => (
                    <tr key={r.id}>
                      <td>{r.members?.full_name || '-'}</td>
                      <td><span className={`status-badge ${r.status}`}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2>Attendance ({attendance.length})</h2>
        {attendance.length === 0 && <p className="empty-state">No one checked in yet.</p>}
        {attendance.length > 0 && (
          <>
            <div className="toolbar">
              <input
                type="text"
                placeholder="Search attendance by name"
                value={attendanceSearch}
                onChange={(e) => setAttendanceSearch(e.target.value)}
              />
            </div>
            {filteredAttendance.length === 0 && <p className="empty-state">No one matches "{attendanceSearch}".</p>}
            {filteredAttendance.length > 0 && (
              <table>
                <thead><tr><th>Name</th><th>Method</th><th></th></tr></thead>
                <tbody>
                  {filteredAttendance.map((a) => (
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
          </>
        )}
      </div>

      {removeTarget && (
        <RemoveAttendanceForm
          member={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onRemoved={(note) => handleRemoveAttendance(removeTarget, note)}
        />
      )}

      {showEditForm && (
        <EditEventForm
          event={event}
          onClose={() => setShowEditForm(false)}
          onSaved={() => {
            setShowEditForm(false)
            load()
          }}
        />
      )}

      {showCompleteConfirm && (
        <ConfirmModal
          title="Mark event complete?"
          body={
            event.category === 'meeting'
              ? `This locks in attendance for "${event.name}". This cannot be undone from the UI.`
              : `This locks in attendance for "${event.name}": brothers who checked in earn ${event.points_value} ` +
                'point(s), and anyone who RSVPed "going" but never checked in gets a 10-point no-show penalty. ' +
                'This cannot be undone from the UI.'
          }
          confirmLabel="Mark complete"
          busy={busy}
          onConfirm={handleMarkComplete}
          onClose={() => setShowCompleteConfirm(false)}
        />
      )}
    </div>
  )
}
