import { Routes, Route } from 'react-router-dom'
import { signOut } from '../../lib/auth'

function Dashboard({ profile }) {
  return (
    <div style={{ maxWidth: 480, margin: '2rem auto' }}>
      <h1>Brother Portal</h1>
      <p>Welcome, {profile.full_name}.</p>
      <button onClick={() => signOut()}>Sign out</button>
    </div>
  )
}

export default function BrotherRouter({ profile }) {
  return (
    <Routes>
      <Route path="/" element={<Dashboard profile={profile} />} />
    </Routes>
  )
}
