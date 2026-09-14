import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { supabase } from './lib/supabase'
import { getMyProfile, signOut } from './lib/auth'
import { isInviteUrl, isRecoveryUrl, initialAuthUrl } from './lib/authUrl'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import ResetPassword from './pages/ResetPassword'
import Join from './pages/Join'
import BrotherRouter from './portals/brother'
import EboardRouter from './portals/eboard'
import CheckInQrPage from './portals/eboard/pages/CheckInQrPage'

const PORTAL = import.meta.env.VITE_PORTAL

function AccessDenied() {
  return (
    <div style={{ maxWidth: 320, margin: '4rem auto', textAlign: 'center' }}>
      <h1>Access denied</h1>
      <p>Your account does not have access to this portal.</p>
      <button onClick={() => signOut()}>Sign out</button>
    </div>
  )
}

function Suspended() {
  return (
    <div style={{ maxWidth: 320, margin: '4rem auto', textAlign: 'center' }}>
      <h1>Account suspended</h1>
      <p>Your account is suspended. Contact E-Board for more information.</p>
      <button onClick={() => signOut()}>Sign out</button>
    </div>
  )
}

function ProfileSetupError({ error }) {
  const message =
    error?.code === 'no_pending_invite'
      ? "We couldn't find a pending invite for this account. This usually means there's a typo or capitalization mismatch in the email E-Board invited you with — ask them to double check and resend your invite."
      : error?.isPromotionFailure
      ? "Something went wrong finishing your account setup. This usually means there's a conflicting account already on file — contact E-Board so they can look into it."
      : 'Something went wrong loading your account. Try signing out and back in — if it keeps happening, contact E-Board.'

  return (
    <div style={{ maxWidth: 320, margin: '4rem auto', textAlign: 'center' }}>
      <h1>Account setup issue</h1>
      <p>{message}</p>
      <button onClick={() => signOut()}>Sign out</button>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(undefined)
  const [profileError, setProfileError] = useState(null)
  // Same fallback for password-reset links that land on "/" with a
  // token_hash-style URL (no session yet, so PASSWORD_RECOVERY never fires).
  const [isRecovery, setIsRecovery] = useState(() => isRecoveryUrl() && Boolean(initialAuthUrl.tokenHash))
  // Invite links land here via a plain SIGNED_IN event (not PASSWORD_RECOVERY,
  // which only fires for "forgot password" links). Two signals identify an
  // unfinished invite, and either is enough:
  //   - the /set-password path (where the invite's redirectTo points), or
  //   - `type=invite` in the URL payload Supabase sends back. This is what
  //     saves the flow when Supabase ignores redirectTo because the URL isn't
  //     on the project's Redirect URL allow-list and falls back to the Site
  //     URL — the brother lands on "/" signed in, and without this check
  //     they'd go straight into the portal with no password set.
  // Must be checked before the profile/portal logic below runs.
  // S3/CloudFront 301-redirects "/set-password" to "/set-password/" (adds a
  // trailing slash) before the app ever sees the URL, so strip it before comparing.
  const [isInvite, setIsInvite] = useState(
    () => window.location.pathname.replace(/\/$/, '') === '/set-password' || isInviteUrl()
  )
  const [isJoin, setIsJoin] = useState(
    () => window.location.pathname.replace(/\/$/, '') === '/join'
  )

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true)
        setSession(newSession)
        return
      }
      // Only a sign-out ends recovery mode here. INITIAL_SESSION / SIGNED_IN
      // fire during the token_hash reset flow (before the new password is
      // saved) and must not kick the brother off the reset page — the page
      // itself calls onDone when it's finished.
      if (event === 'SIGNED_OUT') setIsRecovery(false)
      setSession(newSession)
    })

    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return
    if (session === null) {
      setProfile(null)
      return
    }

    setProfile(undefined)
    setProfileError(null)
    getMyProfile()
      .then(setProfile)
      .catch((err) => {
        setProfileError(err)
        setProfile(null)
      })
  }, [session])

  function finishInvite() {
    setIsInvite(false)
    window.history.replaceState({}, '', '/')
  }

  function finishJoin() {
    setIsJoin(false)
    window.history.replaceState({}, '', '/')
  }

  let content
  if (isInvite) {
    content = <SetPassword onDone={finishInvite} />
  } else if (isJoin) {
    content = <Join onDone={finishJoin} />
  } else if (isRecovery) {
    content = <ResetPassword onDone={() => setIsRecovery(false)} />
  } else if (session === undefined || profile === undefined) {
    content = <div style={{ margin: '4rem auto', textAlign: 'center' }}>Loading...</div>
  } else if (session && !profile && profileError) {
    content = <ProfileSetupError error={profileError} />
  } else if (!session || !profile) {
    content = (
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Login />} />
      </Routes>
    )
  } else if (profile.status === 'suspended') {
    content = <Suspended />
  } else if (
    PORTAL === 'brother' &&
    (profile.role === 'brother' || profile.role === 'eboard' || profile.role === 'committee_head')
  ) {
    content = (
      <Routes>
        <Route path="/*" element={<BrotherRouter profile={profile} />} />
      </Routes>
    )
  } else if (PORTAL === 'eboard' && (profile.role === 'eboard' || profile.role === 'committee_head')) {
    content = (
      <Routes>
        {(profile.role === 'eboard' || profile.role === 'committee_head') && (
          <Route path="/eboard/checkin-qr" element={<CheckInQrPage />} />
        )}
        <Route path="/*" element={<EboardRouter profile={profile} />} />
      </Routes>
    )
  } else {
    content = <AccessDenied />
  }

  return (
    <>
      {content}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          error: { duration: 2500 },
        }}
      />
    </>
  )
}
