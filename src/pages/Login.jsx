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

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError(signInError.message)
      toast.error(signInError.message)
    }

    setLoading(false)
  }

  async function handleForgot(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/set-password`,
    })

    setLoading(false)

    if (resetError) {
      setError(resetError.message)
      toast.error(resetError.message)
    } else {
      setResetSent(true)
    }
  }

  return (
    <div className="login-root">
      {/* Desktop brand panel */}
      <aside className="login-brand">
        <div className="login-brand-crest">
          <CrestIcon />
        </div>
        <div className="login-brand-name">AKΨ</div>
        <div className="login-brand-full">Alpha Kappa Psi</div>
        <div className="login-brand-divider" />
        <p className="login-brand-tagline">
          Developing principled business leaders — one brother at a time.
        </p>
      </aside>

      {/* Form panel */}
      <main className="login-form-panel">
        {/* Mobile-only header */}
        <div className="login-mobile-header">
          <div className="login-mobile-crest">
            <CrestIcon />
          </div>
          <div className="login-mobile-name">AKΨ Portal</div>
          <div className="login-mobile-full">Alpha Kappa Psi</div>
        </div>

        <div className="login-card">
          {forgotMode ? (
            resetSent ? (
              <>
                <h1 className="login-card-title">Check your email</h1>
                <p className="login-card-sub">We sent a password reset link to <strong>{email}</strong>. Check your spam folder if you don't see it.</p>
                <button type="button" className="login-btn" onClick={() => { setForgotMode(false); setResetSent(false) }}>
                  Back to sign in
                </button>
              </>
            ) : (
              <>
                <h1 className="login-card-title">Reset password</h1>
                <p className="login-card-sub">Enter your email and we'll send you a reset link.</p>
                <form onSubmit={handleForgot} noValidate>
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
                  {error && <div className="login-error">{error}</div>}
                  <button type="submit" className="login-btn" disabled={loading}>
                    <span className="login-btn-inner">
                      {loading && <span className="login-spinner" />}
                      {loading ? 'Sending…' : 'Send reset link'}
                    </span>
                  </button>
                </form>
                <button type="button" className="login-forgot" onClick={() => { setForgotMode(false); setError(null) }}>
                  Back to sign in
                </button>
              </>
            )
          ) : (
            <>
              <h1 className="login-card-title">Sign in</h1>
              <p className="login-card-sub">Use your chapter account to continue.</p>
              <form onSubmit={handleSubmit} noValidate>
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
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                </div>
                {error && <div className="login-error">{error}</div>}
                <button type="submit" className="login-btn" disabled={loading}>
                  <span className="login-btn-inner">
                    {loading && <span className="login-spinner" />}
                    {loading ? 'Signing in…' : 'Sign in'}
                  </span>
                </button>
              </form>
              <button type="button" className="login-forgot" onClick={() => { setForgotMode(true); setError(null) }}>
                Forgot password?
              </button>
            </>
          )}
        </div>

        <p className="login-footer">Alpha Kappa Psi · Chapter Portal</p>
      </main>
    </div>
  )
}
