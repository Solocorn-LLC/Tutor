import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  rowsQueue: [] as any[][],
  dbMock: {
    select: vi.fn(),
  },
}))

vi.mock('@/lib/db/drizzle', () => ({
  drizzleDb: mocks.dbMock,
}))

import { canCreateConversation, canTutorChatWith, followEachOther } from './relationships'

/** Rows the next query's where() clause will resolve to. */
function queueRows(...results: any[][]) {
  mocks.rowsQueue.push(...results)
}

function nextRows(): any[] {
  return mocks.rowsQueue.shift() ?? []
}

beforeEach(() => {
  mocks.rowsQueue = []
  mocks.dbMock.select.mockClear()
  mocks.dbMock.select.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        const rows = nextRows()
        const thenable: any = Promise.resolve(rows)
        // hasBookedOneOnOne chains .limit(1) before awaiting; the other
        // helpers await the where() result directly.
        thenable.limit = () => thenable
        return thenable
      }),
    })),
  }))
})

describe('followEachOther', () => {
  it('returns true when both follow directions exist', async () => {
    queueRows([{ followerId: 'a' }, { followerId: 'b' }])
    expect(await followEachOther('a', 'b')).toBe(true)
  })

  it('returns false when only one direction exists', async () => {
    queueRows([{ followerId: 'a' }])
    expect(await followEachOther('a', 'b')).toBe(false)
  })

  it('returns false when there is no follow at all', async () => {
    queueRows([])
    expect(await followEachOther('a', 'b')).toBe(false)
  })
})

describe('canTutorChatWith (existing-thread eligibility for a tutor)', () => {
  it('allows a tutor counterpart only on mutual follow', async () => {
    queueRows([{ followerId: 'a' }, { followerId: 'b' }])
    expect(await canTutorChatWith('a', { id: 'b', role: 'TUTOR' })).toBe(true)

    queueRows([{ followerId: 'a' }])
    expect(await canTutorChatWith('a', { id: 'b', role: 'TUTOR' })).toBe(false)
  })

  it('allows a student counterpart only with a confirmed booking', async () => {
    queueRows([{ requestId: 'r1' }])
    expect(await canTutorChatWith('t1', { id: 's1', role: 'STUDENT' })).toBe(true)

    queueRows([])
    expect(await canTutorChatWith('t1', { id: 's1', role: 'STUDENT' })).toBe(false)
  })

  it('passes other roles through without querying', async () => {
    expect(await canTutorChatWith('t1', { id: 'p1', role: 'PARENT' })).toBe(true)
    expect(mocks.dbMock.select).not.toHaveBeenCalled()
  })
})

describe('canCreateConversation (new-thread gate)', () => {
  it('blocks tutor↔tutor without mutual follow', async () => {
    queueRows([{ followerId: 'a' }])
    const gate = await canCreateConversation({ id: 'a', role: 'TUTOR' }, { id: 'b', role: 'TUTOR' })
    expect(gate.allowed).toBe(false)
    if (!gate.allowed) expect(gate.reason).toMatch(/following each other/)
  })

  it('allows tutor↔tutor with mutual follow', async () => {
    queueRows([{ followerId: 'a' }, { followerId: 'b' }])
    const gate = await canCreateConversation({ id: 'a', role: 'TUTOR' }, { id: 'b', role: 'TUTOR' })
    expect(gate.allowed).toBe(true)
  })
})
