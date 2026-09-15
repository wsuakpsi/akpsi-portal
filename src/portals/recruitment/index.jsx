import { Routes, Route, Navigate, Link } from 'react-router-dom'
import './recruitment.css'
import { signOut } from '../../lib/auth'
import { CrestIcon } from '../../components/AuthShell'
import Candidates from './pages/Candidates'
import CandidateDetail from './pages/CandidateDetail'

export default function RecruitmentRouter({ profile }) {
  return (
    <div className="recruitment-app">
      <header className="recruitment-topbar">
        <div className="recruitment-topbar-inner">
          <Link to="/recruitment" className="recruitment-brand">
            <div className="recruitment-brand-crest"><CrestIcon /></div>
            <div>
              <div className="recruitment-brand-name">Recruitment</div>
              <div className="recruitment-brand-sub">Alpha Kappa Psi · Beta Omicron</div>
            </div>
          </Link>
          <div className="recruitment-topbar-user">
            <strong>{profile.full_name}</strong>
            <button className="recruitment-signout" onClick={() => signOut()}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="recruitment-main">
        <Routes>
          <Route path="/" element={<Navigate to="/recruitment" replace />} />
          <Route path="/recruitment" element={<Candidates profile={profile} />} />
          <Route path="/recruitment/:id" element={<CandidateDetail profile={profile} />} />
          <Route path="*" element={<Navigate to="/recruitment" replace />} />
        </Routes>
      </main>
    </div>
  )
}
