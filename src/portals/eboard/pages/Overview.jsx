import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { getActiveSemester, formatDateTime, formatDate } from '../lib/queries'

const LAST_SYNC_STORAGE_KEY = 'eboard.lastSheetsSyncAt'

function timeAgo(iso) {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(ms / (1000 * 60 * 60))
  if (hours < 1) return 'less than an hour ago'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function daysUntil(iso) {
  const ms = new Date(iso).getTime() - Date.now()
  const days = Math.round(ms / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'today'
  if (days === 1) return 'in 1 day'
  return `in ${days} days`
}

export default function Overview() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [semester, setSemester] = useState(null)
  const [activeMemberCount, setActiveMemberCount] = useState(0)
  const [eventCount, setEventCount] = useState(0)
  const [pendingFormCount, setPendingFormCount] = useState(0)
  const [lowerThresholdCount, setLowerThresholdCount] = useState(0)
  const [flaggedMembers, setFlaggedMembers] = useState([])
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [recentMeetings, setRecentMeetings] = useState([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const activeSemester = await getActiveSemester()
        setSemester(activeSemester)
        if (!activeSemester) {
          if (!cancelled) {
            setActiveMemberCount(0)
            setEventCount(0)
            setPendingFormCount(0)
            setLowerThresholdCount(0)
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
            .eq('semester_id', activeSemester.id),
          supabase
            .from('missing_meeting_forms')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('lower_threshold_applications')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase.from('events').select('id').eq('semester_id', activeSemester.id).eq('category', 'meeting'),
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
            .eq('semester_id', activeSemester.id)
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
          setPendingFormCount(mmfCountRes.count || 0)
          setLowerThresholdCount(ltaCountRes.count || 0)
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

  const totalPendingForms = pendingFormCount + lowerThresholdCount
  const lastSyncAt = localStorage.getItem(LAST_SYNC_STORAGE_KEY)
  const syncStale = !lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > 24 * 60 * 60 * 1000

  const attentionItems = []
  if (pendingFormCount > 0) {
    attentionItems.push({
      key: 'mmf',
      title: `${pendingFormCount} missing meeting form${pendingFormCount === 1 ? '' : 's'} pending`,
      sub: 'Needs review',
      badge: 'Pending',
      to: '/eboard/forms',
    })
  }
  if (lowerThresholdCount > 0) {
    attentionItems.push({
      key: 'lta',
      title: `${lowerThresholdCount} lower threshold application${lowerThresholdCount === 1 ? '' : 's'}`,
      sub: 'Awaiting approval',
      badge: 'Review',
      to: '/eboard/forms',
    })
  }
  if (upcomingEvents[0]) {
    attentionItems.push({
      key: 'event',
      title: `${upcomingEvents[0].name} ${daysUntil(upcomingEvents[0].starts_at)}`,
      sub: formatDateTime(upcomingEvents[0].starts_at),
      badge: 'Upcoming',
      to: '/eboard/events',
    })
  }
  attentionItems.push({
    key: 'sync',
    title: lastSyncAt ? `Google Sheets last synced ${timeAgo(lastSyncAt)}` : 'Google Sheets not synced yet',
    sub: syncStale ? 'Sync now or wait for tonight\'s cron' : 'Up to date',
    badge: syncStale ? 'Stale' : 'Synced',
    to: '/eboard/sync',
  })

  return (
    <div className="eboard-main">
      <div className="page-header">
        <div>
          <h1>Overview</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="semester-pill">{semester ? semester.name : 'No active semester'}</div>
      </div>
      {error && <p className="error-text">{error}</p>}

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-label">Active brothers</div>
          <div className="value">{activeMemberCount}</div>
          <div className="label">&nbsp;</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Events scheduled</div>
          <div className="value">{eventCount}</div>
          <div className="label">This semester so far</div>
        </div>
        <div className={`stat-tile ${totalPendingForms > 0 ? 'warn' : ''}`}>
          <div className="stat-label">Pending forms</div>
          <div className="value">{totalPendingForms}</div>
          <div className="label">{totalPendingForms > 0 ? 'Needs review' : 'All caught up'}</div>
        </div>
        <div className="stat-tile muted">
          <div className="stat-label">Standing</div>
          <div className="value">&mdash;</div>
          <div className="label">Calculated end of semester</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Needs attention</h2>
          {attentionItems.map((item) => (
            <Link key={item.key} to={item.to} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="attention-row">
                <div className="attention-icon">!</div>
                <div className="attention-body">
                  <div className="attention-title">{item.title}</div>
                  <div className="attention-sub">{item.sub}</div>
                </div>
                <span className={`status-badge ${item.badge === 'Pending' ? 'unexcused' : item.badge === 'Stale' ? 'excused' : item.badge === 'Synced' ? 'active' : 'pending'}`}>
                  {item.badge}
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Upcoming events</h2>
            <Link className="row-link" to="/eboard/events">All events &rarr;</Link>
          </div>
          {upcomingEvents.length === 0 && <p className="empty-state">No upcoming events.</p>}
          {upcomingEvents.map((event) => {
            const date = new Date(event.starts_at)
            return (
              <div className="event-row" key={event.id}>
                <div className="date-block">
                  <div className="date-month">{date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</div>
                  <div className="date-day">{date.getDate()}</div>
                  <div className="date-weekday">{date.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                </div>
                <div className="event-row-body">
                  <div className="event-row-title">{event.name}</div>
                  <div className="event-row-sub">
                    {date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} &middot; {event.location || 'TBD'}
                  </div>
                </div>
                <span className={`pill ${event.category}`}>{event.category}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Meeting attendance flags</h2>
            <Link className="row-link" to="/eboard/attendance">Full log &rarr;</Link>
          </div>
          {flaggedMembers.length === 0 && <p className="empty-state">No brothers over the attendance limit.</p>}
          {flaggedMembers.map((m) => (
            <Link key={m.member_id} to={`/eboard/brothers/${m.member_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="list-row">
                <div className="avatar">{m.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
                <div className="list-row-body">
                  <div className="list-row-title">{m.name}</div>
                  <div className="list-row-sub">{m.excused} excused &middot; {m.unexcused} unexcused</div>
                </div>
                <span className={`status-badge ${m.unexcused >= 1 ? 'over-limit' : 'at-limit'}`}>
                  {m.unexcused >= 1 ? 'Over limit' : 'At limit'}
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Recent meetings</h2>
            <Link className="row-link" to="/eboard/attendance">Full log &rarr;</Link>
          </div>
          {recentMeetings.length === 0 && <p className="empty-state">No completed meetings yet.</p>}
          {recentMeetings.map((event) => (
            <div className="list-row" key={event.id}>
              <div className="list-row-body">
                <div className="list-row-title">{formatDate(event.starts_at).split(',')[0]}, {new Date(event.starts_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                <div className="list-row-sub">{event.counts.present} present &middot; {event.counts.unexcused + event.counts.excused} absent</div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {event.counts.excused > 0 && <span className="status-badge excused">{event.counts.excused} excused</span>}
                {event.counts.unexcused > 0 && <span className="status-badge unexcused">{event.counts.unexcused} unexcused</span>}
                {event.counts.excused === 0 && event.counts.unexcused === 0 && (
                  <span className="status-badge active">Full attendance</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
