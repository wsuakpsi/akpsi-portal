import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import QRCode from 'qrcode'

const BROTHER_PORTAL_URL = import.meta.env.VITE_BROTHER_PORTAL_URL

export default function CheckInQrPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const expiresAt = searchParams.get('expiresAt')
  const eventName = searchParams.get('eventName')
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!token) {
      setError('Missing check-in token.')
      return
    }
    if (!BROTHER_PORTAL_URL) {
      setError('VITE_BROTHER_PORTAL_URL is not configured.')
      return
    }
    const url = `${BROTHER_PORTAL_URL}/brother/checkin?token=${encodeURIComponent(token)}`
    QRCode.toDataURL(url, { width: 640, margin: 1 })
      .then(setQrDataUrl)
      .catch((err) => setError(err.message))
  }, [token])

  function handleFullscreen() {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen()
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f1a2e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {error && (
        <>
          <p style={{ color: '#fff', marginBottom: '1rem' }}>{error}</p>
          <Link to="/eboard/events" style={{ color: '#d4a537' }}>&larr; Back to events</Link>
        </>
      )}

      {!error && qrDataUrl && (
        <>
          <img
            src={qrDataUrl}
            alt="Check-in QR code"
            style={{ maxWidth: 'min(90vw, 90vh)', maxHeight: '80vh', width: 'auto', background: '#fff', padding: 24, borderRadius: 16 }}
          />
          {eventName && (
            <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 700, marginTop: '1.1rem' }}>{eventName}</div>
          )}
          {expiresAt && (
            <div style={{ color: '#b7bfd0', fontSize: '0.9rem', marginTop: '0.3rem' }}>
              Expires {new Date(expiresAt).toLocaleTimeString()}
            </div>
          )}
          <button
            onClick={handleFullscreen}
            style={{
              marginTop: '1.25rem',
              font: 'inherit',
              cursor: 'pointer',
              border: 'none',
              borderRadius: 8,
              padding: '0.55rem 1.1rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: '#d4a537',
              color: '#2b2200',
            }}
          >
            Fullscreen
          </button>
        </>
      )}

      {!error && !qrDataUrl && <p style={{ color: '#fff' }}>Generating...</p>}
    </div>
  )
}
