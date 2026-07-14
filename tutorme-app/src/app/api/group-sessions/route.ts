/**
 * Group 1-on-1 sessions (tutor-hosted, per-seat).
 *
 * POST  { title, description?, date, startTime, endTime, capacity, pricePerSeat } →
 *       a tutor creates an open group session (validates + conflict-checks its
 *       slot, then provisions a shared LiveSession/room with `capacity` seats).
 * GET   ?tutorId=…  → OPEN upcoming sessions for that tutor (+ seatsLeft), for
 *                     students to browse.
 * GET   (as tutor, no tutorId) → the caller's own group sessions (+ seatsLeft).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { drizzleDb } from '@/lib/db/drizzle'
import { groupSession, profile } from '@/lib/db/schema'
import { createSession } from '@/lib/sessions/create-session'
import { dailyProvider } from '@/lib/video/daily-provider'
import { findConflicts } from '@/lib/schedule/conflicts'
import { slotInstants, requestedDateFromString } from '@/lib/one-on-one/time'
import { countActiveSeats } from '@/lib/group-session/seats'

const createSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  // 1 seat = a true 1-on-1 (only one student can sign up); up to 50 for a group.
  capacity: z.number().int().min(1).max(50),
  pricePerSeat: z.number().min(0).max(100000),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions, req)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'TUTOR') {
      return NextResponse.json({ error: 'Only tutors can host group sessions' }, { status: 403 })
    }

    const body = createSchema.parse(await req.json())
    if (body.endTime <= body.startTime) {
      return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
    }

    const [tutorProfile] = await drizzleDb
      .select({
        oneOnOneEnabled: profile.oneOnOneEnabled,
        currency: profile.currency,
        timezone: profile.timezone,
        bufferMinutes: profile.bufferMinutes,
      })
      .from(profile)
      .where(eq(profile.userId, session.user.id))
      .limit(1)
    if (!tutorProfile || tutorProfile.oneOnOneEnabled === false) {
      return NextResponse.json(
        { error: 'Enable 1-on-1 sessions in your settings before hosting a group session.' },
        { status: 400 }
      )
    }

    const timezone = tutorProfile.timezone || 'UTC'
    const { start, end } = slotInstants(body.date, body.startTime, body.endTime, timezone)
    if (start.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Pick a time in the future' }, { status: 400 })
    }

    // The slot must be free on the tutor's own calendar (buffer included).
    const conflicts = await findConflicts(session.user.id, start, end, {
      bufferMinutes: tutorProfile.bufferMinutes ?? 0,
    })
    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: 'That time conflicts with an existing session on your calendar.' },
        { status: 409 }
      )
    }

    const groupSessionId = nanoid()
    const durationMinutes = Math.max(
      15,
      Math.round((end.getTime() - start.getTime()) / 60_000) || 60
    )

    const created = await drizzleDb.transaction(async tx => {
      // Room fits the tutor + every seat.
      const room = await dailyProvider.createRoom(`group-${groupSessionId}`, {
        maxParticipants: body.capacity + 1,
        durationMinutes,
      })
      const { liveSession: live, calendarEvent: event } = await createSession(
        {
          tutorId: session.user.id,
          title: body.title,
          scheduledAt: start,
          durationMinutes,
          category: 'Consultation',
          type: 'ONE_ON_ONE',
          maxStudents: body.capacity,
          description: body.description,
          timezone,
          existingRoom: room,
        },
        tx
      )

      const [row] = await tx
        .insert(groupSession)
        .values({
          groupSessionId,
          tutorId: session.user.id,
          title: body.title,
          description: body.description ?? null,
          requestedDate: requestedDateFromString(body.date),
          startTime: body.startTime,
          endTime: body.endTime,
          timezone,
          durationMinutes,
          capacity: body.capacity,
          pricePerSeat: body.pricePerSeat,
          currency: tutorProfile.currency || 'USD',
          status: 'OPEN',
          calendarEventId: event.eventId,
          liveSessionId: live.sessionId,
        })
        .returning()
      return row
    })

    return NextResponse.json({ success: true, groupSession: created })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    console.error('group session create failed:', err)
    return NextResponse.json({ error: 'Failed to create group session' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tutorId = new URL(req.url).searchParams.get('tutorId')

  // Student browsing a tutor's open, upcoming sessions.
  if (tutorId) {
    const rows = await drizzleDb
      .select()
      .from(groupSession)
      .where(
        and(
          eq(groupSession.tutorId, tutorId),
          inArray(groupSession.status, ['OPEN', 'FULL']),
          gte(groupSession.requestedDate, requestedDateFromString(todayUtc()))
        )
      )
      .orderBy(desc(groupSession.requestedDate))
    const withSeats = await withSeatsLeft(rows)
    return NextResponse.json({ sessions: withSeats })
  }

  // Tutor viewing their own sessions.
  if (session.user.role !== 'TUTOR') {
    return NextResponse.json({ error: 'tutorId required' }, { status: 400 })
  }
  const rows = await drizzleDb
    .select()
    .from(groupSession)
    .where(eq(groupSession.tutorId, session.user.id))
    .orderBy(desc(groupSession.requestedDate))
  return NextResponse.json({ sessions: await withSeatsLeft(rows) })
}

function todayUtc(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(
    now.getUTCDate()
  ).padStart(2, '0')}`
}

async function withSeatsLeft<T extends { groupSessionId: string; capacity: number }>(
  rows: T[]
): Promise<(T & { seatsLeft: number })[]> {
  return Promise.all(
    rows.map(async r => ({
      ...r,
      seatsLeft: Math.max(0, r.capacity - (await countActiveSeats(r.groupSessionId))),
    }))
  )
}
