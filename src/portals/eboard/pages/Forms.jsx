import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { callLambda } from '../../../lib/lambdas'
import { formatDateTime } from '../lib/queries'

const REVIEW_FORM_URL = import.meta.env.VITE_REVIEW_FORM_URL

export default function Forms({ profile }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [missingMeetingForms, setMissingMeetingForms] = useState([])
  const [thresholdApps, setThresholdApps] = useState([])
  const [busyId, setBusyId] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [mmfRes, ltaRes] = await Promise.all([
        supabase
          .from('missing_meeting_forms')
          .select('*, members!member_id(full_name), events(name, starts_at)')
          .eq('status', 'pending')
          .order('created_at', { ascending: true }),
        supabase
          .from('lower_threshold_applications')
          .select('*, members!member_id(full_name)')
          .eq('status', 'pending')
          .order('created_at', { ascending: true }),
      ])
      if (mmfRes.error) throw mmfRes.error
      if (ltaRes.error) throw ltaRes.error

      setMissingMeetingForms(mmfRes.data || [])
      setThresholdApps(ltaRes.data || [])
    } catch (err) {
      setError(err.message)
      toast.error(`Could not load forms: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleMissingMeetingReview(form, decision) {
    setBusyId(form.id)
    try {
      await callLambda(REVIEW_FORM_URL, { formId: form.id, decision })
      toast.success(`Missing meeting form ${decision}.`)
      await load()
    } catch (err) {
      toast.error(`Could not review form: ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  async function handleThresholdReview(app, status) {
    setBusyId(app.id)
    try {
      const { error: updateError } = await supabase
        .from('lower_threshold_applications')
        .update({ status, reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
        .eq('id', app.id)
      if (updateError) throw updateError

      const { error: notifError } = await supabase.from('notifications').insert({
        member_id: app.member_id,
        title: 'Lower threshold application reviewed',
        body: `Your lower threshold application has been ${status}.`,
      })
      if (notifError) throw notifError

      toast.success(`Application ${status}.`)
      await load()
    } catch (err) {
      toast.error(`Could not review application: ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="eboard-main">Loading...</div>

  return (
    <div className="eboard-main">
      <h1>Forms</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <h2>Missing meeting forms</h2>
        {missingMeetingForms.length === 0 && <p className="empty-state">No pending missing meeting forms.</p>}
        {missingMeetingForms.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Brother</th>
                <th>Meeting</th>
                <th>Date</th>
                <th>Reason</th>
                <th>Proof</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {missingMeetingForms.map((form) => {
                const isBusy = busyId === form.id
                return (
                  <tr key={form.id}>
                    <td>{form.members?.full_name || '-'}</td>
                    <td>{form.events?.name || '-'}</td>
                    <td>{form.events ? formatDateTime(form.events.starts_at) : '-'}</td>
                    <td>{form.reason}</td>
                    <td>
                      {form.proof_url ? (
                        <a href={form.proof_url} target="_blank" rel="noreferrer">View</a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          className="btn small"
                          disabled={isBusy}
                          onClick={() => handleMissingMeetingReview(form, 'approved')}
                        >
                          Approve
                        </button>
                        <button
                          className="btn small danger"
                          disabled={isBusy}
                          onClick={() => handleMissingMeetingReview(form, 'denied')}
                        >
                          Deny
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Lower threshold applications</h2>
        {thresholdApps.length === 0 && <p className="empty-state">No pending lower threshold applications.</p>}
        {thresholdApps.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Brother</th>
                <th>Reason</th>
                <th>Proof</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {thresholdApps.map((app) => {
                const isBusy = busyId === app.id
                return (
                  <tr key={app.id}>
                    <td>{app.members?.full_name || '-'}</td>
                    <td>{app.reason}</td>
                    <td>
                      {app.proof_url ? (
                        <a href={app.proof_url} target="_blank" rel="noreferrer">View</a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          className="btn small"
                          disabled={isBusy}
                          onClick={() => handleThresholdReview(app, 'approved')}
                        >
                          Approve
                        </button>
                        <button
                          className="btn small danger"
                          disabled={isBusy}
                          onClick={() => handleThresholdReview(app, 'denied')}
                        >
                          Deny
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
