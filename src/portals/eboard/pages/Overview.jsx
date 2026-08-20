import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { getActiveSemester, formatDateTime, formatDate } from '../lib/queries'

export default function Overview() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeMemberCount, setActiveMemberCount] = useState(0)
  const [eventCount, setEventCount] = useState(0)
  const [pendingFormCount, setPendingFormCount] = useState(0)
  const [flaggedMembers, setFlaggedMembers] = useState([])
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [recentMeetings, setRecentMeetings] = useState([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const semester = await getActiveSemester()
        if (!semester) {
          if (!cancelled) {
            setActiveMemberCount(0)
            setEventCount(0)
            setPendingFormCount(0)
            setFlaggedMembers([])
            setUpcomingEvents([])
            setRecentMeetings([])
            setLoading(false)
          }
          return
        }

        const [
          membersRes,
          eventsCountRes,
          mmfCountRes,
          ltaCountRes,
          semesterMeetingsRes,
          upcomingRes,
          recentMeetingsRes,
        ] = await Promise.all([
          supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'active'),
          supabase
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('semester_id', semester.id),
          supabase
            .from('missing_meeting_forms')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('lower_threshold_applications')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase.from('events').select('id').eq('semester_id', semester.id).eq('category', 'meeting'),
          supabase
            .from('events')
            .select('*')
            .eq('status', 'scheduled')
            .gt('starts_at', new Date().toISOString())
            .order('starts_at', { ascending: true })
            .limit(5),
          supabase
            .from('events')
            .select('*')
            .eq('semester_id', semester.id)
            .eq('category', 'meeting')
            .eq('status', 'completed')
            .order('starts_at', { ascending: false })
            .limit(4),
        ])

        if (membersRes.error) throw membersRes.error
        if (eventsCountRes.error) throw eventsCountRes.error
        if (mmfCountRes.error) throw mmfCountRes.error
        if (ltaCountRes.error) throw ltaCountRes.error
        if (semesterMeetingsRes.error) throw semesterMeetingsRes.error
        if (upcomingRes.error) throw upcomingRes.error
        if (recentMeetingsRes.error) throw recentMeetingsRes.error

        const meetingIds = (semesterMeetingsRes.data || []).map((e) => e.id)

        let flagged = []
        if (meetingIds.length > 0) {
          const { data: attendanceRows, error: attendanceError } = await supabase
            .from('meeting_attendance')
            .select('member_id, status, members(full_name)')
            .in('event_id', meetingIds)
          if (attendanceError) throw attendanceError

          const tally = {}
          for (const row of attendanceRows || []) {
            if (!tally[row.member_id]) {
              tally[row.member_id] = { name: row.members?.full_name || 'Unknown', excused: 0, unexcused: 0 }
            }
            if (row.status === 'excused') tally[row.member_id].excused += 1
            if (row.status === 'unexcused') tally[row.member_id].unexcused += 1
          }

          flagged = Object.entries(tally)
            .filter(([, v]) => v.excused >= 2 || v.unexcused >= 1)
            .map(([member_id, v]) => ({ member_id, ...v }))
            .sort((a, b) => a.name.localeCompare(b.name))
        }

        let recentMeetingsWithCounts = []
        const recentMeetingIds = (recentMeetingsRes.data || []).map((e) => e.id)
        if (recentMeetingIds.length > 0) {
          const { data: attendanceRows, error: attendanceError } = await supabase
            .from('meeting_attendance')
            .select('event_id, status')
            .in('event_id', recentMeetingIds)
          if (attendanceError) throw attendanceError

          const counts = {}
          for (const row of attendanceRows || []) {
            if (!counts[row.event_id]) counts[row.event_id] = { present: 0, excused: 0, unexcused: 0 }
            counts[row.event_id][row.status] += 1
          }

          recentMeetingsWithCounts = (recentMeetingsRes.data || []).map((event) => ({
            ...event,
            counts: counts[event.id] || { present: 0, excused: 0, unexcused: 0 },
          }))
        }

        if (!cancelled) {
          setActiveMemberCount(membersRes.count || 0)
          setEventCount(eventsCountRes.count || 0)
          setPendingFormCount((mmfCountRes.count || 0) + (ltaCountRes.count || 0))
          setFlaggedMembers(flagged)
          setUpcomingEvents(upcomingRes.data || [])
          setRecentMeetings(recentMeetingsWithCounts)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          toast.error(`Could not load overview: ${err.message}`)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <div className="eboard-main">Loading...</div>

  return (
    <div className="eboard-main">
      <h1>Overview</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="value">{activeMemberCount}</div>
          <div className="label">Active members</div>
        </div>
        <div className="stat-tile">
          <div className="value">{eventCount}</div>
          <div className="label">Events this semester</div>
        </div>
        <div className="stat-tile">
          <div className="value">{pendingFormCount}</div>
          <div className="label">Pending forms</div>
        </div>
        <div className={`stat-tile ${flaggedMembers.length > 0 ? 'warn' : ''}`}>
          <div className="value">{flaggedMembers.length}</div>
          <div className="label">Attendance flags</div>
        </div>
      </div>

      <div className="section-row">
        <div className="card">
          <h2>Upcoming events</h2>
          {upcomingEvents.length === 0 && <p className="empty-state">No upcoming events.</p>}
          {upcomingEvents.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {upcomingEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{event.name}</td>
                    <td><span className={`pill ${event.category}`}>{event.category}</span></td>
                    <td>{formatDateTime(event.starts_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Recent meetings</h2>
          {recentMeetings.length === 0 && <p className="empty-state">No completed meetings yet.</p>}
          {recentMeetings.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Meeting</th>
                  <th>Date</th>
                  <th>Present</th>
                  <th>Excused</th>
                  <th>Unexcused</th>
                </tr>
              </thead>
              <tbody>
                {recentMeetings.map((event) => (
                  <tr key={event.id}>
                    <td>{event.name}</td>
                    <td>{formatDate(event.starts_at)}</td>
                    <td>{event.counts.present}</td>
                    <td>{event.counts.excused}</td>
                    <td>{event.counts.unexcused}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Attendance flags</h2>
        {flaggedMembers.length === 0 && (
          <p className="empty-state">No brothers over the attendance limit.</p>
        )}
        {flaggedMembers.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Brother</th>
                <th>Excused</th>
                <th>Unexcused</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {flaggedMembers.map((m) => (
                <tr key={m.member_id}>
                  <td>{m.name}</td>
                  <td>{m.excused}</td>
                  <td>{m.unexcused}</td>
                  <td>
                    <Link className="row-link" to={`/eboard/brothers/${m.member_id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
