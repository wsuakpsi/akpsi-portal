import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { getActiveSemester, formatDateTime, formatDate } from '../lib/queries'
import Topbar from '../components/Topbar'

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

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div>
      <Topbar profile={profile}>
        <div className="home-greeting">{greeting},</div>
        <div className="home-name">{profile.full_name}</div>
      </Topbar>

      <div className="page">
        {error && <p className="error-text">{error}</p>}

        <div className="standing-card">
          <div className="standing-row">
            <span className="standing-label">Points this semester</span>
          </div>
          {POINT_CATEGORIES.map((cat) => (
            <div className="progress-row" key={cat}>
              <span className="progress-cat">{cat[0].toUpperCase() + cat.slice(1)}</span>
              <span className="progress-pts">{pointTotals[cat] ?? 0} pts</span>
            </div>
          ))}
        </div>

        <div className="section-head">Upcoming events</div>
        {upcomingEvents.length === 0 && <p className="empty-state">No upcoming events.</p>}
        {upcomingEvents.map((event) => (
          <div className="event-card" key={event.id}>
            <div className="event-left">
              <span className={`event-type-pill pill-${event.category}`}>{event.category}</span>
              <div className="event-name">{event.name}</div>
              <div className="event-date">{formatDateTime(event.starts_at)}</div>
            </div>
            <div className="event-pts">+{event.points_value} pts</div>
          </div>
        ))}

        <div className="section-head">Recent attendance</div>
        {recentAttendance.length === 0 && <p className="empty-state">No meeting attendance yet.</p>}
        {recentAttendance.map((row) => (
          <div className="attend-card" key={row.id}>
            <div className="attend-row">
              <div>
                <div className="attend-label">{row.events.name || 'Chapter meeting'}</div>
                <div className="attend-sub">{formatDateTime(row.events.starts_at)}</div>
              </div>
              <span className={`badge-${row.status === 'present' ? 'present' : 'absent'}`}>{row.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
