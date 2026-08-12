import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { getActiveSemester, formatDateTime } from '../lib/queries'

export default function Events({ profile }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [events, setEvents] = useState([])
  const [rsvpByEvent, setRsvpByEvent] = useState({})
  const [attendedEventIds, setAttendedEventIds] = useState(new Set())
  const [meetingAttendanceByEvent, setMeetingAttendanceByEvent] = useState({})
  const [busyEventId, setBusyEventId] = useState(null)

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
    setError(null)
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
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyEventId(null)
    }
  }

  async function handleCancelRsvp(event) {
    setBusyEventId(event.id)
    setError(null)
    try {
      const { data, error: updateError } = await supabase
        .from('rsvps')
        .update({ status: 'cancelled' })
        .eq('event_id', event.id)
        .eq('member_id', profile.id)
        .select()
        .single()
      if (updateError) throw updateError
      setRsvpByEvent((prev) => ({ ...prev, [event.id]: data }))
    } catch (err) {
      setError(err.message)
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

  if (loading) return <div className="page">Loading...</div>

  return (
    <div className="page">
      <h1>Events</h1>
      {error && <p className="error-text">{error}</p>}

      {events.length === 0 && <p className="empty-state">No events this semester.</p>}

      <div className="card">
        {events.map((event) => (
          <div className="list-item" key={event.id}>
            <div className="title">{event.name}</div>
            <div className="meta">
              <span className={`pill ${event.category}`}>{event.category}</span>{' '}
              {formatDateTime(event.starts_at)} &middot; {event.points_value} pts
            </div>
            <div style={{ marginTop: '0.5rem' }}>{renderAction(event)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
