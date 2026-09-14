import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { initialAuthUrl, clearAuthParamsFromUrl } from '../lib/authUrl'
import './Login.css'

function CrestIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  )
}

// Map known failure cases to plain-language copy and a concrete next step.
function describeLinkError(code) {
  switch (code) {
    case 'otp_expired':
      return {
        title: 'This link has expired',
        message:
          'Invite links only work for a limited time, and this one has passed that window.',
      }
    case 'access_denied':
      return {
        title: 'This link is invalid or already used',
        message:
          'Each invite link can only be used once. If you already set a password with it, just sign in instead.',
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

// Two ways a brother can arrive here:
//
// 1. token_hash link (recommended email template — see DEPLOY.md). The URL
//    carries `token_hash` + `type=invite` and NO session yet. We show the
//    form immediately and only exchange the token when they submit, so an
//    email client that pre-fetches links (Outlook Safe Links, Gmail image
//    proxies, corporate scanners) can't burn the one-time token before the
//    brother ever sees the page.
//
// 2. Classic Supabase redirect. Supabase has already verified the token and
//    redirected here with a session in the URL hash; supabase-js picks it
//    up and fires SIGNED_IN (not PASSWORD_RECOVERY — that's only for
//    "forgot password" links), so we wait for either event / an existing
//    session before showing the form.
export default function SetPassword({ onDone }) {
  const tokenHash = initialAuthUrl.type === 'invite' ? initialAuthUrl.tokenHash : null
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(Boolean(tokenHash))
  const [linkError, setLinkError] = useState(() =>
    initialAuthUrl.errorCode ? describeLinkError(initialAuthUrl.errorCode) : null
  )

  useEffect(() => {
    if (linkError || tokenHash) return // nothing to wait for

    let settled = false

    // Check if Supabase already processed the token before this component mounted
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settled = true
        setReady(true)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY' || event === 'INITIAL_SESSION') {
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) {
            settled = true
            setReady(true)
          }
        })
      }
    })

    // If Supabase never fires a sign-in event and never reports an error
    // either, don't leave brothers staring at "Verifying link..." forever.
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

    // token_hash flow: exchange the one-time token for a session first.
    if (tokenHash) {
      const { error: verifyError } = await supabase.auth.verifyOtp({ type: 'invite', token_hash: tokenHash })
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
          message: 'This took too long and your link session timed out. Please ask E-Board to resend your invite.',
        })
        return
      }
      setError(updateError.message)
      toast.error(updateError.message)
    } else {
      toast.success('Password saved — welcome!')
      clearAuthParamsFromUrl('/')
      if (onDone) {
        onDone()
      } else {
        window.location.href = '/'
      }
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
          {linkError ? (
            <>
              <h1 className="login-card-title">{linkError.title}</h1>
              <p className="login-card-sub">{linkError.message}</p>
              <div className="login-error" role="alert" style={{ marginBottom: '1rem' }}>
                Already set a password before? <a href="/">Sign in</a>, then use "Forgot password" to get a fresh link.
                <br />
                Never set one, or your invite still doesn't work? Ask an E-Board member to resend your invite.
              </div>
              <a href="/" className="login-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                Back to sign in
              </a>
            </>
          ) : !ready ? (
            <>
              <h1 className="login-card-title" role="status" aria-live="polite">Verifying link…</h1>
              <p className="login-card-sub">Please wait while we verify your invite link.</p>
            </>
          ) : (
            <>
              <h1 className="login-card-title">Set your password</h1>
              <p className="login-card-sub">
                Choose a password to activate your chapter account. You'll use it to sign in on any device from now on.
              </p>

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
                    autoFocus
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
                    minLength={8}
                    required
                  />
                </div>

                {error && <div className="login-error" role="alert">{error}</div>}

                <button type="submit" className="login-btn" disabled={loading}>
                  <span className="login-btn-inner">
                    {loading && <span className="login-spinner" />}
                    {loading ? 'Saving…' : 'Set password & sign in'}
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
