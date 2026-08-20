import { NavLink } from 'react-router-dom'

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  )
}

function IconEvents() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  )
}

function IconAttendance() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  )
}

function IconLeaderboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="18" y="3" width="4" height="18" rx="1"/>
      <rect x="10" y="8" width="4" height="13" rx="1"/>
      <rect x="2" y="13" width="4" height="8" rx="1"/>
    </svg>
  )
}

const links = [
  { to: '/brother',            label: 'Home',        Icon: IconHome,        end: true },
  { to: '/brother/events',     label: 'Events',      Icon: IconEvents },
  { to: '/brother/attendance', label: 'Attendance',  Icon: IconAttendance },
  { to: '/brother/leaderboard',label: 'Leaderboard', Icon: IconLeaderboard },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {links.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => isActive ? 'active' : undefined}
          aria-label={label}
        >
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
