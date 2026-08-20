import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { signOut } from '../../../lib/auth'
import { getActiveSemester } from '../lib/queries'
import Topbar from '../components/Topbar'

// Spec 8.2: "Proof upload is mandatory — Lambda rejects submissions without
// a proof_url." The DB already enforces this (proof_url NOT NULL since
// migration 0004) but the form used to label the field "optional" and not
// require it client-side, so a brother who skipped it got a raw DB error
// instead of a validation message. Fixed here: required file input, and a
// friendly message if the DB's dedup guard (migration 0011) still catches
// a race (two tabs submitting at once).
function ApplicationForm({ profile, semester, onClose, onSubmitted }) {
  const [reason, setReason] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!file) {
      toast.error('Proof is required.')
      return
    }
    setSubmitting(true)
    try {
      const path = `lower-threshold/${profile.id}/${semester.id}-${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('proofs').upload(path, file)
      if (uploadError) throw uploadError
      const { data: publicUrlData } = supabase.storage.from('proofs').getPublicUrl(path)

      const { error: insertError } = await supabase.from('lower_threshold_applications').insert({
        member_id: profile.id,
        semester_id: semester.id,
        reason,
        proof_url: publicUrlData.publicUrl,
      })
      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error('You already have a pending or approved application for this semester.')
        }
        throw insertError
      }

      toast.success('Application submitted.')
      onSubmitted()
    } catch (err) {
      toast.error(`Could not submit application: ${err.message}`)
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
            placeholder="e.g. Working 20+ hours/week, or enrolled in 18+ credit hours"
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="proof">Proof (required)</label>
          <input id="proof" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" className="btn" disabled={submitting || !file}>
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
  const [bips, setBips] = useState([])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const activeSemester = await getActiveSemester()
      setSemester(activeSemester)

      if (activeSemester) {
        // A denied application allows resubmission (spec 8.2), so a member
        // can have more than one row for the same semester over time —
        // order + limit 1 to show the most recent rather than assuming
        // there's exactly one.
        const { data, error: appError } = await supabase
          .from('lower_threshold_applications')
          .select('*')
          .eq('member_id', profile.id)
          .eq('semester_id', activeSemester.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (appError) throw appError
        setApplication(data)
      } else {
        setApplication(null)
      }

      // BiPs persist across semesters until resolved/escalated (spec 9.4),
      // so this isn't scoped to the active semester like the LTA above.
      const { data: bipRows, error: bipError } = await supabase
        .from('brother_improvement_plans')
        .select('*')
        .eq('member_id', profile.id)
        .order('created_at', { ascending: false })
      if (bipError) throw bipError
      setBips(bipRows || [])
    } catch (err) {
      setError(err.message)
      toast.error(`Could not load profile: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  // Spec 8.1: "System blocks submission if first_semester_initiated matches
  // the active semester name." `first_semester_initiated` is nullable and,
  // as of this migration, nothing populates it yet for any member — see
  // migration 0010 — so this is inert (never blocks anyone) until E-Board
  // starts setting it per-brother.
  const isFirstSemester = Boolean(semester && profile.first_semester_initiated === semester.name)
  const canApply = !application || application.status === 'denied'

  return (
    <div>
      <Topbar profile={profile}>
        <div className="topbar-title">Profile</div>
      </Topbar>
      <div className="page">
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
              <span className="status-badge denied">Denied &mdash; you may resubmit</span>
            )}
            {isFirstSemester && (
              <p className="note-text">
                First-semester brothers aren't eligible for the lower threshold. You can apply starting next
                semester.
              </p>
            )}
            {!isFirstSemester && canApply && !showForm && (
              <button className="btn" onClick={() => setShowForm(true)}>
                {application?.status === 'denied' ? 'Resubmit' : 'Apply'}
              </button>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2>Improvement plans</h2>
        {!loading && bips.length === 0 && <p className="empty-state">No improvement plans on file.</p>}
        {bips.map((bip) => (
          <div key={bip.id} className="list-item">
            <div className="meta">
              Due {bip.due_date} &middot;{' '}
              <span className={`status-badge ${bip.status === 'open' ? 'pending' : bip.status === 'resolved' ? 'active' : 'unexcused'}`}>
                {bip.status}
              </span>
            </div>
            <div className="title">{bip.description}</div>
            <div className="meta">Requirements: {bip.requirements}</div>
            {bip.resolution_note && <div className="meta">Note: {bip.resolution_note}</div>}
          </div>
        ))}
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
    </div>
  )
}
