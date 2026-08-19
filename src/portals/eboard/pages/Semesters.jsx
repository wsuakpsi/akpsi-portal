import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { callLambda } from '../../../lib/lambdas'
import { formatDate } from '../lib/queries'

const CREATE_SEMESTER_URL = import.meta.env.VITE_CREATE_SEMESTER_URL

function CreateSemesterForm({ onCreated }) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(confirm) {
    setBusy(true)
    setError(null)
    try {
      const result = await callLambda(CREATE_SEMESTER_URL, { name, startDate, endDate, confirm })
      setName('')
      setStartDate('')
      setEndDate('')
      onCreated(result.semester)
    } catch (err) {
      if (err.message === 'active_semester_has_scheduled_events') {
        // callLambda only surfaces the error string, not the rest of the
        // Lambda's response body — a generic re-prompt still satisfies
        // spec 10.1's "X events are still scheduled. Are you sure?" warning
        // without needing the exact count here.
        const confirmed = window.confirm(
          'The current active semester still has scheduled events. Creating a new semester will make it the ' +
            'active one — those events will remain but the semester they belong to will no longer be active. ' +
            'Continue?'
        )
        if (confirmed) {
          setBusy(false)
          await submit(true)
          return
        }
      } else {
        setError(err.message)
      }
    } finally {
      setBusy(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || !startDate || !endDate) return
    submit(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="error-text">{error}</p>}
      <div className="form-field">
        <label htmlFor="semester-name">Name</label>
        <input id="semester-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring 2027" required />
      </div>
      <div className="form-field">
        <label htmlFor="semester-start">Start date</label>
        <input id="semester-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
      </div>
      <div className="form-field">
        <label htmlFor="semester-end">End date</label>
        <input id="semester-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
      </div>
      <button type="submit" className="btn" disabled={busy || !name.trim() || !startDate || !endDate}>
        {busy ? 'Creating...' : 'Create & activate semester'}
      </button>
    </form>
  )
}

export default function Semesters() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [semesters, setSemesters] = useState([])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('semesters')
        .select('*')
        .order('start_date', { ascending: false })
      if (fetchError) throw fetchError
      setSemesters(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) return <div className="eboard-main">Loading...</div>

  return (
    <div className="eboard-main">
      <h1>Semesters</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <h2>Create new semester</h2>
        <p className="note-text">
          Activating a new semester makes it the one all new events/points/attendance are scoped to. The previous
          active semester is automatically deactivated — member records, role, status, and BiPs all carry over
          unchanged; lower threshold applications and missing meeting forms do not (fresh slate each semester, per
          spec).
        </p>
        <CreateSemesterForm onCreated={load} />
      </div>

      <div className="card">
        <h2>History</h2>
        {semesters.length === 0 && <p className="empty-state">No semesters yet.</p>}
        {semesters.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Start</th>
                <th>End</th>
                <th>Active</th>
                <th>Standing calculated</th>
              </tr>
            </thead>
            <tbody>
              {semesters.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.start_date}</td>
                  <td>{s.end_date}</td>
                  <td>{s.is_active ? <span className="status-badge active">active</span> : '-'}</td>
                  <td>{s.calculated_at ? formatDate(s.calculated_at) : 'not yet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
