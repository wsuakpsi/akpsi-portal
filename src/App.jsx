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

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(undefined)

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
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
    getMyProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
  }, [session])

  // Handle invite/reset links — must be accessible before auth resolves
  if (window.location.hash.includes('type=invite') || window.location.hash.includes('type=recovery')) {
    return (
      <>
        <ResetPassword />
        <Toaster position="top-center" toastOptions={{ duration: 3000, error: { duration: 2500 } }} />
      </>
    )
  }

  let content
  if (session === undefined || profile === undefined) {
    content = <div style={{ margin: '4rem auto', textAlign: 'center' }}>Loading...</div>
  } else if (!session || !profile) {
    content = <Login />
  } else if (profile.status === 'suspended') {
    content = <Suspended />
  } else if (PORTAL === 'brother' && (profile.role === 'brother' || profile.role === 'eboard')) {
    content = (
      <Routes>
        <Route path="/*" element={<BrotherRouter profile={profile} />} />
      </Routes>
    )
  } else if (PORTAL === 'eboard' && profile.role === 'eboard') {
    content = (
      <Routes>
        <Route path="/eboard/checkin-qr" element={<CheckInQrPage />} />
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
