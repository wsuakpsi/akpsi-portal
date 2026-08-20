import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'

const STATUS_FILTERS = ['all', 'open', 'resolved', 'escalated']

export default function Discipline() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [bips, setBips] = useState([])
  const [statusFilter, setStatusFilter] = useState('open')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data, error: bipError } = await supabase
          .from('brother_improvement_plans')
          .select('*, members!member_id(full_name)')
          .order('created_at', { ascending: false })
        if (bipError) throw bipError
        setBips(data || [])
      } catch (err) {
        setError(err.message)
        toast.error(`Could not load improvement plans: ${err.message}`)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div className="eboard-main">Loading...</div>

  const filtered = bips.filter((bip) => {
    if (statusFilter !== 'all' && bip.status !== statusFilter) return false
    const query = search.trim().toLowerCase()
    if (query && !(bip.members?.full_name || '').toLowerCase().includes(query)) return false
    return true
  })

  const openCount = bips.filter((b) => b.status === 'open').length

  return (
    <div className="eboard-main">
      <div className="page-header">
        <div>
          <h1>Discipline</h1>
          <p className="page-subtitle">{openCount} open improvement plan{openCount === 1 ? '' : 's'}</p>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}

      <div className="toolbar">
        <input
          type="text"
          placeholder="Search by brother"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>
          ))}
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 && <p className="empty-state">No improvement plans match these filters.</p>}
        {filtered.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Brother</th>
                <th>Description</th>
                <th>Requirements</th>
                <th>Due</th>
                <th>Status</th>
                <th>Resolution note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((bip) => (
                <tr key={bip.id}>
                  <td>
                    <div className="member-cell">
                      <div className="avatar">
                        {(bip.members?.full_name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </div>
                      <div className="member-name">{bip.members?.full_name || 'Unknown'}</div>
                    </div>
                  </td>
                  <td>{bip.description}</td>
                  <td>{bip.requirements}</td>
                  <td>{bip.due_date}</td>
                  <td>
                    <span
                      className={`status-badge ${
                        bip.status === 'open' ? 'pending' : bip.status === 'resolved' ? 'active' : 'unexcused'
                      }`}
                    >
                      {bip.status}
                    </span>
                  </td>
                  <td>{bip.resolution_note || '-'}</td>
                  <td>
                    <Link className="btn small secondary" to={`/eboard/brothers/${bip.member_id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
