import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { callLambda } from '../../../lib/lambdas'
import { getActiveSemester, formatDateTime } from '../lib/queries'
import Topbar from '../components/Topbar'

const RECORD_LATE_CANCEL_URL = import.meta.env.VITE_RECORD_LATE_CANCEL_URL
const LATE_CANCEL_WINDOW_HOURS = 24

export default function Events({ profile }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [events, setEvents] = useState([])
  const [rsvpByEvent, setRsvpByEvent] = useState({})
  const [attendedEventIds, setAttendedEventIds] = useState(new Set())
  const [meetingAttendanceByEvent, setMeetingAttendanceByEvent] = useState({})
  const [busyEventId, setBusyEventId] = useState(null)
  const [view, setView] = useState('upcoming')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const semester = await getActiveSemester()
      if (!semester) {
        setEvents([])
        setLoading(false)
        return
      }

      const [eventsRes, rsvpsRes, attendanceRes, meetingRes] = await Promise.all([
        supabase
          .from('events')
          .select('*')
          .eq('semester_id', semester.id)
          .order('starts_at', { ascending: true }),
        supabase.from('rsvps').select('*').eq('member_id', profile.id),
        supabase.from('attendance').select('*').eq('member_id', profile.id),
        supabase.from('meeting_attendance').select('*').eq('member_id', profile.id),
      ])

      if (eventsRes.error) throw eventsRes.error
      if (rsvpsRes.error) throw rsvpsRes.error
      if (attendanceRes.error) throw attendanceRes.error
      if (meetingRes.error) throw meetingRes.error

      const rsvpMap = {}
      for (const r of rsvpsRes.data) rsvpMap[r.event_id] = r

      const meetingMap = {}
      for (const m of meetingRes.data) meetingMap[m.event_id] = m

      setEvents(eventsRes.data || [])
      setRsvpByEvent(rsvpMap)
      setAttendedEventIds(new Set(attendanceRes.data.map((a) => a.event_id)))
      setMeetingAttendanceByEvent(meetingMap)
    } catch (err) {
      setError(err.message)
      toast.error(`Could not load events: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  async function handleRsvp(event) {
    setBusyEventId(event.id)
    try {
      const { data, error: upsertError } = await supabase
        .from('rsvps')
        .upsert(
          { event_id: event.id, member_id: profile.id, status: 'going' },
          { onConflict: 'event_id,member_id' }
        )
        .select()
        .single()
      if (upsertError) throw upsertError
      setRsvpByEvent((prev) => ({ ...prev, [event.id]: data }))
      toast.success(`RSVP'd to ${event.name}.`)
    } catch (err) {
      toast.error(`Could not RSVP: ${err.message}`)
    } finally {
      setBusyEventId(null)
    }
  }

  async function handleCancelRsvp(event) {
    const rsvp = rsvpByEvent[event.id]
    if (!rsvp) return

    const hoursUntilStart = (new Date(event.starts_at).getTime() - Date.now()) / (1000 * 60 * 60)
    const isLate = hoursUntilStart <= LATE_CANCEL_WINDOW_HOURS
    if (isLate) {
      const confirmed = window.confirm(
        `This event starts within ${LATE_CANCEL_WINDOW_HOURS} hours. Cancelling now is a late cancel and posts a ` +
          '-10 point penalty. Cancel anyway?'
      )
      if (!confirmed) return
    }

    setBusyEventId(event.id)
    try {
      await callLambda(RECORD_LATE_CANCEL_URL, { rsvpId: rsvp.id, memberId: profile.id })
      setRsvpByEvent((prev) => ({ ...prev, [event.id]: { ...rsvp, status: 'cancelled' } }))
      toast.success(isLate ? `RSVP cancelled — a late cancel penalty was posted.` : 'RSVP cancelled.')
    } catch (err) {
      toast.error(`Could not cancel RSVP: ${err.message}`)
    } finally {
      setBusyEventId(null)
    }
  }

  function renderAction(event) {
    const isFuture = event.status === 'scheduled' && new Date(event.starts_at) > new Date()
    const isBusy = busyEventId === event.id

    if (event.category === 'meeting') {
      const record = meetingAttendanceByEvent[event.id]
      if (!record) return <span className="empty-state">Not recorded yet</span>
      return <span className={`status-badge ${record.status}`}>{record.status}</span>
    }

    if (event.status === 'completed') {
      const attended = attendedEventIds.has(event.id)
      return (
        <span className={`status-badge ${attended ? 'attended' : 'missed'}`}>
          {attended ? 'Attended' : 'Not marked present'}
        </span>
      )
    }

    if (isFuture) {
      const rsvp = rsvpByEvent[event.id]
      if (rsvp && rsvp.status === 'going') {
        return (
          <button className="btn danger" disabled={isBusy} onClick={() => handleCancelRsvp(event)}>
            {isBusy ? 'Updating...' : 'Cancel RSVP'}
          </button>
        )
      }
      return (
        <button className="btn" disabled={isBusy} onClick={() => handleRsvp(event)}>
          {isBusy ? 'Updating...' : 'RSVP'}
        </button>
      )
    }

    if (event.status === 'cancelled') {
      return <span className="status-badge unexcused">Cancelled</span>
    }

    return null
  }

  const now = new Date()
  const upcomingEvents = events.filter((e) => new Date(e.starts_at) > now)
  const pastEvents = events
    .filter((e) => new Date(e.starts_at) <= now)
    .slice()
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
  const visibleEvents = view === 'upcoming' ? upcomingEvents : pastEvents

  return (
    <div>
      <Topbar profile={profile}>
        <div className="topbar-title">Events</div>
      </Topbar>
      <div className="page">
        {loading && <p className="empty-state">Loading...</p>}
        {error && <p className="error-text">{error}</p>}

        {!loading && (
          <div className="tabs">
            <button className={`tab ${view === 'upcoming' ? 'active' : ''}`} onClick={() => setView('upcoming')}>
              Upcoming
            </button>
            <button className={`tab ${view === 'past' ? 'active' : ''}`} onClick={() => setView('past')}>
              Past
            </button>
          </div>
        )}

        {!loading && visibleEvents.length === 0 && (
          <p className="empty-state">No {view} events.</p>
        )}

        {!loading && visibleEvents.length > 0 && (
          <div className="card">
            {visibleEvents.map((event) => (
              <div className="list-item" key={event.id}>
                <div className="title">{event.name}</div>
                <div className="meta">
                  <span className={`pill ${event.category}`}>{event.category}</span>{' '}
                  {formatDateTime(event.starts_at)} &middot; {event.points_value} pts
                  {event.location && <> &middot; {event.location}</>}
                </div>
                <div style={{ marginTop: '0.5rem' }}>{renderAction(event)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
