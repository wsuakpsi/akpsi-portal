import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { callLambda } from '../../../lib/lambdas'
import { getActiveSemester, POINT_CATEGORIES } from '../lib/queries'

const CALCULATE_STANDING_URL = import.meta.env.VITE_CALCULATE_STANDING_URL

const CHECK_LABELS = {
  points: 'Category points',
  attendance: 'Attendance %',
  absences: 'Meeting absences',
}

function StandingResults({ result }) {
  return (
    <div className="card">
      <h2>Standing results</h2>
      <p className="note-text">
        {result.members.filter((m) => m.standing === 'good').length} in good standing,{' '}
        {result.members.filter((m) => m.standing !== 'good').length} flagged. Notifications sent to everyone.
        Status changes are not automatic — update each member's status from Brother Detail after reviewing.
      </p>
      {result.sheetsSync && !result.sheetsSync.success && (
        <p className="error-text">Sheets archive sync failed: {result.sheetsSync.error}</p>
      )}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Threshold</th>
            <th>Points</th>
            <th>Attendance</th>
            <th>Excused</th>
            <th>Unexcused</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {result.members
            .slice()
            .sort((a, b) => a.fullName.localeCompare(b.fullName))
            .map((m) => (
              <tr key={m.memberId}>
                <td>{m.fullName}</td>
                <td>{m.thresholdType}</td>
                <td>{m.checks.points ? 'Pass' : 'Fail'} ({m.totals.total})</td>
                <td>{m.checks.attendance ? 'Pass' : 'Fail'} ({Math.round(m.attendancePercentage * 100)}%)</td>
                <td>{m.excusedAbsences}</td>
                <td>{m.unexcusedAbsences}</td>
                <td>
                  <span className={`status-badge ${m.standing === 'good' ? 'active' : 'probation'}`}>
                    {m.standing === 'good' ? 'Good standing' : 'Flagged'}
                  </span>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Points() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [semester, setSemester] = useState(null)
  const [rows, setRows] = useState([])
  const [calculating, setCalculating] = useState(false)
  const [calcError, setCalcError] = useState(null)
  const [calcResult, setCalcResult] = useState(null)

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

  async function handleCalculateStanding(confirm = false) {
    if (!semester) return
    setCalculating(true)
    setCalcError(null)
    try {
      const result = await callLambda(CALCULATE_STANDING_URL, { semesterId: semester.id, confirm })
      setCalcResult(result)
    } catch (err) {
      if (err.message === 'already_calculated') {
        const reconfirmed = window.confirm(
          `Standing was already calculated for "${semester.name}". Run again and overwrite the results ` +
            '(new notifications will be sent to every brother)?'
        )
        if (reconfirmed) {
          setCalculating(false)
          await handleCalculateStanding(true)
          return
        }
      } else {
        setCalcError(err.message)
      }
    } finally {
      setCalculating(false)
    }
  }

  if (loading) return <div className="eboard-main">Loading...</div>

  return (
    <div className="eboard-main">
      <h1>Points &amp; Standing</h1>
      {error && <p className="error-text">{error}</p>}

      {!semester && <p className="empty-state">No active semester configured.</p>}

      {semester && (
        <>
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

          <div className="card">
            <h2>Calculate standing</h2>
            <p className="note-text">
              Runs all three standing checks ({Object.values(CHECK_LABELS).join(', ')}) for every active/probation
              brother, locks results for "{semester.name}", notifies everyone of their result, and archives a
              snapshot to the Sheets Archive tab. Status changes are not automatic — review results below, then
              update each member's status from Brother Detail.
            </p>
            {calcError && <p className="error-text">{calcError}</p>}
            <button className="btn" disabled={calculating} onClick={() => handleCalculateStanding(false)}>
              {calculating ? 'Calculating...' : 'Calculate Standing'}
            </button>
          </div>

          {calcResult && <StandingResults result={calcResult} />}
        </>
      )}
    </div>
  )
}
