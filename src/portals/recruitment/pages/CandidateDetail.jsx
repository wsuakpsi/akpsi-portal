import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { initials } from '../../../lib/queries'
import {
  getApplication,
  getVotes,
  getComments,
  getDecision,
  getSignedFileUrl,
  castVote,
  retractVote,
  addComment,
  deleteComment,
  setDecision,
  subscribeToApplication,
} from '../../../lib/applications'

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatSubmitted(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
    </svg>
  )
}

function Answer({ label, value, full }) {
  return (
    <div className={full ? 'detail-answer-full' : undefined}>
      <div className="detail-answer-label">{label}</div>
      <div className="detail-answer-value">{value || '—'}</div>
    </div>
  )
}

function YesNo({ value, flagYes }) {
  if (!value) return 'No'
  return flagYes ? <span className="flag-yes">Yes</span> : 'Yes'
}

export default function CandidateDetail({ profile }) {
  const isEboard = profile.role === 'eboard'
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [application, setApplication] = useState(null)
  const [decision, setDecisionState] = useState('pending')
  const [votes, setVotes] = useState([])
  const [comments, setComments] = useState([])
  const [files, setFiles] = useState({})
  const [commentText, setCommentText] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadVotes() {
    try {
      setVotes(await getVotes(id))
    } catch (err) {
      toast.error(`Could not load votes: ${err.message}`)
    }
  }

  async function loadComments() {
    try {
      setComments(await getComments(id))
    } catch (err) {
      toast.error(`Could not load comments: ${err.message}`)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [app, voteRows, commentRows, decisionValue] = await Promise.all([
          getApplication(id),
          getVotes(id),
          getComments(id),
          // RLS hides this from non-E-Board entirely (see 0028) — comes back
          // 'pending' for them regardless of the real decision.
          isEboard ? getDecision(id) : Promise.resolve('pending'),
        ])
        if (cancelled) return
        setApplication(app)
        setVotes(voteRows)
        setComments(commentRows)
        setDecisionState(decisionValue)

        const [resumeUrl, coverLetterUrl, headshotUrl] = await Promise.all([
          getSignedFileUrl(app.resume_path),
          getSignedFileUrl(app.cover_letter_path),
          getSignedFileUrl(app.headshot_path),
        ])
        if (!cancelled) setFiles({ resume: resumeUrl, coverLetter: coverLetterUrl, headshot: headshotUrl })
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          toast.error(`Could not load candidate: ${err.message}`)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const unsubscribe = subscribeToApplication(id, { onVote: loadVotes, onComment: loadComments })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [id])

  const myVote = votes.find((v) => v.member_id === profile.id)?.vote || null
  const tally = votes.reduce(
    (acc, v) => ({ ...acc, [v.vote]: acc[v.vote] + 1 }),
    { yes: 0, no: 0, maybe: 0 },
  )

  async function handleVote(vote) {
    setBusy(true)
    try {
      if (myVote === vote) {
        await retractVote(id, profile.id)
      } else {
        await castVote(id, profile.id, vote)
      }
      await loadVotes()
    } catch (err) {
      toast.error(`Could not save vote: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleAddComment(e) {
    e.preventDefault()
    if (!commentText.trim()) return
    setBusy(true)
    try {
      await addComment(id, profile.id, commentText)
      setCommentText('')
      await loadComments()
    } catch (err) {
      toast.error(`Could not post comment: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteComment(commentId) {
    try {
      await deleteComment(commentId)
      await loadComments()
    } catch (err) {
      toast.error(`Could not delete comment: ${err.message}`)
    }
  }

  async function handleDecision(newDecision) {
    setBusy(true)
    try {
      await setDecision(id, newDecision, profile.id)
      setDecisionState(newDecision)
      toast.success(newDecision === 'pending' ? 'Decision cleared.' : `Marked ${newDecision}.`)
    } catch (err) {
      toast.error(`Could not update decision: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="empty-state">Loading…</p>
  if (error) return <p className="error-text" role="alert">{error}</p>
  if (!application) return null

  const votersByValue = { yes: [], no: [], maybe: [] }
  for (const v of votes) votersByValue[v.vote].push(v.members?.full_name || 'Unknown')

  return (
    <div>
      <Link to="/recruitment" className="back-link">
        <span aria-hidden="true">&larr;</span> All candidates
      </Link>

      <div className="detail-layout">
        <aside className="detail-side">
          <div className="card">
            {files.headshot ? (
              <img className="detail-avatar" src={files.headshot} alt="" />
            ) : (
              <div className="detail-avatar-fallback">{initials(application.full_name)}</div>
            )}
            <h1 className="detail-name">
              {application.full_name}
              {isEboard && decision !== 'pending' && (
                <span className={`status-badge ${decision}`}>{decision}</span>
              )}
            </h1>
            <div className="detail-sub">
              {application.pronouns}
              <br />
              {application.standing} · {application.graduation_year}
              <br />
              Submitted {formatSubmitted(application.created_at)}
            </div>
            <div className="detail-docs">
              <a className="detail-doc" href={files.resume} target="_blank" rel="noreferrer">
                <DocIcon /> Resume <span>PDF</span>
              </a>
              <a className="detail-doc" href={files.coverLetter} target="_blank" rel="noreferrer">
                <DocIcon /> Cover letter <span>PDF</span>
              </a>
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">Your vote</h2>
            {isEboard && (
              <div className="vote-tallies">
                <div className="vote-tally yes"><span className="vote-tally-count">{tally.yes}</span><span className="vote-tally-label">Yes</span></div>
                <div className="vote-tally no"><span className="vote-tally-count">{tally.no}</span><span className="vote-tally-label">No</span></div>
                <div className="vote-tally maybe"><span className="vote-tally-count">{tally.maybe}</span><span className="vote-tally-label">Maybe</span></div>
              </div>
            )}
            <div className="vote-segment" role="group" aria-label="Cast your vote">
              <button className={`vote-btn yes ${myVote === 'yes' ? 'active' : ''}`} disabled={busy} onClick={() => handleVote('yes')} aria-pressed={myVote === 'yes'}>Yes</button>
              <button className={`vote-btn no ${myVote === 'no' ? 'active' : ''}`} disabled={busy} onClick={() => handleVote('no')} aria-pressed={myVote === 'no'}>No</button>
              <button className={`vote-btn maybe ${myVote === 'maybe' ? 'active' : ''}`} disabled={busy} onClick={() => handleVote('maybe')} aria-pressed={myVote === 'maybe'}>Maybe</button>
            </div>
            <p className="vote-help">
              {myVote ? 'Select again to clear your vote.' : 'Votes can be changed at any time.'}
              {!isEboard && ' Tallies are visible to E-Board only.'}
            </p>
            {isEboard && votes.length > 0 && (
              <div className="vote-voters">
                {votersByValue.yes.length > 0 && <div><strong>Yes</strong>{votersByValue.yes.join(', ')}</div>}
                {votersByValue.no.length > 0 && <div><strong>No</strong>{votersByValue.no.join(', ')}</div>}
                {votersByValue.maybe.length > 0 && <div><strong>Maybe</strong>{votersByValue.maybe.join(', ')}</div>}
              </div>
            )}
          </div>

          {isEboard && (
            <div className="card">
              <h2 className="card-title">Decision</h2>
              <div className="decision-group">
                {['accepted', 'rejected', 'waitlisted'].map((d) => (
                  <button
                    key={d}
                    className={`decision-btn ${d} ${decision === d ? 'active' : ''}`}
                    disabled={busy}
                    onClick={() => handleDecision(d)}
                    aria-pressed={decision === d}
                  >
                    {d === 'accepted' ? 'Accept' : d === 'rejected' ? 'Reject' : 'Waitlist'}
                  </button>
                ))}
              </div>
              {decision !== 'pending' && (
                <button className="decision-reset" disabled={busy} onClick={() => handleDecision('pending')}>
                  Clear decision
                </button>
              )}
            </div>
          )}
        </aside>

        <div>
          <div className="card">
            <h2 className="card-title">Application</h2>
            <div className="detail-answers">
              <Answer label="Access ID" value={application.access_id} />
              <Answer label="GPA" value={application.gpa} />
              <Answer label="Wayne State email" value={application.wayne_state_email} />
              <Answer label="Alternate email" value={application.alternate_email} />
              <Answer label="Major(s)" value={application.majors} />
              <Answer label="Minor(s)" value={application.minors} />
              <Answer label="Transferred universities" value={<YesNo value={application.ever_transferred} />} />
              <Answer label="Plans to transfer" value={application.plans_to_transfer} />
              {application.transfer_from_details && (
                <Answer label="Transfer history" value={application.transfer_from_details} full />
              )}
              {application.transfer_to_details && (
                <Answer label="Transfer plans" value={application.transfer_to_details} full />
              )}
              <Answer label="Title IX violation" value={<YesNo value={application.title_ix_violation} flagYes />} />
              <Answer label="Felony conviction" value={<YesNo value={application.felony_conviction} flagYes />} />
              <Answer label="Classes after 8 PM" value={(application.late_class_days || []).join(', ')} />
              <Answer label="How they heard about AKPsi" value={application.how_heard} full />
              {application.additional_comments && (
                <Answer label="Comments, questions, or concerns" value={application.additional_comments} full />
              )}
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">Discussion</h2>
            {comments.length === 0 && (
              <p className="empty-state" style={{ padding: '1rem 0' }}>
                {isEboard ? 'No notes yet.' : 'No notes from E-Board yet.'}
              </p>
            )}
            <div className="comment-list">
              {comments.map((c) => (
                <div className="comment-item" key={c.id}>
                  <div className="comment-avatar">{initials(c.members?.full_name)}</div>
                  <div className="comment-content">
                    <div className="comment-head">
                      <span>
                        <span className="comment-author">{c.members?.full_name || 'Unknown'}</span>{' '}
                        <span className="comment-time">{timeAgo(c.created_at)}</span>
                      </span>
                      {c.member_id === profile.id && (
                        <button className="comment-delete" onClick={() => handleDeleteComment(c.id)}>Delete</button>
                      )}
                    </div>
                    <div className="comment-body">{c.body}</div>
                  </div>
                </div>
              ))}
            </div>
            {isEboard && (
              <form className="comment-form" onSubmit={handleAddComment}>
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a note for deliberation"
                  aria-label="New comment"
                />
                <div className="comment-form-actions">
                  <button type="submit" className="btn" disabled={busy || !commentText.trim()}>Post comment</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
