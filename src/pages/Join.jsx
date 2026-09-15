import AuthShell from '../components/AuthShell'

// The self-serve /join link is disabled — brothers used to be able to create
// their own account here instead of waiting on an E-Board-sent invite email.
// That flow is retired; this page now just tells anyone who lands on the old
// link to contact E-Board for an invite instead. See HUMAN_TASKS.md and
// migration 0031 (drops pending_invites_insert_self) for the rest of the
// cleanup — src/App.jsx's isJoin routing and this file can be deleted once
// nothing links here anymore.
export default function Join() {
  return (
    <AuthShell>
      <h1 className="login-card-title">This join link is no longer valid</h1>
      <p className="login-card-sub">
        Self-serve sign-up has been turned off. Please contact the VP of Membership
        or the VP of Technology to be sent an invite link.
      </p>
      <a href="/" className="login-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
        Back to sign in
      </a>
    </AuthShell>
  )
}
