import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { callLambda } from '../../../lib/lambdas'
import { formatDateTime } from '../lib/queries'
import { initials } from '../../../lib/queries'
import Topbar from '../components/Topbar'
import { BrotherPageSkeleton } from '../../../components/Skeleton'

const RECORD_LATE_CANCEL_URL = import.meta.env.VITE_RECORD_LATE_CANCEL_URL
const LATE_CANCEL_WINDOW_HOURS = 24

function Avatar({ member }) {
  if (member.avatar_url) {
    return <img src={member.avatar_url} alt="" className="avatar" style={{ objectFit: 'cover' }} />
  }
  return <div className="avatar">{initials(member.full_name)}</div>
}

export default function EventDetail({ profile }) {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [event, setEvent] = useState(null)
  const [attendees, setAttendees] = useState([])
  const [myRsvp, setMyRsvp] = useState(null)
  const [attended, setAttended] = useState(false)
  const [meetingRecord, setMeetingRecord] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [eventRes, attendeesRes, myRsvpRes, attendanceRes, meetingRes] = await Promise.all([
        supabase.from('events').select('*').eq('id', id).maybeSingle(),
        supabase
          .from('rsvps')
          .select('member_id, members(id, full_name, pledge_class, avatar_url)')
          .eq('event_id', id)
          .eq('status', 'going'),
        supabase.from('rsvps').select('*').eq('event_id', id).eq('member_id', profile.id).maybeSingle(),
        supabase.from('attendance').select('id').eq('event_id', id).eq('member_id', profile.id).maybeSingle(),
        supabase.from('meeting_attendance').select('*').eq('event_id', id).eq('member_id', profile.id).maybeSingle(),
      ])

      if (eventRes.error) throw eventRes.error
      if (attendeesRes.error) throw attendeesRes.error
      if (myRsvpRes.error) throw myRsvpRes.error
      if (attendanceRes.error) throw attendanceRes.error
      if (meetingRes.error) throw meetingRes.error

      const sortedAttendees = (attendeesRes.data || [])
        .map((r) => r.members)
        .filter(Boolean)
        .sort((a, b) => a.full_name.localeCompare(b.full_name))

      setEvent(eventRes.data)
      setAttendees(sortedAttendees)
      setMyRsvp(myRsvpRes.data)
      setAttended(Boolean(attendanceRes.data))
      setMeetingRecord(meetingRes.data)
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

  async function handleRsvp() {
    setBusy(true)
    try {
      const { data, error: upsertError } = await supabase
        .from('rsvps')
        .upsert({ event_id: id, member_id: profile.id, status: 'going' }, { onConflict: 'event_id,member_id' })
        .select()
        .single()
      if (upsertError) throw upsertError
      setMyRsvp(data)
      setAttendees((prev) =>
        prev.some((m) => m.id === profile.id)
          ? prev
          : [...prev, { id: profile.id, full_name: profile.full_name, pledge_class: profile.pledge_class, avatar_url: profile.avatar_url }]
              .sort((a, b) => a.full_name.localeCompare(b.full_name))
      )
      toast.success(`RSVP'd to ${event.name}.`)
    } catch (err) {
      if (err.message?.includes('at capacity')) {
        toast.error(`${event.name} is full.`)
      } else {
        toast.error(`Could not RSVP: ${err.message}`)
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleCancelRsvp() {
    if (!myRsvp) return

    const hoursUntilStart = (new Date(event.starts_at).getTime() - Date.now()) / (1000 * 60 * 60)
    const isLate = hoursUntilStart <= LATE_CANCEL_WINDOW_HOURS
    if (isLate) {
      const confirmed = window.confirm(
        `This event starts within ${LATE_CANCEL_WINDOW_HOURS} hours. Cancelling now is a late cancel and posts a ` +
          '-10 point penalty. Cancel anyway?'
      )
      if (!confirmed) return
    }

    setBusy(true)
    try {
      await callLambda(RECORD_LATE_CANCEL_URL, { rsvpId: myRsvp.id, memberId: profile.id })
      setMyRsvp((prev) => ({ ...prev, status: 'cancelled' }))
      setAttendees((prev) => prev.filter((m) => m.id !== profile.id))
      toast.success(isLate ? 'RSVP cancelled — a late cancel penalty was posted.' : 'RSVP cancelled.')
    } catch (err) {
      toast.error(`Could not cancel RSVP: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  function renderAction() {
    if (!event) return null
    const isFuture = event.status === 'scheduled' && new Date(event.starts_at) > new Date()

    if (event.category === 'meeting') {
      if (!meetingRecord) return <span className="empty-state">Not recorded yet</span>
      return <span className={`status-badge ${meetingRecord.status}`}>{meetingRecord.status}</span>
    }

    if (event.status === 'completed') {
      return (
        <span className={`status-badge ${attended ? 'attended' : 'missed'}`}>
          {attended ? 'Attended' : 'Not marked present'}
        </span>
      )
    }

    if (isFuture) {
      if (myRsvp && myRsvp.status === 'going') {
        return (
          <button className="btn danger" disabled={busy} onClick={handleCancelRsvp}>
            {busy ? 'Updating...' : 'Cancel RSVP'}
          </button>
        )
      }
      const isFull = event.capacity != null && attendees.length >= event.capacity
      if (isFull) return <span className="status-badge unexcused">Event full</span>
      return (
        <button className="btn" disabled={busy} onClick={handleRsvp}>
          {busy ? 'Updating...' : 'RSVP'}
        </button>
      )
    }

    if (event.status === 'cancelled') {
      return <span className="status-badge unexcused">Cancelled</span>
    }

    return null
  }

  return (
    <div>
      <Topbar profile={profile}>
        <div className="topbar-title">Event</div>
      </Topbar>
      <div className="page">
        <Link to="/brother/events" className="back-link">&larr; Back to events</Link>

        {loading && <BrotherPageSkeleton variant="list" />}
        {error && <p className="error-text" role="alert">{error}</p>}

        {!loading && !error && !event && <p className="empty-state">Event not found.</p>}

        {!loading && event && (
          <>
            <div className="card">
              <div className="title" style={{ fontSize: '1.1rem', marginBottom: '0.35rem' }}>{event.name}</div>
              <div className="meta">
                <span className={`pill ${event.category}`}>{event.category}</span>{' '}
                {event.is_required && <span className="status-badge required">Required</span>}
              </div>
              <div className="meta" style={{ marginTop: '0.5rem' }}>{formatDateTime(event.starts_at)}</div>
              {event.location && <div className="meta">{event.location}</div>}
              <div className="meta">{event.points_value} pts</div>
              {event.dress_code && <div className="meta">Dress code: {event.dress_code}</div>}
              {event.capacity != null && (
                <div className="meta">{attendees.length} / {event.capacity} RSVP'd</div>
              )}
              {event.description && <p style={{ marginTop: '0.6rem' }}>{event.description}</p>}
              <div style={{ marginTop: '0.75rem' }}>{renderAction()}</div>
            </div>

            <div className="section-label">Who's going ({attendees.length})</div>
            {attendees.length === 0 && <p className="empty-state">No one has RSVPed yet.</p>}
            {attendees.length > 0 && (
              <div className="card">
                {attendees.map((member) => (
                  <Link className="roster-row" to={`/brother/roster/${member.id}`} key={member.id}>
                    <Avatar member={member} />
                    <div className="roster-row-body">
                      <div className="roster-row-name">
                        {member.full_name}
                        {member.id === profile.id && <span className="roster-row-you"> (You)</span>}
                      </div>
                      {member.pledge_class && <div className="roster-row-sub">{member.pledge_class}</div>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
