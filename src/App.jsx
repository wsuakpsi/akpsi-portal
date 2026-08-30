import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { supabase } from './lib/supabase'
import { getMyProfile, signOut } from './lib/auth'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
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
  const [isRecovery, setIsRecovery] = useState(false)

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true)
        setSession(newSession)
        return
      }
      setIsRecovery(false)
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

  let content
  if (isRecovery) {
    content = <ResetPassword onDone={() => setIsRecovery(false)} />
  } else if (session === undefined || profile === undefined) {
    content = <div style={{ margin: '4rem auto', textAlign: 'center' }}>Loading...</div>
  } else if (session && !profile && profileError) {
    content = <ProfileSetupError error={profileError} />
  } else if (!session || !profile) {
    content = (
      <Routes>
        <Route path="/set-password" element={<ResetPassword />} />
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
        {profile.role === 'eboard' && <Route path="/eboard/checkin-qr" element={<CheckInQrPage />} />}
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
