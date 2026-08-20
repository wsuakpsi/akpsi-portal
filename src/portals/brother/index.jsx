import { Routes, Route, Navigate } from 'react-router-dom'
import './brother.css'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import Events from './pages/Events'
import Attendance from './pages/Attendance'
import Leaderboard from './pages/Leaderboard'
import Profile from './pages/Profile'
import CheckIn from './pages/CheckIn'

export default function BrotherRouter({ profile }) {
  return (
    <div className="brother-app">
      <Routes>
        <Route path="/" element={<Navigate to="/brother" replace />} />
        <Route path="/brother" element={<Home profile={profile} />} />
        <Route path="/brother/events" element={<Events profile={profile} />} />
        <Route path="/brother/attendance" element={<Attendance profile={profile} />} />
        <Route path="/brother/leaderboard" element={<Leaderboard profile={profile} />} />
        <Route path="/brother/profile" element={<Profile profile={profile} />} />
        <Route path="/brother/checkin" element={<CheckIn profile={profile} />} />
      </Routes>
      <BottomNav />
    </div>
  )
}
