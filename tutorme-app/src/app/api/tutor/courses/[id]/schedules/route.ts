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
import {
  courseSchedule,
  course,
  calendarAvailability,
  courseVariant,
  liveSession,
  courseEnrollment,
} from '@/lib/db/schema'
import { eq, and, sql, lte } from 'drizzle-orm'
import { notifyStudentsOfScheduleChange } from '@/lib/notifications/reschedule'
import {
  materializeScheduleSessions,
  clearFutureScheduleSessions,
  clearStaleScheduleSessions,
  generateScheduleSessionDates,
  clampWeeksToSchedule,
  type MaterializeScheduleResult,
} from '@/lib/sessions/materialize-schedule'
import crypto from 'crypto'

interface MaterializeForScheduleResult extends MaterializeScheduleResult {
  /** Sessions soft-retired because their slot disappeared from the pattern. */
  sessionsRetired: number
}

/**
 * Canonical structural comparison of two schedule slot lists. Postgres jsonb
 * does not preserve object key order, so JSON.stringify equality flags spurious
 * "changes" on a byte-identical re-save. Normalize both sides to sorted
 * canonical tuples and compare those instead; malformed entries (non-objects
 * without a startTime) are dropped from both sides.
 */
function slotsEqual(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): string => {
    if (!Array.isArray(value)) return ''
    return value
      .filter(
        (slot): slot is Record<string, unknown> =>
          typeof slot === 'object' &&
          slot !== null &&
          typeof (slot as { startTime?: unknown }).startTime === 'string'
      )
      .map(slot =>
        JSON.stringify({
          kind: slot.date ? 'date' : 'weekly',
          day: slot.date ?? slot.dayOfWeek ?? null,
          startTime: slot.startTime,
          durationMinutes: slot.durationMinutes ?? null,
        })
      )
      .sort()
      .join('|')
  }
  return canonical(a) === canonical(b)
}

/**
 * Fetch the tutor's timezone + course display fields, then materialize a
 * schedule's future occurrences into real sessions. Shared by POST (create) and
 * PUT (edit). With `retireStale`, sessions whose slot vanished from the pattern
 * are retired first so unchanged slots keep their existing sessions.
 */
async function materializeForSchedule(
  courseId: string,
  userId: string,
  scheduleId: string,
  slots: unknown,
  weeksToSchedule: unknown,
  maxStudents: unknown,
  opts: { retireStale?: boolean } = {}
): Promise<MaterializeForScheduleResult> {
  const list = Array.isArray(slots) ? slots : []
  if (list.length === 0) {
    // The new pattern generates nothing — every future session this schedule
    // previously materialized is now stale, so retire them all (an empty
    // keep-list means "keep none"). Without this, PUT { schedule: [] } left
    // the old future sessions 'scheduled' forever.
    let sessionsRetired = 0
    if (opts.retireStale) {
      sessionsRetired = await clearStaleScheduleSessions(scheduleId, [])
    }
    return { created: 0, kept: 0, skippedSlots: [], beyondHorizon: 0, sessionsRetired }
  }
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
  const timezone = tzRow?.timezone || 'UTC'
  const weeks = clampWeeksToSchedule(weeksToSchedule)
  const dates = generateScheduleSessionDates(list, weeks, timezone)
  let sessionsRetired = 0
  if (opts.retireStale) {
    sessionsRetired = await clearStaleScheduleSessions(
      scheduleId,
      dates.map(d => d.scheduledAt)
    )
  }
  const result = await materializeScheduleSessions({
    tutorId: userId,
    courseId,
    scheduleId,
    slots: list,
    weeksToSchedule: weeks,
    timezone,
    maxStudents: typeof maxStudents === 'number' ? maxStudents : null,
    title: courseRow?.name || 'Live Session',
    category: courseRow?.categories?.[0] || 'General',
    dates,
    // Adding/editing a schedule is an explicit tutor action that re-affirms
    // the whole pattern: a slot the pattern generates must exist, even if a
    // previous edit retired a row at the same instant (e.g. the slot was
    // moved away and then moved back).
    recreateRetiredSlots: true,
  })
  return { ...result, sessionsRetired }
}

/**
 * Guard: schedules must not be added, edited, or removed once a course is
 * published. This endpoint is keyed by TEMPLATE course ids (templates are never
 * themselves published — their variants are), so besides checking the passed
 * course's own flag we also resolve a passed variant id back to its template
 * and reject the mutation when the template has ANY published variant. This
 * mirrors the publish route, which does not allow schedule changes for
 * already-published variants.
 */
async function guardUnpublished(courseId: string): Promise<NextResponse | null> {
  const [row] = await drizzleDb
    .select({ isPublished: course.isPublished })
    .from(course)
    .where(eq(course.courseId, courseId))
    .limit(1)

  let templateId = courseId
  const asVariant = await drizzleDb
    .select({ templateCourseId: courseVariant.templateCourseId })
    .from(courseVariant)
    .where(eq(courseVariant.publishedCourseId, courseId))
    .limit(1)
  if (asVariant.length > 0) templateId = asVariant[0].templateCourseId

  const [publishedVariant] = await drizzleDb
    .select({ publishedCourseId: courseVariant.publishedCourseId })
    .from(courseVariant)
    .innerJoin(course, eq(course.courseId, courseVariant.publishedCourseId))
    .where(and(eq(courseVariant.templateCourseId, templateId), eq(course.isPublished, true)))
    .limit(1)

  if (row?.isPublished || templateId !== courseId || publishedVariant) {
    return NextResponse.json(
      { error: 'Schedules cannot be changed after publishing. Unpublish or create a new variant.' },
      { status: 409 }
    )
  }
  return null
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

        const publishedGuard = await guardUnpublished(courseId)
        if (publishedGuard) return publishedGuard

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
            weeksToSchedule: clampWeeksToSchedule(body.weeksToSchedule),
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
        let skippedSlots: Array<{
          scheduledAt: Date
          durationMinutes: number
          reason: string
        }> = []
        try {
          const mat = await materializeForSchedule(
            courseId,
            userId,
            newSchedule[0].scheduleId,
            body.schedule,
            body.weeksToSchedule,
            body.maxStudents
          )
          sessionsCreated = mat.created
          skippedSlots = mat.skippedSlots
        } catch (matErr) {
          console.error('[POST /api/tutor/courses/[id]/schedules] materialize failed:', matErr)
        }

        return NextResponse.json({ schedule: newSchedule[0], sessionsCreated, skippedSlots })
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

        const publishedGuard = await guardUnpublished(courseId)
        if (publishedGuard) return publishedGuard

        const updateData: Record<string, unknown> = {}
        if (body.schedule !== undefined) updateData.schedule = body.schedule
        if (body.weeksToSchedule !== undefined) updateData.weeksToSchedule = body.weeksToSchedule
        if (body.maxStudents !== undefined) updateData.maxStudents = body.maxStudents

        // Snapshot the current schedule so we only notify students when the
        // actual times change (not on a maxStudents rename or a no-op save).
        const [before] = await drizzleDb
          .select({
            schedule: courseSchedule.schedule,
            weeksToSchedule: courseSchedule.weeksToSchedule,
          })
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

        // Notify enrolled students when the schedule times actually changed
        // (structural comparison — jsonb key order is not stable) or when the
        // materialization horizon moved. Best-effort — never blocks the save.
        const scheduleChanged =
          body.schedule !== undefined && !slotsEqual(before?.schedule ?? null, body.schedule)
        const weeksChanged =
          body.weeksToSchedule != null && body.weeksToSchedule !== before?.weeksToSchedule
        let sessionsCreated = 0
        let sessionsKept = 0
        let sessionsRetired = 0
        let skippedSlots: Array<{
          scheduledAt: Date
          durationMinutes: number
          reason: string
        }> = []
        let materializeSucceeded = false
        if (scheduleChanged || weeksChanged) {
          // Re-materialize: retire only the sessions whose slot vanished from the
          // pattern (unchanged slots keep their sessions and lesson assignments),
          // then materialize the pattern — the duplicate guard skips slots
          // that still have a live session. Best-effort — the schedule row is
          // already updated.
          try {
            const mat = await materializeForSchedule(
              courseId,
              userId,
              scheduleId,
              body.schedule ?? updated[0].schedule,
              body.weeksToSchedule ?? updated[0].weeksToSchedule,
              body.maxStudents ?? updated[0].maxStudents,
              { retireStale: true }
            )
            sessionsCreated = mat.created
            sessionsKept = mat.kept
            sessionsRetired = mat.sessionsRetired
            skippedSlots = mat.skippedSlots
            materializeSucceeded = true
          } catch (matErr) {
            console.error('[PUT /api/tutor/courses/[id]/schedules] re-materialize failed:', matErr)
          }

          // Only tell students the schedule changed once the sessions actually
          // reflect it — notifying before a failed re-materialize would report
          // a change that never happened.
          if (materializeSucceeded) {
            const [row] = await drizzleDb
              .select({ name: course.name })
              .from(course)
              .where(eq(course.courseId, courseId))
              .limit(1)
            await notifyStudentsOfScheduleChange({ courseId, courseName: row?.name })
          }
        }

        return NextResponse.json({
          schedule: updated[0],
          sessionsCreated,
          sessionsKept,
          sessionsRetired,
          skippedSlots,
        })
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

        const publishedGuard = await guardUnpublished(courseId)
        if (publishedGuard) return publishedGuard

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

        // History guard: past sessions and enrollments reference this schedule
        // via FK set-null, so hard-deleting would wipe their grouping. When
        // history exists, keep the row as scaffolding with an empty slot
        // pattern instead (future sessions are already retired above).
        const [pastSessionRow] = await drizzleDb
          .select({ sessionId: liveSession.sessionId })
          .from(liveSession)
          .where(
            and(eq(liveSession.scheduleId, scheduleId), lte(liveSession.scheduledAt, new Date()))
          )
          .limit(1)
        const [enrollmentRefRow] = await drizzleDb
          .select({ enrollmentId: courseEnrollment.enrollmentId })
          .from(courseEnrollment)
          .where(eq(courseEnrollment.scheduleId, scheduleId))
          .limit(1)

        if (pastSessionRow || enrollmentRefRow) {
          await drizzleDb
            .update(courseSchedule)
            .set({ schedule: [], updatedAt: new Date() })
            .where(
              and(eq(courseSchedule.scheduleId, scheduleId), eq(courseSchedule.courseId, courseId))
            )
          return NextResponse.json({ success: true })
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
