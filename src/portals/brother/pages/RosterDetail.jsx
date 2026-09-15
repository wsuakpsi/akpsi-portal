import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { initials } from '../../../lib/queries'
import Topbar from '../components/Topbar'
import { BrotherPageSkeleton } from '../../../components/Skeleton'

function roleLabel(role) {
  if (role === 'eboard') return 'E-Board'
  if (role === 'committee_head') return 'Committee Head'
  return 'Brother'
}

export default function RosterDetail({ profile }) {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [member, setMember] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data, error: queryError } = await supabase
          .from('members')
          .select('id, full_name, pledge_class, role, eboard_position, status, email, phone_number, resume_url, avatar_url')
          .eq('id', id)
          .single()
        if (queryError) throw queryError
        if (!cancelled) setMember(data)
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          toast.error(`Could not load brother: ${err.message}`)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <div>
      <Topbar profile={profile}>
        <div className="topbar-title">Brother</div>
      </Topbar>
      <div className="page">
        <Link to="/brother/roster" className="back-link">&larr; Back to roster</Link>

        {loading && <BrotherPageSkeleton variant="list" />}
        {error && <p className="error-text" role="alert">{error}</p>}

        {!loading && member && (
          <div className="card">
            {member.avatar_url ? (
              <img
                src={member.avatar_url}
                alt=""
                className="avatar lg"
                style={{ objectFit: 'cover', marginBottom: '0.75rem' }}
              />
            ) : (
              <div className="avatar lg" style={{ marginBottom: '0.75rem' }}>{initials(member.full_name)}</div>
            )}
            <h2 style={{ fontSize: '1.15rem' }}>{member.full_name}</h2>
            <div style={{ display: 'flex', gap: '0.4rem', margin: '0.5rem 0 1rem' }}>
              <span className={`status-badge ${member.status}`}>{member.status}</span>
              <span className="pill">{roleLabel(member.role)}</span>
            </div>
            <table className="roster-detail-table">
              <tbody>
                <tr><th>Pledge class</th><td>{member.pledge_class}</td></tr>
                {member.eboard_position && <tr><th>Position</th><td>{member.eboard_position}</td></tr>}
                <tr><th>Email</th><td>{member.email}</td></tr>
                <tr><th>Phone</th><td>{member.phone_number || '—'}</td></tr>
                <tr>
                  <th>Resume</th>
                  <td>
                    {member.resume_url ? (
                      <a href={member.resume_url} target="_blank" rel="noreferrer">View resume</a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
