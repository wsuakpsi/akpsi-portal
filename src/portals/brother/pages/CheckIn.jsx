import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { callLambda } from '../../../lib/lambdas'
import Topbar from '../components/Topbar'

const QR_HANDLER_URL = import.meta.env.VITE_RECORD_ATTENDANCE_QR_URL

export default function CheckIn({ profile }) {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState('checking') // checking | success | error
  const [message, setMessage] = useState('')
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    if (!token) {
      setStatus('error')
      setMessage('This check-in link is missing its code.')
      toast.error('This check-in link is missing its code.')
      return
    }

    callLambda(QR_HANDLER_URL, { token, memberId: profile.id })
      .then(() => {
        setStatus('success')
        setMessage("You're checked in!")
        toast.success("You're checked in!")
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err.message)
        toast.error(err.message)
      })
  }, [token, profile.id])

  return (
    <div>
      <Topbar profile={profile}>
        <div className="topbar-title">Check in</div>
      </Topbar>
      <div className="page">
        <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          {status === 'checking' && <p>Checking you in...</p>}
          {status === 'success' && <p className="note-text">{message}</p>}
          {status === 'error' && <p className="error-text">{message}</p>}
        </div>
      </div>
    </div>
  )
}
