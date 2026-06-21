/**
 * Pure helpers for the classroom lobby — kept out of the React component so the
 * "which session is next / which are past" logic can be unit-tested.
 */

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
 *  - next = a currently-live session if any, else the soonest upcoming scheduled one
 *  - past = ended sessions (or real sessions with an endedAt), newest first
 */
export function categorizeLobbySessions<T extends LobbySessionLike>(
  sessions: T[]
): { nextSession: T | null; pastSessions: T[] } {
  const active = sessions.find(s => s.status === 'active' || s.status === 'live')

  const upcoming = sessions
    .filter(s => s.status === 'scheduled' && s.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())

  const past = sessions
    .filter(s => s.status === 'ended' || (s.endedAt != null && !s.isVirtual))
    .sort((a, b) => new Date(b.scheduledAt || 0).getTime() - new Date(a.scheduledAt || 0).getTime())

  return { nextSession: active || upcoming[0] || null, pastSessions: past }
}
