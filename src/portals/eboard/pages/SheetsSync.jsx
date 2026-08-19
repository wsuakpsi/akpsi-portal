import { useEffect, useState } from 'react'
import { callLambda } from '../../../lib/lambdas'
import { getActiveSemester } from '../lib/queries'

const SYNC_URL = import.meta.env.VITE_SHEETS_SYNC_URL
const LAST_SYNC_STORAGE_KEY = 'eboard.lastSheetsSyncAt'

export default function SheetsSync() {
  const [semester, setSemester] = useState(undefined)
  const [lastSyncAt, setLastSyncAt] = useState(() => localStorage.getItem(LAST_SYNC_STORAGE_KEY))
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    getActiveSemester().then(setSemester)
  }, [])

  async function handleRunSync() {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      if (!semester) throw new Error('No active semester to sync.')

      const res = await callLambda(SYNC_URL, { semesterId: semester.id })

      const now = new Date().toISOString()
      localStorage.setItem(LAST_SYNC_STORAGE_KEY, now)
      setLastSyncAt(now)
      setResult(`Synced "${res.sheetTitle}" — ${res.rowsWritten} rows written.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="eboard-main">
      <h1>Sheets sync</h1>

      <div className="card">
        <h2>Google Sheets sync</h2>
        <table>
          <tbody>
            <tr>
              <th>Active semester</th>
              <td>{semester === undefined ? 'Loading...' : semester ? semester.name : 'None active'}</td>
            </tr>
            <tr>
              <th>Last sync</th>
              <td>{lastSyncAt ? new Date(lastSyncAt).toLocaleString() : 'Never run this session'}</td>
            </tr>
          </tbody>
        </table>
        {error && <p className="error-text">{error}</p>}
        {result && <p className="note-text">{result}</p>}
        <div style={{ marginTop: '0.75rem' }}>
          <button className="btn" disabled={running || !semester} onClick={handleRunSync}>
            {running ? 'Running...' : 'Run sync'}
          </button>
        </div>
        <p className="note-text">
          Overwrites the "{semester?.name || 'active semester'}" tab with current standings. An archive snapshot is
          appended automatically when end-of-semester standing is calculated.
        </p>
      </div>
    </div>
  )
}
