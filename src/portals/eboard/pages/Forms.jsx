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

  const totalPending = missingMeetingForms.length + thresholdApps.length

  return (
    <div className="eboard-main">
      <div className="page-header">
        <div>
          <h1>Forms</h1>
          <p className="page-subtitle">{totalPending} pending review</p>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}

      {missingMeetingForms.length > 0 && (
        <>
          <div className="section-label">Missing meeting forms &middot; {missingMeetingForms.length} pending</div>
          <div className="card">
            {missingMeetingForms.map((form) => {
              const isBusy = busyId === form.id
              return (
                <div className="form-card" key={form.id}>
                  <div className="form-card-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                  </div>
                  <div className="form-card-body">
                    <div className="form-card-head">
                      <div className="form-card-title">
                        {form.members?.full_name || 'Unknown'}
                        <span className="status-badge lower">Missing meeting</span>
                      </div>
                      <span className="status-badge excused">Pending</span>
                    </div>
                    <div className="form-card-meta">
                      {form.events?.name || 'Meeting'} &middot; {form.events ? formatDateTime(form.events.starts_at) : '-'}
                      {' · Submitted '}{formatDateTime(form.created_at).split(',')[0]}
                    </div>
                    <div className="form-card-reason">&ldquo;{form.reason}&rdquo;</div>
                    {form.proof_url && (
                      <div className="form-card-file">
                        <a href={form.proof_url} target="_blank" rel="noreferrer">📄 View attachment</a>
                      </div>
                    )}
                  </div>
                  <div className="form-card-actions">
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
                </div>
              )
            })}
          </div>
        </>
      )}

      {thresholdApps.length > 0 && (
        <>
          <div className="section-label">Lower threshold applications &middot; {thresholdApps.length} pending</div>
          <div className="card">
            {thresholdApps.map((app) => {
              const isBusy = busyId === app.id
              return (
                <div className="form-card lower-threshold" key={app.id}>
                  <div className="form-card-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                    </svg>
                  </div>
                  <div className="form-card-body">
                    <div className="form-card-head">
                      <div className="form-card-title">
                        {app.members?.full_name || 'Unknown'}
                        <span className="status-badge lower">Lower threshold</span>
                      </div>
                      <span className="status-badge excused">Pending</span>
                    </div>
                    <div className="form-card-meta">Submitted {formatDateTime(app.created_at).split(',')[0]}</div>
                    <div className="form-card-reason">&ldquo;{app.reason}&rdquo;</div>
                    {app.proof_url && (
                      <div className="form-card-file">
                        <a href={app.proof_url} target="_blank" rel="noreferrer">📄 View attachment</a>
                      </div>
                    )}
                  </div>
                  <div className="form-card-actions">
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
                </div>
              )
            })}
          </div>
        </>
      )}

      {totalPending === 0 && (
        <div className="card">
          <p className="empty-state">No pending forms.</p>
        </div>
      )}
    </div>
  )
}
