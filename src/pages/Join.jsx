import { useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import './Login.css'

function CrestIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  )
}

// Self-serve join link — brothers create their own account instead of
// waiting on an E-Board-sent invite email (which goes through Supabase's
// rate-limited default mailer). Requires "Confirm email" to be OFF in
// Supabase Auth settings, or signUp() below won't return a session and the
// pending_invites insert (which needs an authenticated JWT) will fail.
export default function Join({ onDone }) {
  const [fullName, setFullName] = useState('')
  const [pledgeClass, setPledgeClass] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!fullName.trim() || !pledgeClass.trim()) {
      setError('Full name and pledge class are required.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    })

    if (signUpError) {
      setLoading(false)
      setError(signUpError.message)
      toast.error(signUpError.message)
      return
    }

    if (!data.session) {
      // Email confirmation is still required on the project — we can't
      // finish setup without a session, so send them to confirm first.
      setLoading(false)
      setCheckEmail(true)
      return
    }

    // Supabase Auth lowercases the stored email — use the session's copy so
    // this matches for the RLS check and for getMyProfile()'s later lookup.
    const sessionEmail = data.session.user.email

    const { error: insertError } = await supabase.from('pending_invites').insert({
      email: sessionEmail,
      full_name: fullName.trim(),
      pledge_class: pledgeClass.trim(),
    })

    setLoading(false)

    if (insertError) {
      if (insertError.code === '23505') {
        setError("You've already joined. Try signing in instead.")
      } else {
        setError(insertError.message)
        toast.error(insertError.message)
      }
      return
    }

    toast.success('Welcome to the chapter!')
    if (onDone) onDone()
  }

  return (
    <div className="login-root">
      <aside className="login-brand">
        <div className="login-brand-crest"><CrestIcon /></div>
        <div className="login-brand-name">AKΨ</div>
        <div className="login-brand-full">Alpha Kappa Psi</div>
        <div className="login-brand-divider" />
        <p className="login-brand-tagline">
          Developing principled business leaders — one brother at a time.
        </p>
      </aside>

      <main className="login-form-panel">
        <div className="login-mobile-header">
          <div className="login-mobile-crest"><CrestIcon /></div>
          <div className="login-mobile-name">AKΨ Portal</div>
          <div className="login-mobile-full">Alpha Kappa Psi</div>
        </div>

        <div className="login-card">
          {checkEmail ? (
            <>
              <h1 className="login-card-title">Check your email</h1>
              <p className="login-card-sub">
                We sent a confirmation link to <strong>{email}</strong>. Click it, then come back and sign in.
              </p>
              <a href="/" className="login-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                Back to sign in
              </a>
            </>
          ) : (
            <>
              <h1 className="login-card-title">Join the chapter</h1>
              <p className="login-card-sub">Create your account to get into the portal.</p>

              <form onSubmit={handleSubmit} noValidate>
                <div className="login-field">
                  <label htmlFor="fullName">Full name</label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Brother"
                    autoComplete="name"
                    required
                  />
                </div>

                <div className="login-field">
                  <label htmlFor="pledgeClass">Pledge class</label>
                  <input
                    id="pledgeClass"
                    type="text"
                    value={pledgeClass}
                    onChange={(e) => setPledgeClass(e.target.value)}
                    placeholder="e.g. Sigma"
                    required
                  />
                </div>

                <div className="login-field">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    autoComplete="email"
                    autoCapitalize="none"
                    required
                  />
                </div>

                <div className="login-field">
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div className="login-field">
                  <label htmlFor="confirm">Confirm password</label>
                  <input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    required
                  />
                </div>

                {error && <div className="login-error">{error}</div>}

                <button type="submit" className="login-btn" disabled={loading}>
                  <span className="login-btn-inner">
                    {loading && <span className="login-spinner" />}
                    {loading ? 'Creating account…' : 'Join'}
                  </span>
                </button>
              </form>
            </>
          )}
        </div>

        <p className="login-footer">Alpha Kappa Psi · Chapter Portal</p>
      </main>
    </div>
  )
}
