/**
 * Pure helpers for the classroom lobby — kept out of the React component so the
 * "which session is next / which are past" logic can be unit-tested.
 */

import { getSessionUiState } from '@/lib/sessions/live-session-status'

export interface LobbySessionLike {
  id: string
  scheduledAt: string | null
  endedAt?: string | null
  status: string
  isVirtual?: boolean
}

/**
 * Split the course's sessions into the single "next" session and the list of
 * past sessions to review.
 *  - next = a session already in progress (active/live/preparing/paused) if any,
 *           else the soonest upcoming scheduled one. In-progress selection is based
 *           on backend status, not the time-gated UI "Live" badge, so a tutor can
 *           enter/launch before the scheduled start if needed.
 *  - past = ended sessions (or real sessions with an endedAt), newest first
 */
export function categorizeLobbySessions<T extends LobbySessionLike>(
  sessions: T[],
  nowMs: number = Date.now()
): { nextSession: T | null; pastSessions: T[] } {
  const inProgressStatuses = ['active', 'live', 'preparing', 'paused']
  const liveOrOpening = sessions.find(s => inProgressStatuses.includes(s.status))

  const upcoming = sessions
    .filter(
      s =>
        s.status === 'scheduled' &&
        s.scheduledAt &&
        !inProgressStatuses.includes(s.status) &&
        !getSessionUiState(s, nowMs).isUiLive
    )
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())

  const past = sessions
    .filter(s => s.status === 'ended' || (s.endedAt != null && !s.isVirtual))
    .sort((a, b) => new Date(b.scheduledAt || 0).getTime() - new Date(a.scheduledAt || 0).getTime())

  return { nextSession: liveOrOpening || upcoming[0] || null, pastSessions: past }
}
