import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { initialAuthUrl, clearAuthParamsFromUrl } from '../lib/authUrl'
import AuthShell from '../components/AuthShell'

// Map known failure cases to plain-language copy and a concrete next step.
function describeLinkError(code) {
  switch (code) {
    case 'otp_expired':
      return {
        title: 'This link has expired',
        message:
          'Reset links only work for a limited time, and this one has passed that window.',
      }
    case 'access_denied':
      return {
        title: 'This link is invalid or already used',
        message:
          'Each reset link can only be used once. If you already reset your password with it, just sign in instead.',
      }
    case 'timeout':
      return {
        title: "We couldn't verify this link",
        message:
          "It's taking longer than expected to verify. This usually means the link is broken or was already used.",
      }
    default:
      return {
        title: "We couldn't verify this link",
        message:
          'The link looks malformed or is no longer valid. Try opening it again directly from the original email.',
      }
  }
}

export default function ResetPassword({ onDone }) {
  // token_hash-style link (see DEPLOY.md email template note): no session
  // yet, we exchange the token on submit so link pre-fetchers can't burn it.
  const tokenHash = initialAuthUrl.type === 'recovery' ? initialAuthUrl.tokenHash : null
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(Boolean(tokenHash))
  // Read from the snapshot taken before supabase-js stripped the hash
  // (see authUrl.js) — reading window.location here would already be empty.
  const [linkError, setLinkError] = useState(() =>
    initialAuthUrl.errorCode ? describeLinkError(initialAuthUrl.errorCode) : null
  )

  useEffect(() => {
    if (linkError || tokenHash) return // URL already told us this link is bad, or nothing to wait for

    let settled = false

    // Check if Supabase already processed the token before this component mounted
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settled = true
        setReady(true)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        settled = true
        setReady(true)
      }
    })

    // If Supabase never fires a recovery/sign-in event and never reports an
    // error either, don't leave brothers staring at "Verifying link..." forever.
    const timeout = setTimeout(() => {
      if (!settled) setLinkError(describeLinkError('timeout'))
    }, 10000)

    return () => {
      listener.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [linkError, tokenHash])

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
    if (tokenHash) {
      const { error: verifyError } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
      if (verifyError) {
        setLoading(false)
        const code = verifyError.code || (/expired/i.test(verifyError.message) ? 'otp_expired' : 'access_denied')
        setLinkError(describeLinkError(code))
        return
      }
    }
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      // A session that expired mid-form looks like any other update error to
      // Supabase, but brothers need a different instruction for it: restart
      // from the link rather than retry the form.
      if (/session/i.test(updateError.message)) {
        setLinkError({
          title: 'Your session expired',
          message: 'This took too long and your link session timed out. Please request a new link and try again.',
        })
        return
      }
      setError(updateError.message)
      toast.error(updateError.message)
    } else {
      toast.success('Password saved!')
      clearAuthParamsFromUrl('/')
      if (onDone) {
        onDone()
      } else {
        window.location.href = '/'
      }
    }
  }

  return (
    <AuthShell>
      {linkError ? (
        <>
          <h1 className="login-card-title">{linkError.title}</h1>
          <p className="login-card-sub">{linkError.message}</p>
          <div className="login-error" style={{ marginBottom: '1rem' }}>
            Already reset your password with this link? <a href="/">Sign in</a> with it.
            <br />
            Still can't get in? Use "Forgot password" from the sign-in page to request a fresh link.
          </div>
          <a href="/" className="login-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Back to sign in
          </a>
        </>
      ) : !ready ? (
        <>
          <h1 className="login-card-title" role="status" aria-live="polite">Verifying link…</h1>
          <p className="login-card-sub">Please wait while we verify your reset link.</p>
        </>
      ) : (
        <>
          <h1 className="login-card-title">Reset your password</h1>
          <p className="login-card-sub">Enter a new password to regain access to your account.</p>

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
                minLength={8}
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

            {error && <div className="login-error" role="alert">{error}</div>}

            <button type="submit" className="login-btn" disabled={loading}>
              <span className="login-btn-inner">
                {loading && <span className="login-spinner" />}
                {loading ? 'Saving…' : 'Set password'}
              </span>
            </button>
          </form>
        </>
      )}
    </AuthShell>
  )
}
