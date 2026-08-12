import { useState } from 'react'

const SYNC_URL = import.meta.env.VITE_SHEETS_SYNC_URL
const SYNC_KEY = import.meta.env.VITE_SHEETS_SYNC_SERVICE_ROLE_KEY
const LAST_SYNC_STORAGE_KEY = 'eboard.lastSheetsSyncAt'

export default function SheetsSync() {
  const [lastSyncAt, setLastSyncAt] = useState(() => localStorage.getItem(LAST_SYNC_STORAGE_KEY))
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function handleRunSync() {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      if (!SYNC_URL) throw new Error('VITE_SHEETS_SYNC_URL is not configured.')

      const res = await fetch(SYNC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': SYNC_KEY || '',
        },
      })

      if (!res.ok) throw new Error(`Sync failed: ${res.status} ${res.statusText}`)

      const now = new Date().toISOString()
      localStorage.setItem(LAST_SYNC_STORAGE_KEY, now)
      setLastSyncAt(now)
      setResult('Sync triggered successfully.')
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
              <th>Last sync</th>
              <td>{lastSyncAt ? new Date(lastSyncAt).toLocaleString() : 'Never run this session'}</td>
            </tr>
          </tbody>
        </table>
        {error && <p className="error-text">{error}</p>}
        {result && <p className="note-text">{result}</p>}
        <div style={{ marginTop: '0.75rem' }}>
          <button className="btn" disabled={running} onClick={handleRunSync}>
            {running ? 'Running...' : 'Run sync'}
          </button>
        </div>
        <p className="note-text">
          Calls the syncToGoogleSheets Lambda via API Gateway ({SYNC_URL || 'VITE_SHEETS_SYNC_URL not set'}).
        </p>
      </div>
    </div>
  )
}
