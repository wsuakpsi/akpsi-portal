import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

import { initials } from '../../../lib/queries'

export { initials }

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function NotificationBell({ memberId }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [loaded, setLoaded] = useState(false)
  const containerRef = useRef(null)

  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    supabase
      .from('notifications')
      .select('id, title, body, read, created_at')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setNotifications(data || [])
        setLoaded(true)
      })
  }, [memberId])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  async function markRead(id) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    await supabase.from('notifications').update({ read: true }).eq('id', id)
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
    if (unreadIds.length === 0) return
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
  }

  return (
    <div className="notif-bell-wrap" ref={containerRef}>
      <button
        type="button"
        className="notif-bell"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && <span className="notif-badge" aria-hidden="true">{unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-dropdown" role="region" aria-label="Notifications">
          <div className="notif-dropdown-head">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="notif-mark-all" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {loaded && notifications.length === 0 && <p className="notif-empty">No notifications yet.</p>}
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`notif-item ${n.read ? '' : 'unread'}`}
              aria-label={`${n.read ? '' : 'Unread: '}${n.title}`}
              onClick={() => !n.read && markRead(n.id)}
            >
              <div className="notif-item-title">{n.title}</div>
              <div className="notif-item-body">{n.body}</div>
              <div className="notif-item-time">{timeAgo(n.created_at)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Topbar({ profile, children }) {
  return (
    <div className="topbar">
      <div className="topbar-left">{children}</div>
      <div className="topbar-actions">
        <NotificationBell memberId={profile.id} />
        <Link to="/brother/profile" className="avatar-link" aria-label="Profile">
          {profile.avatar_url ? (
            <img className="avatar" src={profile.avatar_url} alt="" />
          ) : (
            <div className="avatar">{initials(profile.full_name)}</div>
          )}
        </Link>
      </div>
    </div>
  )
}
