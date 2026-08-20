import { Link } from 'react-router-dom'

export function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

export default function Topbar({ profile, children }) {
  return (
    <div className="topbar">
      <div className="topbar-left">{children}</div>
      <Link to="/brother/profile" className="avatar-link" aria-label="Profile">
        <div className="avatar">{initials(profile.full_name)}</div>
      </Link>
    </div>
  )
}
