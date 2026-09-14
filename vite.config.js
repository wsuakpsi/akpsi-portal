import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Content-Security-Policy for production builds only.
//
// The portal is a static SPA on S3/CloudFront, so the simplest place to
// ship a CSP is a <meta> tag injected at build time. Every allowed origin is
// derived from the same VITE_* env vars the app already reads, so adding a
// new Lambda URL to .env.local automatically allows it here too — nothing
// to keep in sync by hand.
//
// Dev mode is skipped on purpose: Vite's HMR client and React Fast Refresh
// need inline scripts / websockets that a strict policy would block.
//
// Escape hatch: set VITE_CSP=off in the build environment to skip the tag
// entirely (e.g. while debugging a blocked request in production).
function cspPlugin(env) {
  return {
    name: 'akpsi-csp',
    apply: 'build',
    transformIndexHtml() {
      if (env.VITE_CSP === 'off') return []

      const origins = new Set()
      let supabaseHost = null
      for (const [key, value] of Object.entries(env)) {
        if (!key.startsWith('VITE_') || !key.endsWith('_URL') || !value) continue
        try {
          const url = new URL(value)
          origins.add(url.origin)
          if (key === 'VITE_SUPABASE_URL') supabaseHost = url.host
        } catch {
          // Not a URL (or blank) — ignore.
        }
      }

      const connect = ["'self'", ...origins]
      // supabase-js opens a websocket for realtime if it's ever used; allow
      // it now so enabling realtime later doesn't silently break.
      if (supabaseHost) connect.push(`wss://${supabaseHost}`)

      const img = ["'self'", 'data:', 'blob:']
      if (supabaseHost) img.push(`https://${supabaseHost}`) // avatars / proofs buckets

      const policy = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        "script-src 'self'",
        // react-hot-toast injects a <style> tag and the app uses inline
        // style="" attributes, so inline styles have to stay allowed.
        "style-src 'self' 'unsafe-inline'",
        `img-src ${img.join(' ')}`,
        "font-src 'self' data:",
        `connect-src ${connect.join(' ')}`,
        "manifest-src 'self'",
        "frame-src 'none'",
        "upgrade-insecure-requests",
      ].join('; ')

      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), cspPlugin(env)],
  }
})
