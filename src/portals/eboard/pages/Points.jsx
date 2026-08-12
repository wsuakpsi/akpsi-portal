import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { getActiveSemester, POINT_CATEGORIES } from '../lib/queries'

export default function Points() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [semester, setSemester] = useState(null)
  const [rows, setRows] = useState([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const activeSemester = await getActiveSemester()
        if (!cancelled) setSemester(activeSemester)
        if (!activeSemester) {
          if (!cancelled) {
            setRows([])
            setLoading(false)
          }
          return
        }

        const [membersRes, ledgerRes] = await Promise.all([
          supabase.from('members').select('id, full_name').order('full_name', { ascending: true }),
          supabase
            .from('points_ledger')
            .select('member_id, category, delta')
            .eq('semester_id', activeSemester.id),
        ])
        if (membersRes.error) throw membersRes.error
        if (ledgerRes.error) throw ledgerRes.error

        const totalsByMember = {}
        for (const member of membersRes.data || []) {
          totalsByMember[member.id] = {
            id: member.id,
            name: member.full_name,
            byCategory: Object.fromEntries(POINT_CATEGORIES.map((c) => [c, 0])),
            total: 0,
          }
        }

        for (const row of ledgerRes.data || []) {
          if (!totalsByMember[row.member_id]) continue
          if (POINT_CATEGORIES.includes(row.category)) {
            totalsByMember[row.member_id].byCategory[row.category] += row.delta
          }
          totalsByMember[row.member_id].total += row.delta
        }

        const result = Object.values(totalsByMember).sort((a, b) => a.name.localeCompare(b.name))

        if (!cancelled) setRows(result)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <div className="eboard-main">Loading...</div>

  return (
    <div className="eboard-main">
      <h1>Points</h1>
      {error && <p className="error-text">{error}</p>}

      {!semester && <p className="empty-state">No active semester configured.</p>}

      {semester && (
        <div className="card">
          {rows.length === 0 && <p className="empty-state">No members found.</p>}
          {rows.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  {POINT_CATEGORIES.map((c) => (
                    <th key={c} style={{ textTransform: 'capitalize' }}>{c}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    {POINT_CATEGORIES.map((c) => (
                      <td key={c}>{row.byCategory[c]}</td>
                    ))}
                    <td><strong>{row.total}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
