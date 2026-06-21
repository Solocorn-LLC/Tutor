/**
 * Student date-specific availability exceptions.
 *  GET    -> { exceptions: [...] }
 *  POST   -> upsert one exception { date, isAvailable, startTime?, endTime?, reason? }
 *  DELETE -> remove one exception { id }
 *
 * Mirrors /api/tutor/calendar/exceptions but keyed to the student.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import crypto from 'crypto'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { studentAvailabilityException } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  async (_req: NextRequest, session) => {
    const exceptions = await drizzleDb
      .select()
      .from(studentAvailabilityException)
      .where(eq(studentAvailabilityException.studentId, session.user.id))
    return NextResponse.json({ exceptions })
  },
  { role: 'STUDENT' }
)

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
      const studentId = session.user.id
      const body = await req.json().catch(() => null)
      const dateRaw = body?.date
      const date = dateRaw ? new Date(dateRaw) : null
      if (!date || Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: 'A valid date is required' }, { status: 400 })
      }
      const isAvailable = body?.isAvailable === true
      const startTime = typeof body?.startTime === 'string' ? body.startTime : null
      const endTime = typeof body?.endTime === 'string' ? body.endTime : null
      const reason = typeof body?.reason === 'string' ? body.reason : null

      await drizzleDb
        .insert(studentAvailabilityException)
        .values({
          exceptionId: crypto.randomUUID(),
          studentId,
          date,
          isAvailable,
          startTime,
          endTime,
          reason,
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            studentAvailabilityException.studentId,
            studentAvailabilityException.date,
            studentAvailabilityException.startTime,
          ],
          set: { isAvailable, endTime, reason },
        })

      return NextResponse.json({ success: true })
    },
    { role: 'STUDENT' }
  )
)

export const DELETE = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
      const studentId = session.user.id
      const body = await req.json().catch(() => null)
      const id = typeof body?.id === 'string' ? body.id : ''
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
      await drizzleDb
        .delete(studentAvailabilityException)
        .where(
          and(
            eq(studentAvailabilityException.exceptionId, id),
            eq(studentAvailabilityException.studentId, studentId)
          )
        )
      return NextResponse.json({ success: true })
    },
    { role: 'STUDENT' }
  )
)
