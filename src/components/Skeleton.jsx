import './skeleton.css'

// Skeleton loading placeholders. Every exported layout wraps itself in
// role="status" with visually-hidden "Loading…" text, so screen readers
// still get an announcement while sighted users see the shimmer blocks.

function Box({ w = '100%', h = 14, className = '', style }) {
  return <span className={`skeleton ${className}`} style={{ width: w, height: h, ...style }} aria-hidden="true" />
}

export function SkeletonText({ w = '100%', size = '' }) {
  return <span className={`skeleton skeleton-text ${size}`} style={{ width: w }} aria-hidden="true" />
}

function Status({ children, className = '', style }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className} style={style}>
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  )
}

// A list of rows: avatar circle + two lines of text + a badge on the right.
export function SkeletonList({ rows = 5, avatar = true, badge = true }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton-row" key={i}>
          {avatar && <Box w={36} h={36} className="circle" style={{ flex: '0 0 auto' }} />}
          <div className="skeleton-fill">
            <SkeletonText w={`${55 + ((i * 17) % 30)}%`} />
            <SkeletonText w={`${30 + ((i * 11) % 25)}%`} size="sm" />
          </div>
          {badge && <Box w={64} h={22} className="pill" style={{ flex: '0 0 auto' }} />}
        </div>
      ))}
    </div>
  )
}

// A table: header line then N rows of `cols` cells.
export function SkeletonTable({ rows = 6, cols = 4 }) {
  return (
    <div aria-hidden="true">
      <div className="skeleton-row" style={{ paddingTop: 0 }}>
        {Array.from({ length: cols }).map((_, c) => (
          <Box key={c} h={10} w={`${100 / cols}%`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div className="skeleton-row" key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <Box key={c} h={14} w={`${(100 / cols) * (c === 0 ? 1.1 : 0.7)}%`} />
          ))}
        </div>
      ))}
    </div>
  )
}

// A card with a title line and a body of rows.
export function SkeletonCard({ rows = 3, title = true, children }) {
  return (
    <div className="skeleton-card" aria-hidden="true">
      {title && <SkeletonText w="35%" size="lg" />}
      {children || <SkeletonList rows={rows} avatar={false} badge={false} />}
    </div>
  )
}

// ---------- Whole-page presets ----------

// E-Board portal pages. `variant`:
//   'table'    page header + toolbar + one big table (Brothers, Points, Discipline, Semesters)
//   'events'   page header + toolbar + list rows (Events, Forms)
//   'detail'   back link + header + two-column detail layout (BrotherDetail, EventDetail)
//   'overview' header + 4 stat tiles + 2×2 cards (Overview)
export function EboardPageSkeleton({ variant = 'table' }) {
  return (
    <Status className="eboard-main">
      <div className="skeleton-page-header" aria-hidden="true">
        {variant === 'detail' && <SkeletonText w={120} size="sm" />}
        <SkeletonText w={variant === 'detail' ? '40%' : 180} size="lg" />
        <SkeletonText w={260} size="sm" />
      </div>

      {variant === 'overview' && (
        <>
          <div className="skeleton-grid cols-4" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div className="skeleton-card" key={i} style={{ margin: 0 }}>
                <SkeletonText w="50%" size="sm" />
                <SkeletonText w="30%" size="lg" />
                <SkeletonText w="60%" size="sm" />
              </div>
            ))}
          </div>
          <div className="skeleton-grid cols-2" aria-hidden="true">
            <SkeletonCard rows={4} />
            <SkeletonCard rows={4} />
          </div>
          <div className="skeleton-grid cols-2" aria-hidden="true">
            <SkeletonCard rows={3} />
            <SkeletonCard rows={3} />
          </div>
        </>
      )}

      {(variant === 'table' || variant === 'events') && (
        <>
          <div className="skeleton-toolbar" aria-hidden="true">
            <Box w={220} h={36} />
            <Box w={130} h={36} />
            <Box w={130} h={36} />
            <span style={{ flex: 1 }} />
            <Box w={120} h={36} />
          </div>
          <div className="skeleton-card" aria-hidden="true">
            {variant === 'table' ? <SkeletonTable rows={8} cols={5} /> : <SkeletonList rows={6} />}
          </div>
        </>
      )}

      {variant === 'detail' && (
        <div className="skeleton-grid cols-2" aria-hidden="true">
          <div>
            <div className="skeleton-card">
              <Box w={72} h={72} className="circle" style={{ marginBottom: '0.75rem' }} />
              <SkeletonText w="60%" size="lg" />
              <SkeletonList rows={5} avatar={false} badge={false} />
            </div>
            <SkeletonCard rows={5} />
          </div>
          <div>
            <SkeletonCard rows={4} />
            <SkeletonCard rows={6} />
          </div>
        </div>
      )}
    </Status>
  )
}

// Brother portal pages — a stack of cards sized for a phone screen.
//   'home'   standing card + upcoming events + recent attendance
//   'list'   tabs + one list card (Events, Attendance, Leaderboard)
//   'profile' detail card + form card
export function BrotherPageSkeleton({ variant = 'list' }) {
  return (
    <Status>
      {variant === 'home' && (
        <>
          <SkeletonCard rows={4} />
          <SkeletonText w={140} size="lg" />
          <SkeletonList rows={3} avatar={false} />
          <SkeletonText w={160} size="lg" />
          <SkeletonList rows={2} avatar={false} />
        </>
      )}
      {variant === 'list' && (
        <>
          <div className="skeleton-toolbar" aria-hidden="true">
            <Box h={38} />
            <Box h={38} />
          </div>
          <div className="skeleton-card" aria-hidden="true">
            <SkeletonList rows={6} avatar={false} />
          </div>
        </>
      )}
      {variant === 'profile' && (
        <>
          <div className="skeleton-card" aria-hidden="true">
            <SkeletonList rows={6} avatar={false} badge={false} />
          </div>
          <SkeletonCard rows={3} />
        </>
      )}
    </Status>
  )
}

// App-level: shown before we know who's signed in (no portal CSS loaded yet).
export function AppSkeleton() {
  return (
    <Status className="skeleton-center">
      <div className="skeleton-card" aria-hidden="true">
        <SkeletonText w="45%" size="lg" />
        <SkeletonText w="80%" />
        <SkeletonText w="65%" />
        <Box h={40} style={{ marginTop: '1rem' }} />
      </div>
    </Status>
  )
}
