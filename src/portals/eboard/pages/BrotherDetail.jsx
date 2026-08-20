import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { callLambda } from '../../../lib/lambdas'
import { getActiveSemester, formatDate, formatDateTime, POINT_CATEGORIES } from '../lib/queries'

const POST_ADJUSTMENT_URL = import.meta.env.VITE_POST_ADJUSTMENT_URL
const ADJUSTMENT_CATEGORIES = ['adjustment', ...POINT_CATEGORIES, 'rush', 'extra', 'meeting']
const STATUS_OPTIONS = ['active', 'probation', 'suspended', 'alumni', 'archived']

// Spec 2.4: role flip is brother <-> eboard only (pledge/alumni/archived
// aren't part of this control) and eboard_position must be set/cleared in
// the same atomic operation as the role change. The DB constraint from
// migration 0004 (members_eboard_position_matches_role) enforces that no
// matter what this UI sends, so a bug here can leave a bad row queued but
// never committed.
function RoleFlip({ member, onChanged }) {
  const [position, setPosition] = useState('')
  const [busy, setBusy] = useState(false)

  async function handlePromote(e) {
    e.preventDefault()
    if (!position.trim()) return
    const confirmed = window.confirm(
      `Promote ${member.full_name} to E-Board as "${position.trim()}"? They will be notified immediately.`
    )
    if (!confirmed) return
    setBusy(true)
    try {
      const { error: updateError } = await supabase
        .from('members')
        .update({ role: 'eboard', eboard_position: position.trim() })
        .eq('id', member.id)
      if (updateError) throw updateError
      const { error: notifError } = await supabase.from('notifications').insert({
        member_id: member.id,
        title: 'Role updated',
        body: `You've been promoted to E-Board as ${position.trim()}.`,
      })
      if (notifError) throw notifError
      setPosition('')
      toast.success(`${member.full_name} promoted to E-Board.`)
      onChanged()
    } catch (err) {
      toast.error(`Could not promote ${member.full_name}: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleDemote() {
    const confirmed = window.confirm(
      `Demote ${member.full_name} from E-Board back to brother? This clears their E-Board position and they will be notified immediately.`
    )
    if (!confirmed) return
    setBusy(true)
    try {
      const { error: updateError } = await supabase
        .from('members')
        .update({ role: 'brother', eboard_position: null })
        .eq('id', member.id)
      if (updateError) throw updateError
      const { error: notifError } = await supabase.from('notifications').insert({
        member_id: member.id,
        title: 'Role updated',
        body: "You've been moved back to brother status.",
      })
      if (notifError) throw notifError
      toast.success(`${member.full_name} demoted to brother.`)
      onChanged()
    } catch (err) {
      toast.error(`Could not demote ${member.full_name}: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  if (member.role !== 'brother' && member.role !== 'eboard') {
    return <p className="note-text">Role flip only applies to brother/E-Board members ({member.role}).</p>
  }

  return (
    <div>
      {member.role === 'brother' && (
        <form onSubmit={handlePromote}>
          <div className="form-field">
            <label htmlFor="eboard-position">E-Board position</label>
            <input
              id="eboard-position"
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="e.g. VP Membership"
              required
            />
          </div>
          <button type="submit" className="btn" disabled={busy || !position.trim()}>
            {busy ? 'Promoting...' : 'Promote to E-Board'}
          </button>
        </form>
      )}
      {member.role === 'eboard' && (
        <button type="button" className="btn danger" disabled={busy} onClick={handleDemote}>
          {busy ? 'Demoting...' : 'Demote to brother'}
        </button>
      )}
    </div>
  )
}

function StatusChange({ member, onChanged }) {
  const [status, setStatus] = useState(member.status)
  const [busy, setBusy] = useState(false)

  async function handleSave() {
    if (status === member.status) return
    setBusy(true)
    try {
      const { error: updateError } = await supabase.from('members').update({ status }).eq('id', member.id)
      if (updateError) throw updateError
      toast.success(`${member.full_name}'s status set to ${status}.`)
      onChanged()
    } catch (err) {
      toast.error(`Could not update status: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="form-field">
        <label htmlFor="status">Status</label>
        <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <button type="button" className="btn" disabled={busy || status === member.status} onClick={handleSave}>
        {busy ? 'Saving...' : 'Save status'}
      </button>
    </div>
  )
}

// Spec 2.1/8.1: gates the lower-threshold-application block on Profile.jsx
// — a brother is ineligible for a semester whose name exactly matches this
// field. Free text (spec's own example: "Fall 2024"), matched against
// `semesters.name`, so it needs to be typed consistently with however
// semesters get named.
function FirstSemesterField({ member, onChanged }) {
  const [value, setValue] = useState(member.first_semester_initiated || '')
  const [busy, setBusy] = useState(false)

  async function handleSave() {
    const next = value.trim() || null
    if (next === (member.first_semester_initiated || null)) return
    setBusy(true)
    try {
      const { error: updateError } = await supabase
        .from('members')
        .update({ first_semester_initiated: next })
        .eq('id', member.id)
      if (updateError) throw updateError
      toast.success('First semester initiated saved.')
      onChanged()
    } catch (err) {
      toast.error(`Could not save first semester: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="form-field">
        <label htmlFor="first-semester">First semester initiated</label>
        <input
          id="first-semester"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Fall 2024"
        />
      </div>
      <button
        type="button"
        className="btn"
        disabled={busy || value.trim() === (member.first_semester_initiated || '')}
        onClick={handleSave}
      >
        {busy ? 'Saving...' : 'Save'}
      </button>
    </div>
  )
}

function ManualAdjustmentForm({ member, semester, onAdjusted }) {
  const [delta, setDelta] = useState('')
  const [category, setCategory] = useState('adjustment')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const deltaNumber = Number.parseInt(delta, 10)
    if (!Number.isInteger(deltaNumber) || !note.trim()) return
    setBusy(true)
    try {
      await callLambda(POST_ADJUSTMENT_URL, {
        memberId: member.id,
        semesterId: semester.id,
        delta: deltaNumber,
        category,
        note: note.trim(),
      })
      setDelta('')
      setCategory('adjustment')
      setNote('')
      toast.success(`Posted ${deltaNumber > 0 ? '+' : ''}${deltaNumber} ${category} points for ${member.full_name}.`)
      onAdjusted()
    } catch (err) {
      toast.error(`Could not post adjustment: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  if (!semester) return <p className="empty-state">No active semester configured.</p>

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="delta">Points delta</label>
        <input
          id="delta"
          type="number"
          step="1"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          placeholder="e.g. 10 or -10"
          required
        />
      </div>
      <div className="form-field">
        <label htmlFor="adjustment-category">Category</label>
        <select id="adjustment-category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {ADJUSTMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p className="note-text">
          Only points tagged with a specific category (e.g. fundraising) count toward that category's standing
          threshold. Use "adjustment" for miscellaneous corrections that shouldn't count toward any category.
        </p>
      </div>
      <div className="form-field">
        <label htmlFor="adjustment-note">Note (required)</label>
        <textarea id="adjustment-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} required />
      </div>
      <button type="submit" className="btn" disabled={busy || delta === '' || !note.trim()}>
        {busy ? 'Posting...' : 'Post adjustment'}
      </button>
    </form>
  )
}

// Spec 9: resolving OR escalating a BiP both require a note in this schema
// — the table's check constraint is `status = 'open' or resolution_note is
// not null`, which covers escalated as well as resolved even though the
// spec prose only calls out resolution_note for the resolved case. Building
// the UI around the literal constraint (not just the prose) avoids a insert
// that the DB would reject.
function BipActions({ bip, onChanged }) {
  const [acting, setActing] = useState(null) // null | 'resolved' | 'escalated'
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  if (bip.status !== 'open') return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!note.trim()) return
    setBusy(true)
    try {
      const { error: updateError } = await supabase
        .from('brother_improvement_plans')
        .update({ status: acting, resolution_note: note.trim() })
        .eq('id', bip.id)
      if (updateError) throw updateError
      const { error: notifError } = await supabase.from('notifications').insert({
        member_id: bip.member_id,
        title: acting === 'resolved' ? 'Improvement plan resolved' : 'Improvement plan escalated',
        body: note.trim(),
      })
      if (notifError) throw notifError
      toast.success(`Improvement plan ${acting}.`)
      setActing(null)
      setNote('')
      onChanged()
    } catch (err) {
      toast.error(`Could not ${acting === 'resolved' ? 'resolve' : 'escalate'} improvement plan: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  if (!acting) {
    return (
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button type="button" className="btn small" onClick={() => setActing('resolved')}>
          Mark resolved
        </button>
        <button type="button" className="btn small danger" onClick={() => setActing('escalated')}>
          Escalate
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor={`bip-note-${bip.id}`}>
          {acting === 'resolved' ? 'Resolution note (required)' : 'Escalation note (required)'}
        </label>
        <textarea id={`bip-note-${bip.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} required />
      </div>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button type="submit" className="btn small" disabled={busy || !note.trim()}>
          {busy ? 'Saving...' : `Confirm ${acting}`}
        </button>
        <button type="button" className="btn small secondary" disabled={busy} onClick={() => setActing(null)}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function CreateBipForm({ member, createdBy, onClose, onCreated }) {
  const [description, setDescription] = useState('')
  const [requirements, setRequirements] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!description.trim() || !requirements.trim() || !dueDate) return
    setBusy(true)
    try {
      const { error: insertError } = await supabase.from('brother_improvement_plans').insert({
        member_id: member.id,
        created_by: createdBy,
        description: description.trim(),
        requirements: requirements.trim(),
        due_date: dueDate,
      })
      if (insertError) throw insertError
      const { error: notifError } = await supabase.from('notifications').insert({
        member_id: member.id,
        title: 'Improvement plan opened',
        body: `An improvement plan was opened for you, due ${dueDate}. Requirements: ${requirements.trim()}`,
      })
      if (notifError) throw notifError
      toast.success('Improvement plan created.')
      onCreated()
    } catch (err) {
      toast.error(`Could not create improvement plan: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="bip-description">Description</label>
        <textarea id="bip-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} required />
      </div>
      <div className="form-field">
        <label htmlFor="bip-requirements">Requirements</label>
        <textarea id="bip-requirements" value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={2} required />
      </div>
      <div className="form-field">
        <label htmlFor="bip-due-date">Due date</label>
        <input id="bip-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" className="btn" disabled={busy || !description.trim() || !requirements.trim() || !dueDate}>
          {busy ? 'Creating...' : 'Create improvement plan'}
        </button>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function BrotherDetail({ profile }) {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [member, setMember] = useState(null)
  const [semester, setSemester] = useState(null)
  const [ledgerRows, setLedgerRows] = useState([])
  const [meetingRows, setMeetingRows] = useState([])
  const [bipRows, setBipRows] = useState([])
  const [showBipForm, setShowBipForm] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const activeSemester = await getActiveSemester()

      const [memberRes, ledgerRes, meetingRes, bipRes] = await Promise.all([
        supabase.from('members').select('*').eq('id', id).single(),
        activeSemester
          ? supabase
              .from('points_ledger')
              .select('*, events(name)')
              .eq('member_id', id)
              .eq('semester_id', activeSemester.id)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('meeting_attendance')
          .select('*, events(name, starts_at, semester_id)')
          .eq('member_id', id),
        // BiPs persist across semesters until resolved/escalated (spec 9.4)
        // — not scoped to the active semester like points/meeting attendance.
        supabase
          .from('brother_improvement_plans')
          .select('*')
          .eq('member_id', id)
          .order('created_at', { ascending: false }),
      ])

      if (memberRes.error) throw memberRes.error
      if (ledgerRes.error) throw ledgerRes.error
      if (meetingRes.error) throw meetingRes.error
      if (bipRes.error) throw bipRes.error

      const filteredMeetings = (meetingRes.data || [])
        .filter((row) => row.events && (!activeSemester || row.events.semester_id === activeSemester.id))
        .sort((a, b) => new Date(b.events.starts_at) - new Date(a.events.starts_at))

      setSemester(activeSemester)
      setMember(memberRes.data)
      setLedgerRows(ledgerRes.data || [])
      setMeetingRows(filteredMeetings)
      setBipRows(bipRes.data || [])
    } catch (err) {
      setError(err.message)
      toast.error(`Could not load brother details: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <h2>Role</h2>
          <RoleFlip member={member} onChanged={load} />
        </div>

        <div className="card">
          <h2>Status</h2>
          <StatusChange member={member} onChanged={load} />
        </div>

        <div className="card">
          <h2>Lower threshold eligibility</h2>
          <FirstSemesterField member={member} onChanged={load} />
        </div>
      </div>

      <div className="card">
        <h2>Manual point adjustment</h2>
        <ManualAdjustmentForm member={member} semester={semester} onAdjusted={load} />
      </div>

      <div className="card">
        <h2>Brother Improvement Plans</h2>
        {bipRows.length === 0 && <p className="empty-state">No improvement plans on file.</p>}
        {bipRows.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Requirements</th>
                <th>Due</th>
                <th>Status</th>
                <th>Resolution note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bipRows.map((bip) => (
                <tr key={bip.id}>
                  <td>{bip.description}</td>
                  <td>{bip.requirements}</td>
                  <td>{bip.due_date}</td>
                  <td><span className={`status-badge ${bip.status === 'open' ? 'pending' : bip.status === 'resolved' ? 'active' : 'unexcused'}`}>{bip.status}</span></td>
                  <td>{bip.resolution_note || '-'}</td>
                  <td><BipActions bip={bip} onChanged={load} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!showBipForm && (
          <button type="button" className="btn" style={{ marginTop: '0.75rem' }} onClick={() => setShowBipForm(true)}>
            New improvement plan
          </button>
        )}
        {showBipForm && (
          <div style={{ marginTop: '0.75rem' }}>
            <CreateBipForm
              member={member}
              createdBy={profile.id}
              onClose={() => setShowBipForm(false)}
              onCreated={() => {
                setShowBipForm(false)
                load()
              }}
            />
          </div>
        )}
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
