import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { callLambda } from '../../../lib/lambdas'
import { getActiveSemester } from '../lib/queries'

const INVITE_BROTHER_URL = import.meta.env.VITE_INVITE_BROTHER_URL
const BROTHER_PORTAL_URL = import.meta.env.VITE_BROTHER_PORTAL_URL || window.location.origin
const JOIN_LINK = `${BROTHER_PORTAL_URL}/join`

const ROLES = ['brother', 'eboard', 'committee_head']
const STATUSES = ['active', 'probation', 'suspended']

function InviteBrotherForm({ onClose, onAdded }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [pledgeClass, setPledgeClass] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await callLambda(INVITE_BROTHER_URL, { email, fullName, pledgeClass })
      toast.success(`Invite sent to ${fullName}.`)
      onAdded()
    } catch (err) {
      toast.error(`Could not invite brother: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Invite brother</h2>
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
          <p className="note-text">
            Creates their profile and sends an invite email. They'll set their own password when they click the link.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? 'Sending invite...' : 'Send invite'}
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

function PendingInvites({ invites, onResend, resendingEmail }) {
  if (invites.length === 0) return null

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>Pending invites</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Pledge class</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {invites.map((inv) => (
            <tr key={inv.email}>
              <td>{inv.full_name}</td>
              <td>{inv.email}</td>
              <td>{inv.pledge_class}</td>
              <td>
                <button
                  className="btn small secondary"
                  disabled={resendingEmail === inv.email}
                  onClick={() => onResend(inv)}
                >
                  {resendingEmail === inv.email ? 'Resending...' : 'Resend invite'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const [search, setSearch] = useState('')
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [pendingInvites, setPendingInvites] = useState([])
  const [resendingEmail, setResendingEmail] = useState(null)

  async function handleResend(invite) {
    setResendingEmail(invite.email)
    try {
      await callLambda(INVITE_BROTHER_URL, {
        email: invite.email,
        fullName: invite.full_name,
        pledgeClass: invite.pledge_class,
        resend: true,
      })
      toast.success(`Invite resent to ${invite.full_name}.`)
    } catch (err) {
      toast.error(`Could not resend invite: ${err.message}`)
    } finally {
      setResendingEmail(null)
    }
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const semester = await getActiveSemester()

      const [membersRes, ltaRes, pendingRes] = await Promise.all([
        supabase.from('members').select('*').order('full_name', { ascending: true }),
        semester
          ? supabase
              .from('lower_threshold_applications')
              .select('member_id, status')
              .eq('semester_id', semester.id)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('pending_invites').select('email, full_name, pledge_class').order('full_name', { ascending: true }),
      ])

      if (membersRes.error) throw membersRes.error
      if (ltaRes.error) throw ltaRes.error
      if (pendingRes.error) throw pendingRes.error

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
      setPendingInvites(pendingRes.data || [])
    } catch (err) {
      setError(err.message)
      toast.error(`Could not load brothers: ${err.message}`)
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
    const query = search.trim().toLowerCase()
    if (query && !m.full_name.toLowerCase().includes(query) && !(m.pledge_class || '').toLowerCase().includes(query)) {
      return false
    }
    return true
  })

  function handleExport() {
    const header = ['Full name', 'Pledge class', 'Role', 'Position', 'Status', 'Lower threshold', 'Excused', 'Unexcused']
    const rows = filtered.map((m) => {
      const counts = meetingCountsByMember[m.id] || { excused: 0, unexcused: 0 }
      return [
        m.full_name,
        m.pledge_class,
        m.role,
        m.eboard_position || '',
        m.status,
        thresholdByMember[m.id] === 'approved' ? 'lower' : 'standard',
        counts.excused,
        counts.unexcused,
      ]
    })
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'brothers.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="eboard-main">Loading...</div>

  const lowerCount = members.filter((m) => thresholdByMember[m.id] === 'approved').length
  const suspendedCount = members.filter((m) => m.status === 'suspended').length

  return (
    <div className="eboard-main">
      <div className="page-header">
        <div>
          <h1>Brothers</h1>
          <p className="page-subtitle">
            {members.length} active members &middot; {lowerCount} on lower threshold &middot; {suspendedCount} suspended
          </p>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}

      <PendingInvites invites={pendingInvites} onResend={handleResend} resendingEmail={resendingEmail} />

      <div className="toolbar">
        <input
          type="text"
          placeholder="Search by name or pledge class"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: '220px' }}
        />
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
        <button className="btn secondary" onClick={handleExport}>Export</button>
        <button
          className="btn secondary"
          onClick={() => {
            navigator.clipboard.writeText(JOIN_LINK)
            toast.success('Join link copied — send it to the group.')
          }}
        >
          Copy join link
        </button>
        <button className="btn" onClick={() => setShowInviteForm(true)}>+ Invite brother</button>
      </div>

      <div className="card">
        {filtered.length === 0 && <p className="empty-state">No brothers match these filters.</p>}
        {filtered.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Position</th>
                <th>Status</th>
                <th>Threshold</th>
                <th>Absences</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const counts = meetingCountsByMember[m.id] || { excused: 0, unexcused: 0 }
                const flagged = counts.excused >= 2 || counts.unexcused >= 1
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="member-cell">
                        <div className="avatar">{m.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
                        <div>
                          <div className="member-name">{m.full_name}</div>
                          <div className="member-sub">{m.pledge_class}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`pill ${
                          m.role === 'eboard'
                            ? 'role-eboard'
                            : m.role === 'committee_head'
                            ? 'role-committee-head'
                            : 'role-brother'
                        }`}
                      >
                        {m.role === 'eboard' ? 'E-Board' : m.role === 'committee_head' ? 'Committee Head' : 'Brother'}
                      </span>
                    </td>
                    <td>{m.eboard_position || '—'}</td>
                    <td><span className={`status-badge ${m.status}`}>{m.status}</span></td>
                    <td>
                      {thresholdByMember[m.id] === 'approved' ? (
                        <span className="status-badge lower">Lower</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={flagged ? 'count-flag' : ''}>
                      {counts.excused} exc &middot; {counts.unexcused} unexc
                    </td>
                    <td>
                      <Link className="btn small secondary" to={`/eboard/brothers/${m.id}`}>View</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showInviteForm && (
        <InviteBrotherForm
          onClose={() => setShowInviteForm(false)}
          onAdded={() => {
            setShowInviteForm(false)
            load()
          }}
        />
      )}
    </div>
  )
}
