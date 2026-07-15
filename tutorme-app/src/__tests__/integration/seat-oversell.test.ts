/**
 * Integration test: group-seat oversell protection (PR #1104).
 *
 * Two students racing for the LAST seat must not both succeed. Drives the REAL
 * POST /api/group-sessions/[id]/join handler concurrently (auth mocked per
 * request via a header) so the payment-row-lock is actually exercised — a
 * regression that drops the transaction/lock would let this oversell.
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { and, eq, inArray } from 'drizzle-orm'

vi.mock('@/lib/auth', () => ({
  authOptions: {},
  // Return whichever student the request names — lets us fire concurrent joins
  // as different users through the real handler.
  getServerSession: vi.fn(async (_opts: unknown, req: Request) => ({
    user: { id: req.headers.get('x-test-user'), role: 'STUDENT' },
  })),
}))

import { NextRequest } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, groupSession, groupSessionParticipant } from '@/lib/db/schema'
import { countActiveSeats } from '@/lib/group-session/seats'
import { POST } from '@/app/api/group-sessions/[id]/join/route'

const stamp = Date.now()
const tutorId = crypto.randomUUID()
const s1 = crypto.randomUUID()
const s2 = crypto.randomUUID()
const userIds = [tutorId, s1, s2]
const GS = `oversell_gs_${stamp}`

function joinReq(studentId: string) {
  const req = new NextRequest(`http://localhost/api/group-sessions/${GS}/join`, {
    method: 'POST',
    headers: { 'x-test-user': studentId, 'content-type': 'application/json' },
  })
  return POST(req, { params: Promise.resolve({ id: GS }) })
}

describe('group-seat oversell protection', () => {
  beforeAll(async () => {
    await drizzleDb.insert(user).values(
      userIds.map((id, i) => ({
        userId: id,
        email: `os-${i}-${stamp}@ex.com`,
        role: i === 0 ? ('TUTOR' as const) : ('STUDENT' as const),
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as never
    )
    await drizzleDb.insert(groupSession).values({
      groupSessionId: GS,
      tutorId,
      title: 'Last-seat race',
      requestedDate: new Date('2027-09-01T00:00:00.000Z'),
      startTime: '15:00',
      endTime: '16:00',
      timezone: 'UTC',
      capacity: 1, // exactly one seat
      pricePerSeat: 20, // paid → POST reserves (no immediate admit)
      currency: 'USD',
      status: 'OPEN',
    } as never)
  })

  afterAll(async () => {
    await drizzleDb
      .delete(groupSessionParticipant)
      .where(eq(groupSessionParticipant.groupSessionId, GS))
    await drizzleDb.delete(groupSession).where(eq(groupSession.groupSessionId, GS))
    await drizzleDb.delete(user).where(inArray(user.userId, userIds))
    vi.restoreAllMocks()
  })

  it('two concurrent joins for a capacity-1 session grant exactly one seat', async () => {
    const [r1, r2] = await Promise.all([joinReq(s1), joinReq(s2)])
    const statuses = [r1.status, r2.status].sort()
    // one 200 (reserved), one 409 (full)
    expect(statuses).toEqual([200, 409])

    const active = await countActiveSeats(GS)
    expect(active).toBe(1) // NOT 2 — no oversell

    const reserved = await drizzleDb
      .select({ id: groupSessionParticipant.participantId })
      .from(groupSessionParticipant)
      .where(
        and(
          eq(groupSessionParticipant.groupSessionId, GS),
          inArray(groupSessionParticipant.status, ['RESERVED', 'PAID'])
        )
      )
    expect(reserved.length).toBe(1)
  })
})
