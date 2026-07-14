/**
 * Integration test: group-session lifecycle sweeps.
 *
 * - expireStaleGroupSeats: a RESERVED seat left unpaid past the window is
 *   CANCELLED, freeing capacity and re-opening a FULL session; a fresh
 *   reservation is left alone.
 * - completeFinishedGroupSessions: an OPEN session past its end → COMPLETED.
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import crypto from 'crypto'
import { eq, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, groupSession, groupSessionParticipant } from '@/lib/db/schema'
import { expireStaleGroupSeats } from '@/lib/group-session/expire-seats'
import { completeFinishedGroupSessions } from '@/lib/group-session/complete'

const stamp = Date.now()
const tutorId = crypto.randomUUID()
const studentA = crypto.randomUUID()
const studentB = crypto.randomUUID()
const userIds = [tutorId, studentA, studentB]

const gsFull = `gs_full_${stamp}` // FULL, holds a stale reservation
const gsOpen = `gs_open_${stamp}` // OPEN, holds a fresh reservation
const gsPast = `gs_past_${stamp}` // OPEN, already ended
const gsIds = [gsFull, gsOpen, gsPast]

const staleSeat = `seat_stale_${stamp}`
const freshSeat = `seat_fresh_${stamp}`

function gs(id: string, extra: Record<string, unknown>) {
  return {
    groupSessionId: id,
    tutorId,
    title: 'Algebra clinic',
    requestedDate: new Date('2026-08-01T00:00:00.000Z'),
    startTime: '15:00',
    endTime: '16:00',
    timezone: 'UTC',
    capacity: 1,
    pricePerSeat: 20,
    status: 'OPEN',
    ...extra,
  }
}

describe('group-session lifecycle sweeps', () => {
  beforeAll(async () => {
    const now = Date.now()
    await drizzleDb.insert(user).values(
      userIds.map((id, i) => ({
        userId: id,
        email: `gs-${i}-${stamp}@ex.com`,
        role: i === 0 ? ('TUTOR' as const) : ('STUDENT' as const),
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    )
    await drizzleDb.insert(groupSession).values([
      gs(gsFull, { status: 'FULL' }),
      gs(gsOpen, { status: 'OPEN' }),
      // Ended days ago (past requestedDate + past wall-clock end).
      gs(gsPast, { status: 'OPEN', requestedDate: new Date('2026-07-10T00:00:00.000Z') }),
    ])
    await drizzleDb.insert(groupSessionParticipant).values([
      // Reserved 40 min ago, never paid → should expire.
      {
        participantId: staleSeat,
        groupSessionId: gsFull,
        studentId: studentA,
        status: 'RESERVED',
        reservedAt: new Date(now - 40 * 60 * 1000),
      },
      // Reserved just now → should survive.
      {
        participantId: freshSeat,
        groupSessionId: gsOpen,
        studentId: studentB,
        status: 'RESERVED',
        reservedAt: new Date(now),
      },
    ])
  })

  afterAll(async () => {
    await drizzleDb
      .delete(groupSessionParticipant)
      .where(inArray(groupSessionParticipant.participantId, [staleSeat, freshSeat]))
    await drizzleDb.delete(groupSession).where(inArray(groupSession.groupSessionId, gsIds))
    await drizzleDb.delete(user).where(inArray(user.userId, userIds))
  })

  it('releases a stale reservation, re-opens the FULL session, keeps fresh ones', async () => {
    const released = await expireStaleGroupSeats()
    expect(released).toBeGreaterThanOrEqual(1)

    const [stale] = await drizzleDb
      .select({ status: groupSessionParticipant.status })
      .from(groupSessionParticipant)
      .where(eq(groupSessionParticipant.participantId, staleSeat))
    expect(stale.status).toBe('CANCELLED')

    const [full] = await drizzleDb
      .select({ status: groupSession.status })
      .from(groupSession)
      .where(eq(groupSession.groupSessionId, gsFull))
    expect(full.status).toBe('OPEN')

    const [fresh] = await drizzleDb
      .select({ status: groupSessionParticipant.status })
      .from(groupSessionParticipant)
      .where(eq(groupSessionParticipant.participantId, freshSeat))
    expect(fresh.status).toBe('RESERVED')
  })

  it('marks a finished group session COMPLETED', async () => {
    await completeFinishedGroupSessions({ tutorId })

    const [past] = await drizzleDb
      .select({ status: groupSession.status })
      .from(groupSession)
      .where(eq(groupSession.groupSessionId, gsPast))
    expect(past.status).toBe('COMPLETED')

    // A future session is untouched.
    const [open] = await drizzleDb
      .select({ status: groupSession.status })
      .from(groupSession)
      .where(eq(groupSession.groupSessionId, gsOpen))
    expect(open.status).toBe('OPEN')
  })
})
