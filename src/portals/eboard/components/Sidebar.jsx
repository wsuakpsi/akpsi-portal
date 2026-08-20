import { NavLink } from 'react-router-dom'
import { signOut } from '../../../lib/auth'

const icons = {
  overview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  brothers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  events: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  attendance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  points: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  ),
  forms: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  ),
  discipline: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  sync: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  ),
  pnm: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" />
      <path d="M20 8v6M23 11h-6" />
    </svg>
  ),
  semesters: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  ),
}

const sections = [
  {
    label: 'Chapter',
    links: [
      { to: '/eboard', label: 'Overview', end: true, icon: 'overview' },
      { to: '/eboard/brothers', label: 'Brothers', icon: 'brothers' },
      { to: '/eboard/events', label: 'Events', icon: 'events' },
      { to: '/eboard/attendance', label: 'Attendance', icon: 'attendance' },
    ],
  },
  {
    label: 'Management',
    links: [
      { to: '/eboard/points', label: 'Points', icon: 'points' },
      { to: '/eboard/forms', label: 'Forms', icon: 'forms', badgeKey: 'forms' },
      { to: '/eboard/discipline', label: 'Discipline', icon: 'discipline' },
      { to: '/eboard/sync', label: 'Sheets sync', icon: 'sync' },
      { to: '/eboard/semesters', label: 'Semesters', icon: 'semesters' },
    ],
  },
]

function initials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

export default function Sidebar({ profile, badges = {} }) {
  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">Beta Omicron</div>
        <div className="sidebar-subtitle">E-Board portal</div>
      </div>

      {sections.map((section) => (
        <div className="sidebar-section" key={section.label}>
          <div className="sidebar-section-label">{section.label}</div>
          <div className="sidebar-links">
            {section.links.map((link) => {
              const count = link.badgeKey ? badges[link.badgeKey] : null
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                >
                  {icons[link.icon]}
                  <span>{link.label}</span>
                  {!!count && <span className="sidebar-badge">{count}</span>}
                </NavLink>
              )
            })}
          </div>
        </div>
      ))}

      <div className="sidebar-footer">
        <div className="sidebar-avatar">{initials(profile.full_name)}</div>
        <div>
          <div className="sidebar-user-name">{profile.full_name}</div>
          <div className="sidebar-user-position">{profile.eboard_position || 'E-Board'}</div>
        </div>
      </div>
      <button className="btn secondary sidebar-signout" onClick={() => signOut()}>
        Sign out
      </button>
    </nav>
  )
}
