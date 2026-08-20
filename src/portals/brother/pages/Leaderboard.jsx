import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getActiveSemester, getLeaderboard } from '../lib/queries'
import Topbar from '../components/Topbar'

export default function Leaderboard({ profile }) {
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

  return (
    <div>
      <Topbar profile={profile}>
        <div className="topbar-title">Leaderboard</div>
      </Topbar>
      <div className="page">
        {loading && <p className="empty-state">Loading...</p>}
        {error && <p className="error-text">{error}</p>}
        {!loading && rows.length === 0 && <p className="empty-state">No points recorded yet this semester.</p>}
        {rows.map((row, i) => (
          <div className={`leaderboard-row ${row.member_id === profile.id ? 'me' : ''}`} key={row.member_id}>
            <span className="leaderboard-rank">{i + 1}</span>
            <span className="leaderboard-name">{row.full_name}</span>
            <span className="leaderboard-pts">{row.total_points} pts</span>
          </div>
        ))}
      </div>
    </div>
  )
}
