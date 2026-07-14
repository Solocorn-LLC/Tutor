import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { toast } from 'sonner'
import type { OneOnOneRequestSummary } from '@/components/one-on-one/one-on-one-request-card'

/**
 * Resolve a PAID 1-on-1 booking to its live-session id via `ensure-session`
 * (which self-heals a missing session). Works for either participant. Returns
 * the session id, or null (after showing a toast) when it isn't joinable yet.
 */
export async function resolveOneOnOneSession(requestId: string): Promise<string | null> {
  try {
    const res = await fetchWithCsrf('/api/one-on-one/ensure-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ requestId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.sessionId) {
      toast.error(data?.error || "This session isn't ready to join yet. Please try again.")
      return null
    }
    return data.sessionId as string
  } catch {
    toast.error('Could not open the classroom. Please try again.')
    return null
  }
}

/**
 * The session a "Join" action should open for a booking group. For a single
 * booking that's just its request; for a recurring series it's the soonest
 * session that hasn't finished yet (falling back to the last one if all are
 * past), so a tutor/student always lands in the upcoming class. Only PAID
 * sessions are joinable, so non-paid members are ignored. Returns null when
 * nothing is joinable.
 */
export function joinableRequestId(
  members: OneOnOneRequestSummary[],
  now: number = Date.now()
): string | null {
  const paid = members.filter(m => (m.status || '').toUpperCase() === 'PAID')
  if (paid.length === 0) return null
  const byDate = [...paid].sort(
    (a, b) => new Date(a.requestedDate).getTime() - new Date(b.requestedDate).getTime()
  )
  // "Still joinable" = the session day hasn't fully passed (grace of ~1 day).
  const GRACE_MS = 24 * 60 * 60 * 1000
  const upcoming = byDate.find(m => new Date(m.requestedDate).getTime() + GRACE_MS >= now)
  return (upcoming ?? byDate[byDate.length - 1]).requestId
}

/**
 * The most recent COMPLETED session in a group — the one a "Rate" click reviews.
 * Returns null when none are completed.
 */
export function latestCompletedRequestId(members: OneOnOneRequestSummary[]): string | null {
  const completed = members.filter(m => (m.status || '').toUpperCase() === 'COMPLETED')
  if (completed.length === 0) return null
  return completed.reduce((a, b) =>
    new Date(a.requestedDate).getTime() >= new Date(b.requestedDate).getTime() ? a : b
  ).requestId
}
