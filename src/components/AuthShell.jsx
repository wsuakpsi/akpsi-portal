import '../pages/Login.css'

// Brand chrome shared by Login, SetPassword, ResetPassword and Join: the
// desktop brand panel, the mobile-only header, the card, and the footer.
// Pages render only their card contents as children.

export function CrestIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  )
}

export default function AuthShell({ children }) {
  return (
    <div className="login-root">
      <aside className="login-brand">
        <div className="login-brand-crest"><CrestIcon /></div>
        <div className="login-brand-name">AKΨ</div>
        <div className="login-brand-full">Alpha Kappa Psi</div>
        <div className="login-brand-divider" />
        <p className="login-brand-tagline">
          Developing principled business leaders — one brother at a time.
        </p>
      </aside>

      <main className="login-form-panel">
        <div className="login-mobile-header">
          <div className="login-mobile-crest"><CrestIcon /></div>
          <div className="login-mobile-name">AKΨ Portal</div>
          <div className="login-mobile-full">Alpha Kappa Psi</div>
        </div>

        <div className="login-card">{children}</div>

        <p className="login-footer">Alpha Kappa Psi · Chapter Portal</p>
      </main>
    </div>
  )
}
