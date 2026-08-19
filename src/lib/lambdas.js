import { supabase } from './supabase'

// Calls an API Gateway-fronted Lambda with the current Supabase session as
// the auth token (`Authorization: Bearer <access_token>`) — every Lambda
// verifies this itself (see lambdas/README.md#authentication), there is no
// separate API key. Throws with the Lambda's own error message on failure.
export async function callLambda(url, body) {
  if (!url) throw new Error('Lambda URL is not configured')

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })

  let json
  try {
    json = await res.json()
  } catch {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`)
  }

  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Request failed: ${res.status} ${res.statusText}`)
  }

  return json
}
