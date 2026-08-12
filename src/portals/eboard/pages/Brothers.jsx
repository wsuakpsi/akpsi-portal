import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { getActiveSemester } from '../lib/queries'

const ROLES = ['brother', 'eboard']
const STATUSES = ['active', 'probation', 'suspended']

function AddBrotherForm({ onClose, onAdded }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [pledgeClass, setPledgeClass] = useState('')
  const [role, setRole] = useState('brother')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const { error: insertError } = await supabase.from('members').insert({
        full_name: fullName,
        email,
        pledge_class: pledgeClass,
        role,
      })
      if (insertError) throw insertError
      onAdded()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add brother</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="full_name">Full name</label>
            <input id="full_name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="pledge_class">Pledge class</label>
            <input id="pledge_class" type="text" value={pledgeClass} onChange={(e) => setPledgeClass(e.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="role">Role</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          {error && <p className="error-text">{error}</p>}
          <p className="note-text">
            This creates the members row only. The Supabase Auth account must be created
            separately in the Supabase dashboard by VP Tech, using the same email, so it links
            to this member.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add brother'}
            </button>
            <button type="button" className="btn secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Brothers() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [members, setMembers] = useState([])
  const [thresholdByMember, setThresholdByMember] = useState({})
  const [meetingCountsByMember, setMeetingCountsByMember] = useState({})
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAddForm, setShowAddForm] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const semester = await getActiveSemester()

      const [membersRes, ltaRes] = await Promise.all([
        supabase.from('members').select('*').order('full_name', { ascending: true }),
        semester
          ? supabase
              .from('lower_threshold_applications')
              .select('member_id, status')
              .eq('semester_id', semester.id)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (membersRes.error) throw membersRes.error
      if (ltaRes.error) throw ltaRes.error

      const thresholdMap = {}
      for (const row of ltaRes.data || []) thresholdMap[row.member_id] = row.status

      let meetingMap = {}
      if (semester) {
        const { data: meetingEvents, error: meetingEventsError } = await supabase
          .from('events')
          .select('id')
          .eq('semester_id', semester.id)
          .eq('category', 'meeting')
        if (meetingEventsError) throw meetingEventsError

        const meetingIds = (meetingEvents || []).map((e) => e.id)
        if (meetingIds.length > 0) {
          const { data: attendanceRows, error: attendanceError } = await supabase
            .from('meeting_attendance')
            .select('member_id, status')
            .in('event_id', meetingIds)
          if (attendanceError) throw attendanceError

          for (const row of attendanceRows || []) {
            if (!meetingMap[row.member_id]) meetingMap[row.member_id] = { excused: 0, unexcused: 0 }
            if (row.status === 'excused') meetingMap[row.member_id].excused += 1
            if (row.status === 'unexcused') meetingMap[row.member_id].unexcused += 1
          }
        }
      }

      setMembers(membersRes.data || [])
      setThresholdByMember(thresholdMap)
      setMeetingCountsByMember(meetingMap)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = members.filter((m) => {
    if (roleFilter !== 'all' && m.role !== roleFilter) return false
    if (statusFilter !== 'all' && m.status !== statusFilter) return false
    return true
  })

  if (loading) return <div className="eboard-main">Loading...</div>

  return (
    <div className="eboard-main">
      <h1>Brothers</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="toolbar">
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="spacer" />
        <button className="btn" onClick={() => setShowAddForm(true)}>Add brother</button>
      </div>

      <div className="card">
        {filtered.length === 0 && <p className="empty-state">No brothers match these filters.</p>}
        {filtered.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Pledge class</th>
                <th>Role</th>
                <th>E-board position</th>
                <th>Status</th>
                <th>Lower threshold</th>
                <th>Meetings (ex/un)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const counts = meetingCountsByMember[m.id] || { excused: 0, unexcused: 0 }
                return (
                  <tr key={m.id}>
                    <td>
                      <Link className="row-link" to={`/eboard/brothers/${m.id}`}>{m.full_name}</Link>
                    </td>
                    <td>{m.pledge_class}</td>
                    <td>{m.role}</td>
                    <td>{m.eboard_position || '-'}</td>
                    <td><span className={`status-badge ${m.status}`}>{m.status}</span></td>
                    <td>
                      {thresholdByMember[m.id] ? (
                        <span className={`status-badge ${thresholdByMember[m.id]}`}>
                          {thresholdByMember[m.id]}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{counts.excused} / {counts.unexcused}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showAddForm && (
        <AddBrotherForm
          onClose={() => setShowAddForm(false)}
          onAdded={() => {
            setShowAddForm(false)
            load()
          }}
        />
      )}
    </div>
  )
}
