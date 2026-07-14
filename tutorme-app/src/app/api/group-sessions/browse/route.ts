/**
 * GET /api/group-sessions/browse
 *
 * All OPEN, upcoming group sessions across every tutor that still has a seat —
 * the platform-wide browse feed (the tutorId-scoped GET only lists one tutor's).
 * Each row carries the host's name/username/avatar so students can book or open
 * the tutor's profile.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq, gte } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { groupSession, profile, user } from '@/lib/db/schema'
import { countActiveSeats } from '@/lib/group-session/seats'
import { expireStaleGroupSeats } from '@/lib/group-session/expire-seats'

export const GET = withAuth(async (_req: NextRequest) => {
  // Release abandoned reservations first so seat counts are accurate.
  await expireStaleGroupSeats().catch(() => {})

  const now = new Date()
  const startOfTodayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )

  const rows = await drizzleDb
    .select({
      groupSessionId: groupSession.groupSessionId,
      title: groupSession.title,
      description: groupSession.description,
      requestedDate: groupSession.requestedDate,
      startTime: groupSession.startTime,
      endTime: groupSession.endTime,
      timezone: groupSession.timezone,
      capacity: groupSession.capacity,
      pricePerSeat: groupSession.pricePerSeat,
      currency: groupSession.currency,
      status: groupSession.status,
      tutorId: groupSession.tutorId,
      tutorName: profile.name,
      tutorUsername: profile.username,
      tutorImage: user.image,
    })
    .from(groupSession)
    .leftJoin(profile, eq(profile.userId, groupSession.tutorId))
    .leftJoin(user, eq(user.userId, groupSession.tutorId))
    .where(and(eq(groupSession.status, 'OPEN'), gte(groupSession.requestedDate, startOfTodayUtc)))
    .orderBy(asc(groupSession.requestedDate))
    .limit(100)

  const withSeats = await Promise.all(
    rows.map(async r => ({
      ...r,
      seatsLeft: Math.max(0, r.capacity - (await countActiveSeats(r.groupSessionId))),
    }))
  )

  // Only surface sessions a student can actually book.
  return NextResponse.json({ sessions: withSeats.filter(s => s.seatsLeft > 0) })
})
