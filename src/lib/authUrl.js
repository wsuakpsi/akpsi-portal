// Snapshot of the auth-related parts of the URL, taken once at module load.
//
// Why this exists: Supabase email links (invite, password reset) redirect
// back to the app with their payload in the URL — either tokens in the hash
// (`#access_token=…&type=invite`) or, with the recommended email template,
// a `token_hash` + `type` pair. supabase-js consumes and *strips* the hash
// asynchronously right after the client is created, so by the time React
// renders, `window.location.hash` may already be empty. The app used to
// infer "this is an invite" purely from the pathname being /set-password,
// which breaks whenever Supabase falls back to the Site URL (redirect URL
// not on the allow-list) and lands the brother on "/" — logged in, but with
// no password set.
//
// This module must be imported BEFORE `createClient` runs (see supabase.js)
// so the snapshot is taken while the hash is still intact.

function parse(str) {
  return new URLSearchParams(str.startsWith('#') || str.startsWith('?') ? str.slice(1) : str)
}

const hash = typeof window !== 'undefined' ? parse(window.location.hash) : new URLSearchParams()
const query = typeof window !== 'undefined' ? parse(window.location.search) : new URLSearchParams()

// Hash wins over query — that's where Supabase's implicit-flow redirect
// puts everything. `token_hash` may be in either (see the email template
// note in DEPLOY.md: putting it in the fragment survives the S3/CloudFront
// trailing-slash redirect that can drop a query string).
function pick(key) {
  return hash.get(key) || query.get(key) || null
}

export const initialAuthUrl = Object.freeze({
  // 'invite' | 'recovery' | 'signup' | 'magiclink' | 'email_change' | null
  type: pick('type'),
  // Present only with the token_hash-style email template.
  tokenHash: pick('token_hash'),
  // Supabase error redirect: #error=access_denied&error_code=otp_expired&error_description=…
  errorCode: pick('error_code') || pick('error'),
  errorDescription: pick('error_description')?.replace(/\+/g, ' ') || null,
})

export function isInviteUrl() {
  return initialAuthUrl.type === 'invite'
}

export function isRecoveryUrl() {
  return initialAuthUrl.type === 'recovery'
}

// Strip auth params from the address bar once they've been consumed, so a
// refresh / bookmark / share doesn't re-trigger them.
export function clearAuthParamsFromUrl(path = window.location.pathname) {
  window.history.replaceState(window.history.state, '', path)
}
