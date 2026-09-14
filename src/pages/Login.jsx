import { useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { initialAuthUrl } from '../lib/authUrl'
import AuthShell from '../components/AuthShell'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  // An invite/reset link that Supabase rejected (expired, already used)
  // redirects with #error=… — and if the redirect URL wasn't allow-listed it
  // lands here on "/" rather than on the set-password page. Say so instead of
  // showing a bare sign-in form.
  const [linkNotice] = useState(() => {
    if (!initialAuthUrl.errorCode) return null
    return initialAuthUrl.errorCode === 'otp_expired'
      ? 'That link has expired. If you already set a password, sign in below; otherwise use "Forgot password" or ask E-Board to resend your invite.'
      : 'That link is invalid or was already used. If you already set a password, sign in below; otherwise use "Forgot password" or ask E-Board to resend your invite.'
  })

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
      redirectTo: `${window.location.origin}/reset-password`,
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
    <AuthShell>
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
              {error && <div className="login-error" role="alert">{error}</div>}
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
          {linkNotice && <div className="login-error" role="alert" style={{ marginBottom: '1rem' }}>{linkNotice}</div>}
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
            {error && <div className="login-error" role="alert">{error}</div>}
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
    </AuthShell>
  )
}
