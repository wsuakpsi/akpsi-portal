import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { initials } from '../../../lib/queries'
import { getActiveSemester, getLeaderboard } from '../lib/queries'
import Topbar from '../components/Topbar'
import { BrotherPageSkeleton } from '../../../components/Skeleton'

function roleLabel(role) {
  if (role === 'eboard') return 'E-Board'
  if (role === 'committee_head') return 'Committee Head'
  return 'Brother'
}

function MemberAvatar({ member, size }) {
  const cls = size === 'lg' ? 'avatar lg' : 'avatar'
  if (member.avatar_url) {
    return (
      <img
        src={member.avatar_url}
        alt=""
        className={cls}
        style={{ objectFit: 'cover' }}
      />
    )
  }
  return <div className={cls}>{initials(member.full_name)}</div>
}

function RosterList({ profile }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [members, setMembers] = useState([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data, error: queryError } = await supabase
          .from('members')
          .select('id, full_name, pledge_class, role, status, avatar_url')
          .in('status', ['active', 'probation'])
          .order('full_name', { ascending: true })
        if (queryError) throw queryError
        if (!cancelled) setMembers(data || [])
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          toast.error(`Could not load roster: ${err.message}`)
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

  if (loading) return <BrotherPageSkeleton variant="list" />
  if (error) return <p className="error-text" role="alert">{error}</p>
  if (members.length === 0) return <p className="empty-state">No brothers found.</p>

  return (
    <>
      {members.map((member) => (
        <Link className="roster-row" to={`/brother/roster/${member.id}`} key={member.id}>
          <MemberAvatar member={member} />
          <div className="roster-row-body">
            <div className="roster-row-name">
              {member.full_name}
              {member.id === profile.id && <span className="roster-row-you"> (You)</span>}
            </div>
            <div className="roster-row-sub">{member.pledge_class} &middot; {roleLabel(member.role)}</div>
          </div>
        </Link>
      ))}
    </>
  )
}

function LeaderboardList({ profile }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const semester = await getActiveSemester()
        const data = semester ? await getLeaderboard(semester.id) : []
        if (!cancelled) setRows(data)
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          toast.error(`Could not load leaderboard: ${err.message}`)
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

  if (loading) return <BrotherPageSkeleton variant="list" />
  if (error) return <p className="error-text" role="alert">{error}</p>
  if (rows.length === 0) return <p className="empty-state">No points recorded yet this semester.</p>

  return (
    <>
      {rows.map((row, i) => (
        <div className={`leaderboard-row ${row.member_id === profile.id ? 'me' : ''}`} key={row.member_id}>
          <span className="leaderboard-rank">{i + 1}</span>
          <span className="leaderboard-name">{row.full_name}</span>
          <span className="leaderboard-pts">{row.total_points} pts</span>
        </div>
      ))}
    </>
  )
}

export default function Roster({ profile }) {
  const [tab, setTab] = useState('roster')

  return (
    <div>
      <Topbar profile={profile}>
        <div className="topbar-title">Roster</div>
      </Topbar>
      <div className="page">
        <div className="tabs" role="tablist" aria-label="Roster view">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'roster'}
            className={`tab ${tab === 'roster' ? 'active' : ''}`}
            onClick={() => setTab('roster')}
          >
            Roster
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'leaderboard'}
            className={`tab ${tab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setTab('leaderboard')}
          >
            Leaderboard
          </button>
        </div>

        {tab === 'roster' && <RosterList profile={profile} />}
        {tab === 'leaderboard' && <LeaderboardList profile={profile} />}
      </div>
    </div>
  )
}
