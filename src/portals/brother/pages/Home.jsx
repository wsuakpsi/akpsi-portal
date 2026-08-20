import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { getActiveSemester, formatDateTime, formatDate } from '../lib/queries'

const POINT_CATEGORIES = ['professional', 'service', 'fundraising', 'social']

export default function Home({ profile }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pointTotals, setPointTotals] = useState({})
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [recentAttendance, setRecentAttendance] = useState([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const semester = await getActiveSemester()
        if (!semester) {
          if (!cancelled) {
            setPointTotals({})
            setUpcomingEvents([])
            setRecentAttendance([])
            setLoading(false)
          }
          return
        }

        const [ledgerRes, eventsRes, attendanceRes] = await Promise.all([
          supabase
            .from('points_ledger')
            .select('category, delta')
            .eq('member_id', profile.id)
            .eq('semester_id', semester.id),
          supabase
            .from('events')
            .select('*')
            .eq('semester_id', semester.id)
            .eq('status', 'scheduled')
            .gt('starts_at', new Date().toISOString())
            .order('starts_at', { ascending: true })
            .limit(5),
          supabase
            .from('meeting_attendance')
            .select('*, events(*)')
            .eq('member_id', profile.id),
        ])

        if (ledgerRes.error) throw ledgerRes.error
        if (eventsRes.error) throw eventsRes.error
        if (attendanceRes.error) throw attendanceRes.error

        const totals = {}
        for (const cat of POINT_CATEGORIES) totals[cat] = 0
        for (const row of ledgerRes.data) {
          if (POINT_CATEGORIES.includes(row.category)) {
            totals[row.category] += row.delta
          }
        }

        const recentMeetings = (attendanceRes.data || [])
          .filter((row) => row.events)
          .sort((a, b) => new Date(b.events.starts_at) - new Date(a.events.starts_at))
          .slice(0, 3)

        if (!cancelled) {
          setPointTotals(totals)
          setUpcomingEvents(eventsRes.data || [])
          setRecentAttendance(recentMeetings)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          toast.error(`Could not load home page: ${err.message}`)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [profile.id])

  if (loading) return <div className="page">Loading...</div>

  return (
    <div className="page">
      <h1>Hi, {profile.full_name.split(' ')[0]}</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <h2>Points this semester</h2>
        <div className="points-grid">
          {POINT_CATEGORIES.map((cat) => (
            <div className="points-tile" key={cat}>
              <div className="value">{pointTotals[cat] ?? 0}</div>
              <div className="label">{cat}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Upcoming events</h2>
        {upcomingEvents.length === 0 && <p className="empty-state">No upcoming events.</p>}
        {upcomingEvents.map((event) => (
          <div className="list-item" key={event.id}>
            <div className="title">{event.name}</div>
            <div className="meta">
              <span className={`pill ${event.category}`}>{event.category}</span>{' '}
              {formatDateTime(event.starts_at)} &middot; {event.points_value} pts
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Recent meeting attendance</h2>
        {recentAttendance.length === 0 && <p className="empty-state">No meeting attendance yet.</p>}
        {recentAttendance.map((row) => (
          <div className="list-item" key={row.id}>
            <div className="title">{formatDate(row.events.starts_at)}</div>
            <div className="meta">
              <span className={`status-badge ${row.status}`}>{row.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
