import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { formatDateTime } from '../lib/queries'

function ExcuseForm({ event, onClose, onSubmitted }) {
  const [reason, setReason] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      let proofUrl = null
      if (file) {
        const path = `missing-meeting/${event.member_id}/${event.event_id}-${Date.now()}-${file.name}`
        const { error: uploadError } = await supabase.storage.from('proofs').upload(path, file)
        if (uploadError) throw uploadError
        const { data: publicUrlData } = supabase.storage.from('proofs').getPublicUrl(path)
        proofUrl = publicUrlData.publicUrl
      }

      const { error: insertError } = await supabase.from('missing_meeting_forms').insert({
        member_id: event.member_id,
        event_id: event.event_id,
        reason,
        proof_url: proofUrl,
      })
      if (insertError) throw insertError

      onSubmitted()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card">
      <h2>Submit excuse form</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="reason">Reason</label>
          <textarea
            id="reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="proof">Proof (optional)</label>
          <input id="proof" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
          <button type="button" className="btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export default function Attendance({ profile }) {
  const [tab, setTab] = useState('events')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [eventAttendance, setEventAttendance] = useState([])
  const [meetingAttendance, setMeetingAttendance] = useState([])
  const [formsByEvent, setFormsByEvent] = useState({})
  const [excuseTarget, setExcuseTarget] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [attendanceRes, meetingRes, formsRes] = await Promise.all([
        supabase
          .from('attendance')
          .select('*, events(*)')
          .eq('member_id', profile.id),
        supabase
          .from('meeting_attendance')
          .select('*, events(*)')
          .eq('member_id', profile.id),
        supabase
          .from('missing_meeting_forms')
          .select('event_id')
          .eq('member_id', profile.id),
      ])

      if (attendanceRes.error) throw attendanceRes.error
      if (meetingRes.error) throw meetingRes.error
      if (formsRes.error) throw formsRes.error

      const sortByStartsDesc = (rows) =>
        [...rows]
          .filter((r) => r.events)
          .sort((a, b) => new Date(b.events.starts_at) - new Date(a.events.starts_at))

      const formMap = {}
      for (const f of formsRes.data) formMap[f.event_id] = true

      setEventAttendance(sortByStartsDesc(attendanceRes.data))
      setMeetingAttendance(sortByStartsDesc(meetingRes.data))
      setFormsByEvent(formMap)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  if (loading) return <div className="page">Loading...</div>

  return (
    <div className="page">
      <h1>Attendance</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="tabs">
        <button
          className={`tab ${tab === 'events' ? 'active' : ''}`}
          onClick={() => {
            setTab('events')
            setExcuseTarget(null)
          }}
        >
          Events
        </button>
        <button
          className={`tab ${tab === 'meetings' ? 'active' : ''}`}
          onClick={() => {
            setTab('meetings')
            setExcuseTarget(null)
          }}
        >
          Meetings
        </button>
      </div>

      {tab === 'events' && (
        <div className="card">
          {eventAttendance.length === 0 && <p className="empty-state">No attendance records yet.</p>}
          {eventAttendance.map((row) => (
            <div className="list-item" key={row.id}>
              <div className="title">{row.events.name}</div>
              <div className="meta">{formatDateTime(row.events.starts_at)}</div>
              <div style={{ marginTop: '0.35rem' }}>
                <span className="status-badge attended">Attended</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'meetings' && (
        <div className="card">
          {meetingAttendance.length === 0 && <p className="empty-state">No meeting records yet.</p>}
          {meetingAttendance.map((row) => (
            <div className="list-item" key={row.id}>
              <div className="title">{row.events.name}</div>
              <div className="meta">{formatDateTime(row.events.starts_at)}</div>
              <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className={`status-badge ${row.status}`}>{row.status}</span>
                {row.status === 'unexcused' && !formsByEvent[row.event_id] && (
                  <button
                    className="btn secondary"
                    onClick={() =>
                      setExcuseTarget({ event_id: row.event_id, member_id: profile.id })
                    }
                  >
                    Submit excuse form
                  </button>
                )}
                {row.status === 'unexcused' && formsByEvent[row.event_id] && (
                  <span className="status-badge pending">Excuse submitted</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {excuseTarget && (
        <ExcuseForm
          event={excuseTarget}
          onClose={() => setExcuseTarget(null)}
          onSubmitted={() => {
            setExcuseTarget(null)
            load()
          }}
        />
      )}
    </div>
  )
}
