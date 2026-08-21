import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { callLambda } from '../../../lib/lambdas'
import { getActiveSemester } from '../lib/queries'

const CATEGORIES = ['professional', 'service', 'fundraising', 'social', 'rush', 'extra', 'meeting']
const COMPLETE_EVENT_URL = import.meta.env.VITE_COMPLETE_EVENT_URL
const CANCEL_EVENT_URL = import.meta.env.VITE_CANCEL_EVENT_URL
const ADD_TO_CALENDAR_URL = import.meta.env.VITE_ADD_TO_CALENDAR_URL

function AddEventForm({ semester, onClose, onAdded }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('professional')
  const [pointsValue, setPointsValue] = useState(0)
  const [isRequired, setIsRequired] = useState(false)
  const [location, setLocation] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(120)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
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

      // Best-effort: sync to Google Calendar. If this fails, the event is
      // still in the DB — just warn the user rather than treating it as fatal.
      if (ADD_TO_CALENDAR_URL) {
        try {
          await callLambda(ADD_TO_CALENDAR_URL, {
            name,
            startsAt: new Date(startsAt).toISOString(),
            location: location || null,
            category,
            pointsValue: Number(pointsValue) || 0,
            durationMinutes: Number(durationMinutes) || 120,
          })
        } catch (calErr) {
          toast.error(`Event saved, but calendar sync failed: ${calErr.message}`)
        }
      }

      const calendarNote = ADD_TO_CALENDAR_URL ? ' and added to Google Calendar' : ''
      toast.success(`${name} added${calendarNote}.`)
      onAdded()
    } catch (err) {
      toast.error(`Could not add event: ${err.message}`)
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
          <div className="form-field">
            <label htmlFor="duration">Duration (minutes)</label>
            <input
              id="duration"
              type="number"
              min="15"
              step="15"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
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
      toast.error(`Could not load events: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleMarkComplete(event) {
    setBusyEventId(event.id)
    try {
      await callLambda(COMPLETE_EVENT_URL, { eventId: event.id })
      toast.success(`${event.name} marked complete.`)
      await load()
    } catch (err) {
      toast.error(`Could not mark event complete: ${err.message}`)
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
    try {
      await callLambda(CANCEL_EVENT_URL, { eventId: event.id })
      toast.success(`${event.name} cancelled.`)
      await load()
    } catch (err) {
      toast.error(`Could not cancel event: ${err.message}`)
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

  const upcoming = filteredEvents.filter((e) => e.status === 'scheduled')
  const completed = filteredEvents.filter((e) => e.status === 'completed')
  const cancelled = filteredEvents.filter((e) => e.status === 'cancelled')

  function renderEventRow(event) {
    const isBusy = busyEventId === event.id
    const date = new Date(event.starts_at)
    return (
      <div className="event-row" key={event.id}>
        <div className="date-block">
          <div className="date-month">{date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</div>
          <div className="date-day">{date.getDate()}</div>
          <div className="date-weekday">{date.toLocaleDateString(undefined, { weekday: 'short' })}</div>
        </div>
        <div className="event-row-body">
          <div className="event-row-title">
            <span>{event.name}</span>
            <span className={`pill ${event.category}`}>{event.category}</span>
            {event.is_required && <span className="status-badge required">Required</span>}
            <span className={`status-badge ${event.status}`}>{event.status}</span>
          </div>
          <div className="event-row-sub">
            {date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} &middot; {event.location || 'TBD'}
            {event.points_value ? ` · +${event.points_value} pts` : ''}
          </div>
        </div>
        <div className="event-row-stats">
          {event.status === 'completed' ? (
            <>
              <div className="stat-num">{attendanceCounts[event.id] || 0}</div>
              <div className="stat-label">Attended</div>
            </>
          ) : event.status === 'cancelled' ? (
            <div className="stat-label">Voided</div>
          ) : (
            <>
              <div className="stat-num">{rsvpCounts[event.id] || 0}</div>
              <div className="stat-label">RSVP'd</div>
            </>
          )}
        </div>
        <div className="event-row-actions">
          {event.status === 'scheduled' && (
            <>
              <button className="btn small secondary" disabled={isBusy} onClick={() => handleMarkComplete(event)}>
                Mark complete
              </button>
              <Link className="btn small secondary" to={`/eboard/events/${event.id}`}>View</Link>
              <button className="btn small danger" disabled={isBusy} onClick={() => handleCancel(event)}>
                Cancel
              </button>
            </>
          )}
          {event.status !== 'scheduled' && (
            <Link className="btn small secondary" to={`/eboard/events/${event.id}`}>View</Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="eboard-main">
      <div className="page-header">
        <div>
          <h1>Events</h1>
          <p className="page-subtitle">
            {semester ? semester.name : 'No active semester'} &middot; {events.length} events
          </p>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}

      {!semester && <p className="empty-state">No active semester configured.</p>}

      {semester && (
        <>
          <div className="toolbar">
            <input
              type="text"
              placeholder="Search events"
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
            <button className="btn" onClick={() => setShowAddForm(true)}>+ Add event</button>
          </div>

          {filteredEvents.length === 0 && (
            <div className="card">
              <p className="empty-state">
                {events.length === 0 ? 'No events this semester.' : 'No events match these filters.'}
              </p>
            </div>
          )}

          {upcoming.length > 0 && (
            <>
              <div className="section-label">Upcoming</div>
              <div className="card">{upcoming.map(renderEventRow)}</div>
            </>
          )}
          {completed.length > 0 && (
            <>
              <div className="section-label">Completed</div>
              <div className="card">{completed.map(renderEventRow)}</div>
            </>
          )}
          {cancelled.length > 0 && (
            <>
              <div className="section-label">Cancelled</div>
              <div className="card">{cancelled.map(renderEventRow)}</div>
            </>
          )}
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
