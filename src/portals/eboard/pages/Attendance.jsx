import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { getActiveSemester, formatDateTime } from '../lib/queries'

const STATUSES = ['present', 'excused', 'unexcused']

function CorrectionForm({ row, onClose, onSaved }) {
  const [status, setStatus] = useState(row.status)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const { error: updateError } = await supabase
        .from('meeting_attendance')
        .update({ status })
        .eq('id', row.id)
      if (updateError) throw updateError
      toast.success('Attendance corrected.')
      onSaved()
    } catch (err) {
      toast.error(`Could not save correction: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Correct attendance</h2>
        <p className="note-text">{row.members?.full_name}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="status">Status</label>
            <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save'}
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

export default function Attendance() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [meetings, setMeetings] = useState([])
  const [selectedMeetingId, setSelectedMeetingId] = useState('')
  const [rows, setRows] = useState([])
  const [rowsLoading, setRowsLoading] = useState(false)
  const [correctionTarget, setCorrectionTarget] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const semester = await getActiveSemester()
        if (!semester) {
          setMeetings([])
          setLoading(false)
          return
        }

        const { data, error: meetingsError } = await supabase
          .from('events')
          .select('*')
          .eq('semester_id', semester.id)
          .eq('category', 'meeting')
          .order('starts_at', { ascending: false })
        if (meetingsError) throw meetingsError

        setMeetings(data || [])
        if (data && data.length > 0) setSelectedMeetingId(data[0].id)
      } catch (err) {
        setError(err.message)
        toast.error(`Could not load meetings: ${err.message}`)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  async function loadRows(meetingId) {
    setRowsLoading(true)
    try {
      const { data, error: rowsError } = await supabase
        .from('meeting_attendance')
        .select('*, members(full_name)')
        .eq('event_id', meetingId)
        .order('full_name', { ascending: true, foreignTable: 'members' })
      if (rowsError) throw rowsError
      setRows(data || [])
    } catch (err) {
      toast.error(`Could not load attendance: ${err.message}`)
    } finally {
      setRowsLoading(false)
    }
  }

  useEffect(() => {
    if (selectedMeetingId) loadRows(selectedMeetingId)
  }, [selectedMeetingId])

  if (loading) return <div className="eboard-main">Loading...</div>

  return (
    <div className="eboard-main">
      <h1>Attendance</h1>
      {error && <p className="error-text">{error}</p>}

      {meetings.length === 0 && <p className="empty-state">No meetings recorded this semester.</p>}

      {meetings.length > 0 && (
        <>
          <div className="toolbar">
            <select value={selectedMeetingId} onChange={(e) => setSelectedMeetingId(e.target.value)}>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} &middot; {formatDateTime(m.starts_at)}
                </option>
              ))}
            </select>
          </div>

          <div className="card">
            {rowsLoading && <p className="empty-state">Loading...</p>}
            {!rowsLoading && rows.length === 0 && (
              <p className="empty-state">No attendance recorded for this meeting yet.</p>
            )}
            {!rowsLoading && rows.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.members?.full_name || '-'}</td>
                      <td><span className={`status-badge ${row.status}`}>{row.status}</span></td>
                      <td>
                        <button className="btn small secondary" onClick={() => setCorrectionTarget(row)}>
                          Add correction
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {correctionTarget && (
        <CorrectionForm
          row={correctionTarget}
          onClose={() => setCorrectionTarget(null)}
          onSaved={() => {
            setCorrectionTarget(null)
            loadRows(selectedMeetingId)
          }}
        />
      )}
    </div>
  )
}
