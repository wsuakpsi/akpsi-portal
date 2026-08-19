import { NavLink } from 'react-router-dom'
import { signOut } from '../../../lib/auth'

const links = [
  { to: '/eboard', label: 'Overview', end: true },
  { to: '/eboard/brothers', label: 'Brothers' },
  { to: '/eboard/events', label: 'Events' },
  { to: '/eboard/forms', label: 'Forms' },
  { to: '/eboard/points', label: 'Points' },
  { to: '/eboard/attendance', label: 'Attendance' },
  { to: '/eboard/semesters', label: 'Semesters' },
  { to: '/eboard/sync', label: 'Sheets sync' },
]

export default function Sidebar({ profile }) {
  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">E-Board</div>
        <div className="sidebar-user">{profile.full_name}</div>
      </div>
      <div className="sidebar-links">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            {link.label}
          </NavLink>
        ))}
      </div>
      <button className="btn secondary sidebar-signout" onClick={() => signOut()}>
        Sign out
      </button>
    </nav>
  )
}
