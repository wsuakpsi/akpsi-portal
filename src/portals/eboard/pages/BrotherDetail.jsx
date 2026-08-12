import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { getActiveSemester, formatDate, formatDateTime } from '../lib/queries'

export default function BrotherDetail() {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [member, setMember] = useState(null)
  const [ledgerRows, setLedgerRows] = useState([])
  const [meetingRows, setMeetingRows] = useState([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const semester = await getActiveSemester()

        const [memberRes, ledgerRes, meetingRes] = await Promise.all([
          supabase.from('members').select('*').eq('id', id).single(),
          semester
            ? supabase
                .from('points_ledger')
                .select('*, events(name)')
                .eq('member_id', id)
                .eq('semester_id', semester.id)
                .order('created_at', { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from('meeting_attendance')
            .select('*, events(name, starts_at, semester_id)')
            .eq('member_id', id),
        ])

        if (memberRes.error) throw memberRes.error
        if (ledgerRes.error) throw ledgerRes.error
        if (meetingRes.error) throw meetingRes.error

        const filteredMeetings = (meetingRes.data || [])
          .filter((row) => row.events && (!semester || row.events.semester_id === semester.id))
          .sort((a, b) => new Date(b.events.starts_at) - new Date(a.events.starts_at))

        if (!cancelled) {
          setMember(memberRes.data)
          setLedgerRows(ledgerRes.data || [])
          setMeetingRows(filteredMeetings)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) return <div className="eboard-main">Loading...</div>
  if (error) return <div className="eboard-main"><p className="error-text">{error}</p></div>
  if (!member) return <div className="eboard-main">Brother not found.</div>

  return (
    <div className="eboard-main">
      <Link className="back-link" to="/eboard/brothers">&larr; Back to brothers</Link>
      <h1>{member.full_name}</h1>

      <div className="card">
        <h2>Profile</h2>
        <table>
          <tbody>
            <tr><th>Email</th><td>{member.email}</td></tr>
            <tr><th>Pledge class</th><td>{member.pledge_class}</td></tr>
            <tr><th>Role</th><td>{member.role}</td></tr>
            <tr><th>E-board position</th><td>{member.eboard_position || '-'}</td></tr>
            <tr><th>Status</th><td><span className={`status-badge ${member.status}`}>{member.status}</span></td></tr>
          </tbody>
        </table>
      </div>

      <div className="section-row">
        <div className="card">
          <h2>Points ledger (active semester)</h2>
          {ledgerRows.length === 0 && <p className="empty-state">No points recorded this semester.</p>}
          {ledgerRows.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Delta</th>
                  <th>Event</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((row) => (
                  <tr key={row.id}>
                    <td><span className={`pill ${row.category}`}>{row.category}</span></td>
                    <td>{row.delta}</td>
                    <td>{row.events?.name || row.note || '-'}</td>
                    <td>{formatDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Meeting attendance (active semester)</h2>
          {meetingRows.length === 0 && <p className="empty-state">No meeting attendance this semester.</p>}
          {meetingRows.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Meeting</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {meetingRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.events.name}</td>
                    <td>{formatDateTime(row.events.starts_at)}</td>
                    <td><span className={`status-badge ${row.status}`}>{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
