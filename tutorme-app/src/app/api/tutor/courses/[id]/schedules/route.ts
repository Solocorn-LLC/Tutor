/**
 * Course Schedule API
 * GET: List all schedules for a course
 * POST: Create a new schedule
 * PUT: Update a schedule
 * DELETE: Remove a schedule (only if no enrollments)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { verifyCourseOwnership } from '@/lib/api/course-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import { courseSchedule, course, calendarAvailability } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { notifyStudentsOfScheduleChange } from '@/lib/notifications/reschedule'
import {
  materializeScheduleSessions,
  clearFutureScheduleSessions,
} from '@/lib/sessions/materialize-schedule'
import crypto from 'crypto'

/**
 * Fetch the tutor's timezone + course display fields, then materialize a
 * schedule's future occurrences into real sessions. Shared by POST (create) and
 * PUT (edit). Returns the number of sessions created.
 */
async function materializeForSchedule(
  courseId: string,
  userId: string,
  scheduleId: string,
  slots: unknown,
  weeksToSchedule: unknown,
  maxStudents: unknown
): Promise<number> {
  const list = Array.isArray(slots) ? slots : []
  if (list.length === 0) return 0
  const [tzRow] = await drizzleDb
    .select({ timezone: calendarAvailability.timezone })
    .from(calendarAvailability)
    .where(eq(calendarAvailability.tutorId, userId))
    .limit(1)
  const [courseRow] = await drizzleDb
    .select({ name: course.name, categories: course.categories })
    .from(course)
    .where(eq(course.courseId, courseId))
    .limit(1)
  return materializeScheduleSessions({
    tutorId: userId,
    courseId,
    scheduleId,
    slots: list,
    weeksToSchedule: typeof weeksToSchedule === 'number' ? weeksToSchedule : 8,
    timezone: tzRow?.timezone || 'UTC',
    maxStudents: typeof maxStudents === 'number' ? maxStudents : null,
    title: courseRow?.name || 'Live Session',
    category: courseRow?.categories?.[0] || 'General',
  })
}

// GET all schedules for a course
export const GET = withAuth(
  async (req: NextRequest, session, context) => {
    const params = await context.params
    const courseId = params.id as string
    const userId = session.user.id

    try {
      const isOwner = await verifyCourseOwnership(courseId, userId)
      if (!isOwner) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      const rows = await drizzleDb
        .select({
          scheduleId: courseSchedule.scheduleId,
          courseId: courseSchedule.courseId,
          scheduleIndex: courseSchedule.scheduleIndex,
          name: courseSchedule.name,
          schedule: courseSchedule.schedule,
          weeksToSchedule: courseSchedule.weeksToSchedule,
          maxStudents: courseSchedule.maxStudents,
          enrolledCount: courseSchedule.enrolledCount,
          createdAt: courseSchedule.createdAt,
          updatedAt: courseSchedule.updatedAt,
        })
        .from(courseSchedule)
        .where(eq(courseSchedule.courseId, courseId))
        .orderBy(courseSchedule.scheduleIndex)

      return NextResponse.json({ schedules: rows })
    } catch (error: any) {
      console.error('[GET /api/tutor/courses/[id]/schedules] Error:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to load schedules' },
        { status: 500 }
      )
    }
  },
  { role: 'TUTOR' }
)

// POST create a new schedule
export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const params = await context.params
      const courseId = params.id as string
      const userId = session.user.id
      const body = await req.json().catch(() => ({}))

      try {
        const isOwner = await verifyCourseOwnership(courseId, userId)
        if (!isOwner) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // Find next schedule index
        const existing = await drizzleDb
          .select({ maxIndex: sql<number>`COALESCE(MAX(${courseSchedule.scheduleIndex}), 0)` })
          .from(courseSchedule)
          .where(eq(courseSchedule.courseId, courseId))

        const nextIndex = (existing[0]?.maxIndex ?? 0) + 1

        const newSchedule = await drizzleDb
          .insert(courseSchedule)
          .values({
            scheduleId: crypto.randomUUID(),
            courseId,
            scheduleIndex: nextIndex,
            schedule: body.schedule || [],
            weeksToSchedule: body.weeksToSchedule ?? 8,
            maxStudents: body.maxStudents ?? null,
            enrolledCount: 0,
          })
          .returning({
            scheduleId: courseSchedule.scheduleId,
            courseId: courseSchedule.courseId,
            scheduleIndex: courseSchedule.scheduleIndex,
            schedule: courseSchedule.schedule,
            weeksToSchedule: courseSchedule.weeksToSchedule,
            maxStudents: courseSchedule.maxStudents,
            enrolledCount: courseSchedule.enrolledCount,
            createdAt: courseSchedule.createdAt,
            updatedAt: courseSchedule.updatedAt,
          })

        // Materialize the schedule into real LiveSession + CalendarEvent rows so
        // it shows on the calendar (this endpoint previously only stored the
        // pattern, so schedules added here never appeared). Best-effort: the
        // schedule is already saved, so a materialization hiccup shouldn't fail
        // the request — the count is surfaced so the UI can warn if it's zero.
        let sessionsCreated = 0
        try {
          sessionsCreated = await materializeForSchedule(
            courseId,
            userId,
            newSchedule[0].scheduleId,
            body.schedule,
            body.weeksToSchedule,
            body.maxStudents
          )
        } catch (matErr) {
          console.error('[POST /api/tutor/courses/[id]/schedules] materialize failed:', matErr)
        }

        return NextResponse.json({ schedule: newSchedule[0], sessionsCreated })
      } catch (error: any) {
        console.error('[POST /api/tutor/courses/[id]/schedules] Error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to create schedule' },
          { status: 500 }
        )
      }
    },
    { role: 'TUTOR' }
  )
)

// PUT update a schedule
export const PUT = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const params = await context.params
      const courseId = params.id as string
      const userId = session.user.id
      const body = await req.json().catch(() => ({}))
      const scheduleId = body.scheduleId

      if (!scheduleId) {
        return NextResponse.json({ error: 'scheduleId is required' }, { status: 400 })
      }

      try {
        const isOwner = await verifyCourseOwnership(courseId, userId)
        if (!isOwner) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const updateData: Record<string, unknown> = {}
        if (body.schedule !== undefined) updateData.schedule = body.schedule
        if (body.weeksToSchedule !== undefined) updateData.weeksToSchedule = body.weeksToSchedule
        if (body.maxStudents !== undefined) updateData.maxStudents = body.maxStudents

        // Snapshot the current schedule so we only notify students when the
        // actual times change (not on a maxStudents rename or a no-op save).
        const [before] = await drizzleDb
          .select({ schedule: courseSchedule.schedule })
          .from(courseSchedule)
          .where(
            and(eq(courseSchedule.scheduleId, scheduleId), eq(courseSchedule.courseId, courseId))
          )
          .limit(1)

        const updated = await drizzleDb
          .update(courseSchedule)
          .set(updateData)
          .where(
            and(eq(courseSchedule.scheduleId, scheduleId), eq(courseSchedule.courseId, courseId))
          )
          .returning({
            scheduleId: courseSchedule.scheduleId,
            courseId: courseSchedule.courseId,
            scheduleIndex: courseSchedule.scheduleIndex,
            schedule: courseSchedule.schedule,
            weeksToSchedule: courseSchedule.weeksToSchedule,
            maxStudents: courseSchedule.maxStudents,
            enrolledCount: courseSchedule.enrolledCount,
            createdAt: courseSchedule.createdAt,
            updatedAt: courseSchedule.updatedAt,
          })

        if (updated.length === 0) {
          return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
        }

        // Notify enrolled students when the schedule times actually changed.
        // Best-effort — never blocks the save.
        const scheduleChanged =
          body.schedule !== undefined &&
          JSON.stringify(before?.schedule ?? null) !== JSON.stringify(body.schedule)
        let sessionsCreated = 0
        if (scheduleChanged) {
          const [row] = await drizzleDb
            .select({ name: course.name })
            .from(course)
            .where(eq(course.courseId, courseId))
            .limit(1)
          await notifyStudentsOfScheduleChange({ courseId, courseName: row?.name })

          // Re-materialize: retire the old upcoming sessions for this schedule and
          // create fresh ones at the new times. Clearing first avoids duplicates.
          // Best-effort — the schedule row is already updated.
          try {
            await clearFutureScheduleSessions(scheduleId)
            sessionsCreated = await materializeForSchedule(
              courseId,
              userId,
              scheduleId,
              body.schedule,
              body.weeksToSchedule ?? updated[0].weeksToSchedule,
              body.maxStudents ?? updated[0].maxStudents
            )
          } catch (matErr) {
            console.error('[PUT /api/tutor/courses/[id]/schedules] re-materialize failed:', matErr)
          }
        }

        return NextResponse.json({ schedule: updated[0], sessionsCreated })
      } catch (error: any) {
        console.error('[PUT /api/tutor/courses/[id]/schedules] Error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to update schedule' },
          { status: 500 }
        )
      }
    },
    { role: 'TUTOR' }
  )
)

// DELETE a schedule
export const DELETE = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const params = await context.params
      const courseId = params.id as string
      const userId = session.user.id
      const { searchParams } = new URL(req.url)
      const scheduleId = searchParams.get('scheduleId')

      if (!scheduleId) {
        return NextResponse.json({ error: 'scheduleId is required' }, { status: 400 })
      }

      try {
        const isOwner = await verifyCourseOwnership(courseId, userId)
        if (!isOwner) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // Check if schedule has enrollments
        const [scheduleRow] = await drizzleDb
          .select({ enrolledCount: courseSchedule.enrolledCount })
          .from(courseSchedule)
          .where(
            and(eq(courseSchedule.scheduleId, scheduleId), eq(courseSchedule.courseId, courseId))
          )
          .limit(1)

        if (!scheduleRow) {
          return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
        }

        if (scheduleRow.enrolledCount > 0) {
          return NextResponse.json(
            { error: 'Cannot delete schedule with enrolled students' },
            { status: 409 }
          )
        }

        // Retire this schedule's upcoming sessions so they leave the calendar too
        // (not just the pattern row). Best-effort.
        try {
          await clearFutureScheduleSessions(scheduleId)
        } catch (clearErr) {
          console.error(
            '[DELETE /api/tutor/courses/[id]/schedules] clear sessions failed:',
            clearErr
          )
        }

        await drizzleDb
          .delete(courseSchedule)
          .where(
            and(eq(courseSchedule.scheduleId, scheduleId), eq(courseSchedule.courseId, courseId))
          )

        return NextResponse.json({ success: true })
      } catch (error: any) {
        console.error('[DELETE /api/tutor/courses/[id]/schedules] Error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to delete schedule' },
          { status: 500 }
        )
      }
    },
    { role: 'TUTOR' }
  )
)
