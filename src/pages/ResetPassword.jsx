import { useState, useEffect } from 'react'
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

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Check if Supabase already processed the token before this component mounted
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      toast.error(updateError.message)
    } else {
      setDone(true)
      toast.success('Password set! You can now sign in.')
    }
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
          {done ? (
            <>
              <h1 className="login-card-title">You're all set</h1>
              <p className="login-card-sub">Your password has been saved. Go ahead and sign in.</p>
              <a href="/" className="login-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: '0.5rem' }}>
                Go to sign in
              </a>
            </>
          ) : !ready ? (
            <>
              <h1 className="login-card-title">Verifying link…</h1>
              <p className="login-card-sub">Please wait while we verify your invite link.</p>
            </>
          ) : (
            <>
              <h1 className="login-card-title">Set your password</h1>
              <p className="login-card-sub">Choose a password to activate your chapter account.</p>

              <form onSubmit={handleSubmit} noValidate>
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
                    {loading ? 'Saving…' : 'Set password'}
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
