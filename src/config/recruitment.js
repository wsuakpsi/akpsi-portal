// Flip this to open/close the public application form on
// recruitment.wsuakpsi.com, then rebuild and deploy. While false, visitors
// see "Applications have not opened yet." Members can still sign in at
// /login to deliberate either way.
export const APPLICATIONS_OPEN = true

// Applications close Tuesday, September 22 at midnight (i.e. the boundary
// between Tuesday and Wednesday) and voting can't start until 6pm Wednesday,
// September 23. Times are pinned to US Eastern (-04:00, EDT in September).
export const APPLICATION_DEADLINE = '2026-09-23T00:00:00-04:00'
export const VOTING_START = '2026-09-23T18:00:00-04:00'

export function applicationsClosed() {
  return Date.now() >= new Date(APPLICATION_DEADLINE).getTime()
}

export function votingStarted() {
  return Date.now() >= new Date(VOTING_START).getTime()
}
