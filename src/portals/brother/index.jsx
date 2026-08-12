import { Routes, Route } from 'react-router-dom'
import './brother.css'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import Events from './pages/Events'
import Attendance from './pages/Attendance'
import Profile from './pages/Profile'

export default function BrotherRouter({ profile }) {
  return (
    <div className="brother-app">
      <Routes>
        <Route path="/brother" element={<Home profile={profile} />} />
        <Route path="/brother/events" element={<Events profile={profile} />} />
        <Route path="/brother/attendance" element={<Attendance profile={profile} />} />
        <Route path="/brother/profile" element={<Profile profile={profile} />} />
      </Routes>
      <BottomNav />
    </div>
  )
}
