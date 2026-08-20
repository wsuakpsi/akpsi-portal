import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
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
      toast.success(`Synced "${res.sheetTitle}" — ${res.rowsWritten} rows written.`)
    } catch (err) {
      setError(err.message)
      toast.error(`Could not sync to Sheets: ${err.message}`)
    } finally {
      setRunning(false)
    }
  }

  const stale = !lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > 24 * 60 * 60 * 1000

  return (
    <div className="eboard-main">
      <div className="page-header">
        <div>
          <h1>Sheets sync</h1>
          <p className="page-subtitle">
            Syncs to "{semester ? `${semester.name} — Chapter Roster` : 'active semester'}" Google Sheet
          </p>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}

      <div className="sync-grid">
        <div className="sync-tile">
          <div>
            <div className="sync-tile-title">Current semester tab</div>
            <div className="sync-tile-sub">
              {lastSyncAt ? `Last synced ${new Date(lastSyncAt).toLocaleString()}` : 'Never run this session'}
            </div>
          </div>
          <div className={`sync-status ${stale ? 'stale' : 'ok'}`}>
            <span className="dot" />
            {stale ? 'Stale' : 'Up to date'}
          </div>
        </div>
        <div className="sync-tile">
          <div>
            <div className="sync-tile-title">Archive tab</div>
            <div className="sync-tile-sub">Appended at semester close</div>
          </div>
          <div className="sync-status ok">
            <span className="dot" />
            Up to date
          </div>
        </div>
      </div>

      {result && <p className="note-text">{result}</p>}

      <div className="sync-cta">
        <div>
          <div className="sync-cta-title">Sync now</div>
          <div className="sync-cta-sub">Overwrites the current semester tab with live data. Archive tab is not affected.</div>
        </div>
        <button className="btn gold" disabled={running || !semester} onClick={handleRunSync}>
          {running ? 'Running...' : 'Run sync'}
        </button>
      </div>
    </div>
  )
}
