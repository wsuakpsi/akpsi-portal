import { Routes, Route, Navigate } from 'react-router-dom'
import './eboard.css'
import Sidebar from './components/Sidebar'
import Overview from './pages/Overview'
import Brothers from './pages/Brothers'
import BrotherDetail from './pages/BrotherDetail'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import Forms from './pages/Forms'
import Points from './pages/Points'
import Attendance from './pages/Attendance'
import Semesters from './pages/Semesters'
import SheetsSync from './pages/SheetsSync'

export default function EboardRouter({ profile }) {
  return (
    <div className="eboard-app">
      <Sidebar profile={profile} />
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
        <Route path="/eboard/semesters" element={<Semesters />} />
        <Route path="/eboard/sync" element={<SheetsSync />} />
      </Routes>
    </div>
  )
}
