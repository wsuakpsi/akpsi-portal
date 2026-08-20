import { NavLink } from 'react-router-dom'

const links = [
  { to: '/brother', label: 'Home', end: true },
  { to: '/brother/events', label: 'Events' },
  { to: '/brother/attendance', label: 'Attendance' },
  { to: '/brother/leaderboard', label: 'Leaderboard' },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  )
}
