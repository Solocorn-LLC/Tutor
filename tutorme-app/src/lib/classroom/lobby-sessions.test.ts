import { describe, it, expect } from 'vitest'
import { categorizeLobbySessions, type LobbySessionLike } from './lobby-sessions'

const mk = (o: Partial<LobbySessionLike> & { id: string }): LobbySessionLike => ({
  scheduledAt: null,
  endedAt: null,
  status: 'scheduled',
  isVirtual: false,
  ...o,
})

describe('categorizeLobbySessions', () => {
  it('returns null next + empty past for no sessions', () => {
    expect(categorizeLobbySessions([])).toEqual({ nextSession: null, pastSessions: [] })
  })

  it('picks the soonest upcoming scheduled session as next', () => {
    const soon = mk({ id: 'soon', status: 'scheduled', scheduledAt: '2030-01-01T10:00:00Z' })
    const later = mk({ id: 'later', status: 'scheduled', scheduledAt: '2030-01-02T10:00:00Z' })
    const { nextSession } = categorizeLobbySessions([later, soon])
    expect(nextSession?.id).toBe('soon')
  })

  it('prefers a live session over a sooner scheduled one', () => {
    const live = mk({ id: 'live', status: 'active', scheduledAt: '2030-01-05T10:00:00Z' })
    const scheduled = mk({ id: 'sched', status: 'scheduled', scheduledAt: '2030-01-01T10:00:00Z' })
    const { nextSession } = categorizeLobbySessions([scheduled, live])
    expect(nextSession?.id).toBe('live')
  })

  it('lists ended sessions as past, newest first, and excludes them from next', () => {
    const older = mk({ id: 'old', status: 'ended', scheduledAt: '2020-01-01T10:00:00Z' })
    const newer = mk({ id: 'new', status: 'ended', scheduledAt: '2020-06-01T10:00:00Z' })
    const upcoming = mk({ id: 'up', status: 'scheduled', scheduledAt: '2030-01-01T10:00:00Z' })
    const { nextSession, pastSessions } = categorizeLobbySessions([older, upcoming, newer])
    expect(nextSession?.id).toBe('up')
    expect(pastSessions.map(s => s.id)).toEqual(['new', 'old'])
  })

  it('treats a real session with endedAt as past, but not a virtual one', () => {
    const realEnded = mk({
      id: 'r',
      status: 'scheduled',
      endedAt: '2020-01-01T11:00:00Z',
      isVirtual: false,
    })
    const virtual = mk({
      id: 'v',
      status: 'scheduled',
      endedAt: '2020-01-01T11:00:00Z',
      isVirtual: true,
    })
    const { pastSessions } = categorizeLobbySessions([realEnded, virtual])
    expect(pastSessions.map(s => s.id)).toEqual(['r'])
  })
})
