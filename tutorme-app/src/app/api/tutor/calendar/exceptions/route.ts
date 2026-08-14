/**
 * Tutor Calendar Exceptions API
 * POST /api/tutor/calendar/exceptions - Create exception (block/unblock specific dates)
 * GET /api/tutor/calendar/exceptions - List exceptions
 *
 * Used to block specific dates or override recurring availability
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { calendarException } from '@/lib/db/schema'
import { eq, and, asc, gte, lte, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid } from 'nanoid'

const ExceptionSchema = z.object({
  date: z.string().datetime(),
  isAvailable: z.boolean().default(false),
  startTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .optional(),
  endTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .optional(),
  reason: z.string().optional(),
})

export const GET = withAuth(
  async (req: NextRequest, session) => {
    const tutorId = session.user.id
    const { searchParams } = new URL(req.url)

    const start = searchParams.get('start')
    const end = searchParams.get('end')

    try {
      const conditions = [eq(calendarException.tutorId, tutorId)]
      if (start) conditions.push(gte(calendarException.date, new Date(start)))
      if (end) conditions.push(lte(calendarException.date, new Date(end)))

      const exceptions = await drizzleDb
        .select()
        .from(calendarException)
        .where(and(...conditions))
        .orderBy(asc(calendarException.date))

      return NextResponse.json({ exceptions })
    } catch (error) {
      console.error('Fetch exceptions error:', error)
      return handleApiError(
        error,
        'Failed to fetch exceptions',
        'api/tutor/calendar/exceptions/route.ts'
      )
    }
  },
  { role: 'TUTOR' }
)

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
    const tutorId = session.user.id

    try {
      const body = await req.json()
      const validation = ExceptionSchema.safeParse(body)

      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid request', details: validation.error.format() },
          { status: 400 }
        )
      }

      const data = validation.data

      if (data.startTime && data.endTime) {
        if (data.startTime >= data.endTime) {
          return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
        }
      }

      const date = new Date(data.date)
      date.setUTCHours(0, 0, 0, 0)

      const startTimeVal = data.startTime ?? null
      const endTimeVal = data.endTime ?? null

      const existingWhere =
        startTimeVal === null
          ? and(
              eq(calendarException.tutorId, tutorId),
              eq(calendarException.date, date),
              isNull(calendarException.startTime)
            )
          : and(
              eq(calendarException.tutorId, tutorId),
              eq(calendarException.date, date),
              eq(calendarException.startTime, startTimeVal)
            )
      const [existing] = await drizzleDb
        .select()
        .from(calendarException)
        .where(existingWhere)
        .limit(1)

      if (existing) {
        const [updated] = await drizzleDb
          .update(calendarException)
          .set({
            isAvailable: data.isAvailable,
            reason: data.reason ?? existing.reason,
          })
          .where(eq(calendarException.exceptionId, existing.exceptionId))
          .returning()
        return NextResponse.json({ exception: updated })
      }

      const [created] = await drizzleDb
        .insert(calendarException)
        .values({
          exceptionId: nanoid(),
          tutorId,
          date,
          isAvailable: data.isAvailable,
          startTime: startTimeVal,
          endTime: endTimeVal,
          reason: data.reason,
        })
        .returning()

      return NextResponse.json({ exception: created! }, { status: 201 })
    } catch (error: any) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Exception already exists for this date and time' },
          { status: 409 }
        )
      }
      console.error('Create exception error:', error)
      return handleApiError(
        error,
        'Failed to create exception',
        'api/tutor/calendar/exceptions/route.ts'
      )
    }
  },
  { role: 'TUTOR' }
  )
)

export const PUT = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
    const tutorId = session.user.id

    try {
      const body = await req.json()
      const { dates, isAvailable = false, reason } = body

      if (!Array.isArray(dates) || dates.length === 0) {
        return NextResponse.json({ error: 'Dates array is required' }, { status: 400 })
      }

      const results = []
      for (const dateStr of dates) {
        const date = new Date(dateStr)
        date.setUTCHours(0, 0, 0, 0)

        const [existing] = await drizzleDb
          .select()
          .from(calendarException)
          .where(
            and(
              eq(calendarException.tutorId, tutorId),
              eq(calendarException.date, date),
              isNull(calendarException.startTime)
            )
          )
          .limit(1)

        if (existing) {
          const [updated] = await drizzleDb
            .update(calendarException)
            .set({ isAvailable, reason })
            .where(eq(calendarException.exceptionId, existing.exceptionId))
            .returning()
          if (updated) results.push(updated)
        } else {
          const [created] = await drizzleDb
            .insert(calendarException)
            .values({
              exceptionId: nanoid(),
              tutorId,
              date,
              isAvailable,
              reason,
            })
            .returning()
          if (created) results.push(created)
        }
      }

      return NextResponse.json({
        exceptions: results,
        count: results.length,
      })
    } catch (error) {
      console.error('Bulk create exceptions error:', error)
      return handleApiError(
        error,
        'Failed to create exceptions',
        'api/tutor/calendar/exceptions/route.ts'
      )
    }
  },
  { role: 'TUTOR' }
  )
)
