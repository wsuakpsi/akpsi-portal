import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import './eboard.css'
import Sidebar from './components/Sidebar'
import { getSidebarBadgeCounts } from './lib/queries'
import Overview from './pages/Overview'
import Brothers from './pages/Brothers'
import BrotherDetail from './pages/BrotherDetail'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import Forms from './pages/Forms'
import Points from './pages/Points'
import Attendance from './pages/Attendance'
import Discipline from './pages/Discipline'
import Semesters from './pages/Semesters'
import SheetsSync from './pages/SheetsSync'

export default function EboardRouter({ profile }) {
  const [badges, setBadges] = useState({})

  useEffect(() => {
    let cancelled = false
    getSidebarBadgeCounts()
      .then((counts) => {
        if (!cancelled) setBadges(counts)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="eboard-app">
      <Sidebar profile={profile} badges={badges} />
      <Routes>
        <Route path="/" element={<Navigate to="/eboard" replace />} />
        <Route path="/eboard" element={<Overview />} />
        <Route path="/eboard/brothers" element={<Brothers />} />
        <Route path="/eboard/brothers/:id" element={<BrotherDetail profile={profile} />} />
        <Route path="/eboard/events" element={<Events />} />
        <Route path="/eboard/events/:id" element={<EventDetail />} />
        <Route path="/eboard/forms" element={<Forms profile={profile} />} />
        <Route path="/eboard/points" element={<Points />} />
        <Route path="/eboard/attendance" element={<Attendance />} />
        <Route path="/eboard/discipline" element={<Discipline />} />
        <Route path="/eboard/semesters" element={<Semesters />} />
        <Route path="/eboard/sync" element={<SheetsSync />} />
      </Routes>
    </div>
  )
}
