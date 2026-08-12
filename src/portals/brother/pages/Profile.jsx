import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { signOut } from '../../../lib/auth'
import { getActiveSemester } from '../lib/queries'

function ApplicationForm({ profile, semester, onClose, onSubmitted }) {
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
        const path = `lower-threshold/${profile.id}/${semester.id}-${Date.now()}-${file.name}`
        const { error: uploadError } = await supabase.storage.from('proofs').upload(path, file)
        if (uploadError) throw uploadError
        const { data: publicUrlData } = supabase.storage.from('proofs').getPublicUrl(path)
        proofUrl = publicUrlData.publicUrl
      }

      const { error: insertError } = await supabase.from('lower_threshold_applications').insert({
        member_id: profile.id,
        semester_id: semester.id,
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
      <h2>Apply for lower threshold</h2>
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
            {submitting ? 'Submitting...' : 'Submit application'}
          </button>
          <button type="button" className="btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export default function Profile({ profile }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [semester, setSemester] = useState(null)
  const [application, setApplication] = useState(null)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const activeSemester = await getActiveSemester()
      setSemester(activeSemester)

      if (activeSemester) {
        const { data, error: appError } = await supabase
          .from('lower_threshold_applications')
          .select('*')
          .eq('member_id', profile.id)
          .eq('semester_id', activeSemester.id)
          .maybeSingle()
        if (appError) throw appError
        setApplication(data)
      } else {
        setApplication(null)
      }
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

  return (
    <div className="page">
      <h1>Profile</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <div className="list-item">
          <div className="meta">Name</div>
          <div className="title">{profile.full_name}</div>
        </div>
        <div className="list-item">
          <div className="meta">Email</div>
          <div className="title">{profile.email}</div>
        </div>
        <div className="list-item">
          <div className="meta">Pledge class</div>
          <div className="title">{profile.pledge_class}</div>
        </div>
        <div className="list-item">
          <div className="meta">Role</div>
          <div className="title">{profile.role}</div>
        </div>
        <div className="list-item">
          <div className="meta">Status</div>
          <div className="title">{profile.status}</div>
        </div>
      </div>

      <div className="card">
        <h2>Lower threshold application</h2>
        {loading && <p className="empty-state">Loading...</p>}
        {!loading && !semester && <p className="empty-state">No active semester.</p>}
        {!loading && semester && (
          <>
            {application?.status === 'approved' && (
              <span className="status-badge approved">Approved</span>
            )}
            {application?.status === 'pending' && (
              <span className="status-badge pending">Pending review</span>
            )}
            {application?.status === 'denied' && (
              <span className="status-badge denied">Denied</span>
            )}
            {!application && !showForm && (
              <button className="btn" onClick={() => setShowForm(true)}>
                Apply
              </button>
            )}
          </>
        )}
      </div>

      {showForm && semester && (
        <ApplicationForm
          profile={profile}
          semester={semester}
          onClose={() => setShowForm(false)}
          onSubmitted={() => {
            setShowForm(false)
            load()
          }}
        />
      )}

      <button className="btn secondary" onClick={() => signOut()}>
        Sign out
      </button>
    </div>
  )
}
