import { useState, useEffect } from 'react'

function detectPlatform() {
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
  const isAndroid = /android/i.test(ua)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && window.navigator.standalone === true)
  return { isIOS, isAndroid, isStandalone }
}

export default function InstallPrompt({ profileId }) {
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState(null)

  useEffect(() => {
    if (!profileId) return
    const { isIOS, isAndroid, isStandalone } = detectPlatform()
    if (isStandalone) return
    if (!isIOS && !isAndroid) return

    const key = `akpsi-install-shown-${profileId}`
    if (localStorage.getItem(key)) return

    setPlatform(isIOS ? 'ios' : 'android')
    setShow(true)
  }, [profileId])

  function dismiss() {
    localStorage.setItem(`akpsi-install-shown-${profileId}`, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="install-overlay" onClick={dismiss}>
      <div className="install-sheet" onClick={e => e.stopPropagation()}>
        <img className="install-app-icon" src="/logo.jpg" alt="AKΨ" />
        <h2 className="install-title">Add to Home Screen</h2>
        <p className="install-subtitle">
          Get quick access to the AKΨ Portal like a native app — no browser bar, full screen.
        </p>

        {platform === 'ios' ? (
          <ol className="install-steps">
            <li>
              Tap the <strong>Share</strong> button{' '}
              <svg className="install-inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>{' '}
              at the bottom of Safari
            </li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
            <li>Tap <strong>Add</strong> in the top right</li>
          </ol>
        ) : (
          <ol className="install-steps">
            <li>
              Tap the <strong>menu</strong>{' '}
              <svg className="install-inline-icon" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
              </svg>{' '}
              in the top right of Chrome
            </li>
            <li>Tap <strong>Add to Home Screen</strong></li>
            <li>Tap <strong>Add</strong> to confirm</li>
          </ol>
        )}

        <button className="btn install-dismiss-btn" onClick={dismiss}>Got it</button>
      </div>
    </div>
  )
}
