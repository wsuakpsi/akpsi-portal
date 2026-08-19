import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function Notifications({ profile }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('notifications')
        .select('*')
        .eq('member_id', profile.id)
        .order('created_at', { ascending: false })
      if (fetchError) throw fetchError
      setRows(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  async function markRead(id) {
    // Optimistic — this is a low-stakes toggle, no need to block the UI on
    // the round trip. RLS (notifications_update_own) is the real guard.
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, read: true } : r)))
    const { error: updateError } = await supabase.from('notifications').update({ read: true }).eq('id', id)
    if (updateError) setError(updateError.message)
  }

  const unreadCount = rows.filter((r) => !r.read).length

  return (
    <div className="page">
      <h1>Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}</h1>
      {error && <p className="error-text">{error}</p>}
      {loading && <p className="empty-state">Loading...</p>}
      {!loading && rows.length === 0 && <p className="empty-state">No notifications yet.</p>}

      {!loading && rows.length > 0 && (
        <div className="card">
          {rows.map((row) => (
            <div key={row.id} className="list-item" style={{ opacity: row.read ? 0.6 : 1 }}>
              <div className="meta">{new Date(row.created_at).toLocaleString()}</div>
              <div className="title">{row.title}</div>
              <div className="meta">{row.body}</div>
              {!row.read && (
                <button type="button" className="btn secondary" onClick={() => markRead(row.id)}>
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
