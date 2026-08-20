import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { callLambda } from '../../../lib/lambdas'
import { getActiveSemester, formatDateTime } from '../lib/queries'

const CATEGORIES = ['professional', 'service', 'fundraising', 'social', 'rush', 'extra', 'meeting']
const COMPLETE_EVENT_URL = import.meta.env.VITE_COMPLETE_EVENT_URL
const CANCEL_EVENT_URL = import.meta.env.VITE_CANCEL_EVENT_URL

function AddEventForm({ semester, onClose, onAdded }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('professional')
  const [pointsValue, setPointsValue] = useState(0)
  const [isRequired, setIsRequired] = useState(false)
  const [location, setLocation] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const { error: insertError } = await supabase.from('events').insert({
        semester_id: semester.id,
        name,
        category,
        points_value: Number(pointsValue) || 0,
        is_required: isRequired,
        location: location || null,
        starts_at: new Date(startsAt).toISOString(),
      })
      if (insertError) throw insertError
      onAdded()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add event</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="name">Name</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="category">Category</label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="points_value">Points value</label>
            <input
              id="points_value"
              type="number"
              min="0"
              value={pointsValue}
              onChange={(e) => setPointsValue(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="location">Location</label>
            <input id="location" type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="starts_at">Starts at</label>
            <input
              id="starts_at"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </div>
          <div className="form-field checkbox">
            <input
              id="is_required"
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            <label htmlFor="is_required" style={{ marginBottom: 0 }}>Required event</label>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add event'}
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

export default function Events() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [semester, setSemester] = useState(null)
  const [events, setEvents] = useState([])
  const [rsvpCounts, setRsvpCounts] = useState({})
  const [attendanceCounts, setAttendanceCounts] = useState({})
  const [showAddForm, setShowAddForm] = useState(false)
  const [busyEventId, setBusyEventId] = useState(null)
  const [showPast, setShowPast] = useState(false)
  const [searchName, setSearchName] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const activeSemester = await getActiveSemester()
      setSemester(activeSemester)
      if (!activeSemester) {
        setEvents([])
        setLoading(false)
        return
      }

      const { data: eventRows, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('semester_id', activeSemester.id)
        .order('starts_at', { ascending: true })
      if (eventsError) throw eventsError

      const eventIds = (eventRows || []).map((e) => e.id)
      let rsvpMap = {}
      let attendanceMap = {}

      if (eventIds.length > 0) {
        const [rsvpRes, attendanceRes] = await Promise.all([
          supabase.from('rsvps').select('event_id').eq('status', 'going').in('event_id', eventIds),
          supabase.from('attendance').select('event_id').in('event_id', eventIds),
        ])
        if (rsvpRes.error) throw rsvpRes.error
        if (attendanceRes.error) throw attendanceRes.error

        for (const row of rsvpRes.data || []) rsvpMap[row.event_id] = (rsvpMap[row.event_id] || 0) + 1
        for (const row of attendanceRes.data || []) {
          attendanceMap[row.event_id] = (attendanceMap[row.event_id] || 0) + 1
        }
      }

      setEvents(eventRows || [])
      setRsvpCounts(rsvpMap)
      setAttendanceCounts(attendanceMap)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleMarkComplete(event) {
    setBusyEventId(event.id)
    setError(null)
    try {
      await callLambda(COMPLETE_EVENT_URL, { eventId: event.id })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyEventId(null)
    }
  }

  async function handleCancel(event) {
    const confirmed = window.confirm(
      `Cancel "${event.name}"? Any approved missing-meeting forms tied to it will be voided and affected ` +
        'brothers notified. This cannot be undone.'
    )
    if (!confirmed) return

    setBusyEventId(event.id)
    setError(null)
    try {
      await callLambda(CANCEL_EVENT_URL, { eventId: event.id })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyEventId(null)
    }
  }

  const filteredEvents = useMemo(() => {
    const nameQuery = searchName.trim().toLowerCase()
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null
    // End-of-day so a "to" date includes events that start on that day.
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null

    return events.filter((event) => {
      if (!showPast && event.status !== 'scheduled') return false
      if (nameQuery && !event.name.toLowerCase().includes(nameQuery)) return false
      const startTime = new Date(event.starts_at).getTime()
      if (fromTime !== null && startTime < fromTime) return false
      if (toTime !== null && startTime > toTime) return false
      return true
    })
  }, [events, showPast, searchName, dateFrom, dateTo])

  if (loading) return <div className="eboard-main">Loading...</div>

  return (
    <div className="eboard-main">
      <h1>Events</h1>
      {error && <p className="error-text">{error}</p>}

      {!semester && <p className="empty-state">No active semester configured.</p>}

      {semester && (
        <>
          <div className="toolbar">
            <input
              type="text"
              placeholder="Search by name..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
            />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="From date"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="To date"
            />
            <button type="button" className="btn secondary" onClick={() => setShowPast((v) => !v)}>
              {showPast ? 'Hide past events' : 'Show past events'}
            </button>
            <div className="spacer" />
            <button className="btn" onClick={() => setShowAddForm(true)}>Add event</button>
          </div>

          <div className="card">
            {filteredEvents.length === 0 && (
              <p className="empty-state">
                {events.length === 0 ? 'No events this semester.' : 'No events match these filters.'}
              </p>
            )}
            {filteredEvents.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>RSVPs / Attendance</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((event) => {
                    const isBusy = busyEventId === event.id
                    return (
                      <tr key={event.id}>
                        <td><Link to={`/eboard/events/${event.id}`}>{event.name}</Link></td>
                        <td><span className={`pill ${event.category}`}>{event.category}</span></td>
                        <td>{formatDateTime(event.starts_at)}</td>
                        <td><span className={`status-badge ${event.status}`}>{event.status}</span></td>
                        <td>
                          {event.status === 'completed'
                            ? `${attendanceCounts[event.id] || 0} attended`
                            : `${rsvpCounts[event.id] || 0} going`}
                        </td>
                        <td>
                          {event.status === 'scheduled' && (
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button
                                className="btn small"
                                disabled={isBusy}
                                onClick={() => handleMarkComplete(event)}
                              >
                                Mark complete
                              </button>
                              <button
                                className="btn small danger"
                                disabled={isBusy}
                                onClick={() => handleCancel(event)}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {showAddForm && (
        <AddEventForm
          semester={semester}
          onClose={() => setShowAddForm(false)}
          onAdded={() => {
            setShowAddForm(false)
            load()
          }}
        />
      )}
    </div>
  )
}
