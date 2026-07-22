import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { verifyCourseOwnership } from '@/lib/api/course-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  course,
  courseLesson,
  courseVariant,
  courseSchedule,
  liveSession,
  tutorAsset,
  calendarEvent,
  calendarAvailability,
  calendarException,
  oneOnOneBookingRequest,
  deployedMaterial,
} from '@/lib/db/schema'
import { dailyProvider } from '@/lib/video/daily-provider'
import { createSession } from '@/lib/sessions/create-session'
import { LIVE_SESSION_OPEN_STATUSES } from '@/lib/sessions/live-session-status'
import { eq, and, inArray, gte, lte, lt, gt, sql, or, isNull } from 'drizzle-orm'
import crypto from 'crypto'
import { findAlternativeSlots as sharedFindAlternativeSlots } from '@/lib/schedule/conflicts'
import { zonedWallClockToUtc, zonedWeekday, zonedDateParts, formatInZone } from '@/lib/time/tz'

// GET current variants for this template course
export const GET = withAuth(
  async (req: NextRequest, session, context) => {
    const params = await context.params
    const templateCourseId = params.id as string
    const userId = session.user.id

    try {
      const isOwner = await verifyCourseOwnership(templateCourseId, userId)
      if (!isOwner) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      // Safety net: if the caller passed a *published variant* id (e.g. a link
      // built from /api/tutor/courses/enrolled, which returns published ids),
      // resolve it back to its template so the scheduler still loads the full
      // variant set and its CourseSchedule rows instead of coming up empty.
      let effectiveTemplateId = templateCourseId
      const asVariant = await drizzleDb
        .select({ templateCourseId: courseVariant.templateCourseId })
        .from(courseVariant)
        .where(eq(courseVariant.publishedCourseId, templateCourseId))
        .limit(1)
      if (asVariant.length > 0) {
        effectiveTemplateId = asVariant[0].templateCourseId
      }

      const rows = await drizzleDb
        .select({
          variantId: courseVariant.variantId,
          category: courseVariant.category,
          nationality: courseVariant.nationality,
          publishedCourseId: courseVariant.publishedCourseId,
          name: course.name,
          isPublished: course.isPublished,
          price: course.price,
          currency: course.currency,
          isFree: course.isFree,
          languageOfInstruction: course.languageOfInstruction,
        })
        .from(courseVariant)
        .innerJoin(course, eq(course.courseId, courseVariant.publishedCourseId))
        .where(eq(courseVariant.templateCourseId, effectiveTemplateId))

      // Load schedules for each variant
      const variantIds = rows.map(r => r.publishedCourseId)
      const schedules =
        variantIds.length > 0
          ? await drizzleDb
              .select({
                scheduleId: courseSchedule.scheduleId,
                courseId: courseSchedule.courseId,
                scheduleIndex: courseSchedule.scheduleIndex,
                name: courseSchedule.name,
                schedule: courseSchedule.schedule,
                weeksToSchedule: courseSchedule.weeksToSchedule,
                maxStudents: courseSchedule.maxStudents,
                enrolledCount: courseSchedule.enrolledCount,
              })
              .from(courseSchedule)
              .where(inArray(courseSchedule.courseId, variantIds))
              .orderBy(courseSchedule.scheduleIndex)
          : []

      const schedulesByCourse = new Map<string, typeof schedules>()
      for (const s of schedules) {
        const list = schedulesByCourse.get(s.courseId) || []
        list.push(s)
        schedulesByCourse.set(s.courseId, list)
      }

      const variants = rows.map(r => ({
        ...r,
        schedules: (schedulesByCourse.get(r.publishedCourseId) || []).map(s => ({
          scheduleId: s.scheduleId,
          scheduleIndex: s.scheduleIndex,
          name: s.name,
          schedule: s.schedule,
          weeksToSchedule: s.weeksToSchedule,
          maxStudents: s.maxStudents,
          enrolledCount: s.enrolledCount,
        })),
      }))

      return NextResponse.json({ variants })
    } catch (error: any) {
      console.error('[GET /api/tutor/courses/[id]/publish] Error:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to load variants' },
        { status: 500 }
      )
    }
  },
  { role: 'TUTOR' }
)

interface ScheduleItem {
  dayOfWeek: string
  startTime: string
  durationMinutes: number
  date?: string
}

interface CourseScheduleConfig {
  scheduleId?: string
  scheduleIndex: number
  name?: string | null
  schedule: ScheduleItem[]
  weeksToSchedule?: number
  maxStudents?: number | null
}

interface VariantConfig {
  category: string
  nationality: string
  isPublished: boolean
  isFree?: boolean
  price: number | null
  currency: string
  languageOfInstruction: string
  schedules: CourseScheduleConfig[]
}

const DAY_MAP: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

/**
 * Robust LiveSession insert that adapts to schema drift.
 * Detects actual columns and uses raw SQL via the underlying pg driver.
 */
function generateSessionDates(
  schedule: ScheduleItem[],
  weeksAhead = 8,
  timeZone = 'UTC'
): Array<{ scheduledAt: Date; title: string; durationMinutes: number }> {
  const sessions: Array<{ scheduledAt: Date; title: string; durationMinutes: number }> = []
  const cutoffMs = Date.now() + 60 * 60 * 1000 // skip sessions within the next hour

  // Add `n` days to a wall-clock date (Y/1-based-M/D) → new Y/M/D, without tz drift.
  const addDays = (year: number, month: number, day: number, n: number) => {
    const t = new Date(Date.UTC(year, month - 1, day + n))
    return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }
  }

  for (const slot of schedule) {
    const targetDay = DAY_MAP[slot.dayOfWeek]
    if (targetDay === undefined) continue

    // Validate time format: must be "HH:MM" with valid ranges
    const timeParts = (slot.startTime ?? '').split(':')
    if (timeParts.length !== 2) continue
    const hours = parseInt(timeParts[0], 10)
    const minutes = parseInt(timeParts[1], 10)
    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    )
      continue

    if (slot.date) {
      // Manual specific date — the "HH:MM" is the tutor's local wall clock.
      const [year, month, day] = slot.date.split('-').map(Number)
      if (!year || !month || !day) continue
      const sessionDate = zonedWallClockToUtc(year, month, day, hours, minutes, timeZone)
      if (isNaN(sessionDate.getTime())) continue
      if (sessionDate.getTime() < cutoffMs) continue
      sessions.push({
        scheduledAt: sessionDate,
        title: `Live Session — ${slot.date} ${slot.startTime}`,
        durationMinutes: slot.durationMinutes || 60,
      })
      continue
    }

    // Find the next occurrence of this weekday in the TUTOR's timezone, so a
    // "9 AM Monday" slot means 9 AM Monday for the tutor (not the server/UTC).
    const now = new Date()
    const todayZ = zonedDateParts(now, timeZone)
    const todayWeekday = zonedWeekday(now, timeZone)
    const daysUntil = (targetDay - todayWeekday + 7) % 7
    let occ = addDays(todayZ.year, todayZ.month, todayZ.day, daysUntil)
    let first = zonedWallClockToUtc(occ.year, occ.month, occ.day, hours, minutes, timeZone)
    if (first.getTime() < cutoffMs) {
      occ = addDays(occ.year, occ.month, occ.day, 7)
      first = zonedWallClockToUtc(occ.year, occ.month, occ.day, hours, minutes, timeZone)
    }

    // Generate sessions for the next N weeks
    for (let w = 0; w < weeksAhead; w++) {
      const wk = addDays(occ.year, occ.month, occ.day, w * 7)
      const sessionDate = zonedWallClockToUtc(wk.year, wk.month, wk.day, hours, minutes, timeZone)
      if (isNaN(sessionDate.getTime())) continue
      sessions.push({
        scheduledAt: sessionDate,
        title: `Live Session — ${slot.dayOfWeek} ${slot.startTime}`,
        durationMinutes: slot.durationMinutes || 60,
      })
    }
  }

  // Sort by date
  sessions.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  return sessions
}

// Wrapper around shared findAlternativeSlots for use inside the publish route
async function findAlternativeSlots(
  tutorId: string,
  originalStart: Date,
  durationMinutes: number,
  count = 3
): Promise<Array<{ date: string; startTime: string; endTime: string }>> {
  return sharedFindAlternativeSlots(tutorId, originalStart, durationMinutes, {
    maxSuggestions: count,
    searchDays: 21,
    sameDayOfWeek: true,
  })
}

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const params = await context.params
      let templateCourseId = params.id as string
      const userId = session.user.id
      // Safety net (mirrors the GET): if a *published variant* id was passed,
      // resolve it back to its template so variant lookups aren't empty.
      const asVariantRow = await drizzleDb
        .select({ templateCourseId: courseVariant.templateCourseId })
        .from(courseVariant)
        .where(eq(courseVariant.publishedCourseId, templateCourseId))
        .limit(1)
      if (asVariantRow.length > 0) {
        templateCourseId = asVariantRow[0].templateCourseId
      }
      const body = await req.json().catch(() => ({}))
      // schedulesOnly: persist schedule edits to ALREADY-published variants
      // without publishing unpublished ones or changing any publish state — lets
      // "Save" save schedules on a live course without putting more of it live.
      const schedulesOnly = body.schedulesOnly === true
      const variants: VariantConfig[] = Array.isArray(body.variants)
        ? body.variants.filter(
            (v: unknown): v is VariantConfig =>
              typeof v === 'object' &&
              v !== null &&
              typeof (v as VariantConfig).category === 'string' &&
              typeof (v as VariantConfig).nationality === 'string'
          )
        : []

      if (variants.length === 0) {
        return NextResponse.json(
          { error: 'Provide at least one variant configuration' },
          { status: 400 }
        )
      }

      try {
        // Ensure CourseSchedule columns exist before any query touches them.
        // Runs ADD COLUMN IF NOT EXISTS — instant no-op when columns already exist,
        // self-healing when migrations haven't been applied to this environment.
        await drizzleDb.execute(
          sql`ALTER TABLE "CourseSchedule" ADD COLUMN IF NOT EXISTS "enrolledCount" integer NOT NULL DEFAULT 0`
        )
        await drizzleDb.execute(
          sql`ALTER TABLE "CourseSchedule" ADD COLUMN IF NOT EXISTS "weeksToSchedule" integer NOT NULL DEFAULT 8`
        )
        await drizzleDb.execute(
          sql`ALTER TABLE "CourseSchedule" ADD COLUMN IF NOT EXISTS "name" text`
        )

        // Verify ownership of the template course
        const isOwner = await verifyCourseOwnership(templateCourseId, userId)
        if (!isOwner) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const [templateCourse] = await drizzleDb
          .select({
            courseId: course.courseId,
            name: course.name,
            description: course.description,
            price: course.price,
            currency: course.currency,
            isFree: course.isFree,
            schedule: course.schedule,
            languageOfInstruction: course.languageOfInstruction,
            creatorId: course.creatorId,
            isLiveOnline: course.isLiveOnline,
          })
          .from(course)
          .where(eq(course.courseId, templateCourseId))
          .limit(1)

        if (!templateCourse) {
          return NextResponse.json({ error: 'Course not found' }, { status: 404 })
        }

        // Load lessons from the template course
        const templateLessons = await drizzleDb
          .select({
            lessonId: courseLesson.lessonId,
            title: courseLesson.title,
            description: courseLesson.description,
            duration: courseLesson.duration,
            order: courseLesson.order,
            builderData: courseLesson.builderData,
          })
          .from(courseLesson)
          .where(eq(courseLesson.courseId, templateCourseId))
          .orderBy(courseLesson.order)

        const now = new Date()
        const result: Array<{
          courseId: string
          name: string
          nationality: string
          category: string
          isPublished: boolean
          action: 'created' | 'updated' | 'schedules_saved'
        }> = []

        const skippedSessions: Array<{
          scheduledAt: Date
          durationMinutes: number
          reason:
            | 'calendar_event'
            | 'other_course_live_session'
            | 'one_on_one'
            | 'outside_availability'
            | 'exception'
          conflictWith?: { start?: Date | null; end?: Date | null }
          recommendations: Array<{ date: string; startTime: string; endTime: string }>
        }> = []

        // The tutor's timezone (all their availability rows share it). Session
        // "HH:MM" slots are that tutor's wall clock, so everything — session
        // creation and the availability check — is computed in this zone.
        const [tutorTzRow] = await drizzleDb
          .select({ timezone: calendarAvailability.timezone })
          .from(calendarAvailability)
          .where(eq(calendarAvailability.tutorId, userId))
          .limit(1)
        const tutorTimeZone = tutorTzRow?.timezone || 'UTC'

        await drizzleDb.transaction(async tx => {
          // Fetch existing variants with their course data
          const existingRows = await tx
            .select({
              variantId: courseVariant.variantId,
              category: courseVariant.category,
              nationality: courseVariant.nationality,
              publishedCourseId: courseVariant.publishedCourseId,
              isPublished: course.isPublished,
            })
            .from(courseVariant)
            .innerJoin(course, eq(course.courseId, courseVariant.publishedCourseId))
            .where(eq(courseVariant.templateCourseId, templateCourseId))

          const existingMap = new Map(existingRows.map(r => [`${r.category}|${r.nationality}`, r]))

          const requestedKeys = new Set<string>()

          for (const v of variants) {
            const key = `${v.category}|${v.nationality}`
            requestedKeys.add(key)
            const existing = existingMap.get(key)
            // In schedules-only mode, only touch variants that are already
            // published; never create/publish anything new.
            if (schedulesOnly && (!existing || !existing.isPublished)) continue
            const courseName = templateCourse.name
            const isFree =
              typeof v.isFree === 'boolean' ? v.isFree : (templateCourse.isFree ?? false)
            const price = isFree ? 0 : typeof v.price === 'number' ? v.price : null

            let publishedCourseId: string

            if (existing) {
              // Update existing course row
              publishedCourseId = existing.publishedCourseId
              // Skip the course-row update in schedules-only mode so publish
              // state and details are left exactly as they are (we only sync the
              // schedule rows below).
              if (!schedulesOnly) {
                await tx
                  .update(course)
                  .set({
                    name: courseName,
                    description: templateCourse.description,
                    categories: [v.category],
                    isPublished: v.isPublished,
                    updatedAt: now,
                    isLiveOnline: templateCourse.isLiveOnline ?? false,
                    languageOfInstruction: v.languageOfInstruction || null,
                    price,
                    currency: v.currency || templateCourse.currency || 'USD',
                    isFree,
                  })
                  .where(eq(course.courseId, publishedCourseId))

                // Propagate the template's lesson edits into this already-
                // published variant. Publish previously copied lessons only when
                // a variant was first created, so re-publishing never updated the
                // live lessons. We correlate template↔published lessons by
                // `sourceLessonId` (stamped at copy time), falling back to `order`
                // for rows copied before that linkage existed:
                //   • matched   → update the published lesson IN PLACE, keeping its
                //     id so DeployedMaterial / live-session links survive, and
                //     re-sync its `order` to the template;
                //   • unmatched template lesson → insert a published copy;
                //   • unmatched published lesson (dropped from template) → delete
                //     only when nothing has been deployed from it.
                // Correlating by id (not position) means reordering the template
                // updates the RIGHT published lesson instead of whatever now sits
                // at that slot.
                const publishedLessonRows = await tx
                  .select({
                    lessonId: courseLesson.lessonId,
                    order: courseLesson.order,
                    sourceLessonId: courseLesson.sourceLessonId,
                  })
                  .from(courseLesson)
                  .where(
                    and(
                      eq(courseLesson.courseId, publishedCourseId),
                      isNull(courseLesson.deletedAt)
                    )
                  )
                  .orderBy(courseLesson.order)

                const publishedBySource = new Map<string, string>()
                const publishedByOrder = new Map<number, string>()
                for (const l of publishedLessonRows) {
                  if (l.sourceLessonId && !publishedBySource.has(l.sourceLessonId)) {
                    publishedBySource.set(l.sourceLessonId, l.lessonId)
                  }
                  const ord = l.order ?? 0
                  if (!publishedByOrder.has(ord)) publishedByOrder.set(ord, l.lessonId)
                }

                const claimedPublishedIds = new Set<string>()
                for (const [idx, lesson] of templateLessons.entries()) {
                  const ord = lesson.order ?? idx
                  const matchId =
                    publishedBySource.get(lesson.lessonId) ?? publishedByOrder.get(ord)
                  if (matchId && !claimedPublishedIds.has(matchId)) {
                    claimedPublishedIds.add(matchId)
                    await tx
                      .update(courseLesson)
                      .set({
                        // (Re)assert the linkage — backfills order-matched legacy rows.
                        sourceLessonId: lesson.lessonId,
                        title: lesson.title,
                        description: lesson.description,
                        duration: lesson.duration ?? 60,
                        order: ord,
                        builderData: lesson.builderData,
                        updatedAt: now,
                      })
                      .where(eq(courseLesson.lessonId, matchId))
                  } else {
                    await tx.insert(courseLesson).values({
                      lessonId: crypto.randomUUID(),
                      courseId: publishedCourseId,
                      sourceLessonId: lesson.lessonId,
                      title: lesson.title,
                      description: lesson.description,
                      duration: lesson.duration ?? 60,
                      order: ord,
                      builderData: lesson.builderData,
                      createdAt: now,
                      updatedAt: now,
                    })
                  }
                }

                const removedLessonIds = publishedLessonRows
                  .filter(l => !claimedPublishedIds.has(l.lessonId))
                  .map(l => l.lessonId)
                if (removedLessonIds.length > 0) {
                  const deployedRows = await tx
                    .select({ lessonId: deployedMaterial.lessonId })
                    .from(deployedMaterial)
                    .where(inArray(deployedMaterial.lessonId, removedLessonIds))
                  const deployedIds = new Set(deployedRows.map(d => d.lessonId))
                  const deletableIds = removedLessonIds.filter(id => !deployedIds.has(id))
                  if (deletableIds.length > 0) {
                    await tx
                      .delete(courseLesson)
                      .where(inArray(courseLesson.lessonId, deletableIds))
                  }
                }
              }

              result.push({
                courseId: publishedCourseId,
                name: courseName,
                nationality: v.nationality,
                category: v.category,
                isPublished: existing.isPublished,
                action: schedulesOnly ? 'schedules_saved' : 'updated',
              })
            } else {
              // Create new course + variant
              publishedCourseId = crypto.randomUUID()

              await tx.insert(course).values({
                courseId: publishedCourseId,
                name: courseName,
                description: templateCourse.description,
                categories: [v.category],
                isPublished: v.isPublished,
                createdAt: now,
                updatedAt: now,
                creatorId: userId,
                isLiveOnline: templateCourse.isLiveOnline ?? false,
                languageOfInstruction: v.languageOfInstruction || null,
                price,
                currency: v.currency || templateCourse.currency || 'USD',
                isFree,
              })

              // Copy lessons — stamp sourceLessonId so each published copy can be
              // correlated back to its template lesson by a stable id later.
              for (const lesson of templateLessons) {
                await tx.insert(courseLesson).values({
                  lessonId: crypto.randomUUID(),
                  courseId: publishedCourseId,
                  sourceLessonId: lesson.lessonId,
                  title: lesson.title,
                  description: lesson.description,
                  duration: lesson.duration ?? 60,
                  order: lesson.order,
                  builderData: lesson.builderData,
                  createdAt: now,
                  updatedAt: now,
                })
              }

              await tx.insert(courseVariant).values({
                variantId: crypto.randomUUID(),
                templateCourseId,
                publishedCourseId,
                nationality: v.nationality,
                category: v.category,
                createdAt: now,
                updatedAt: now,
              })

              result.push({
                courseId: publishedCourseId,
                name: courseName,
                nationality: v.nationality,
                category: v.category,
                isPublished: v.isPublished,
                action: 'created',
              })
            }

            // Sync CourseSchedule rows for this published course
            const schedules = Array.isArray(v.schedules) ? v.schedules : []
            const existingSchedules = await tx
              .select({
                scheduleId: courseSchedule.scheduleId,
                scheduleIndex: courseSchedule.scheduleIndex,
                enrolledCount: courseSchedule.enrolledCount,
              })
              .from(courseSchedule)
              .where(eq(courseSchedule.courseId, publishedCourseId))
              .orderBy(courseSchedule.scheduleIndex)

            // Update or create schedules, remembering each row's id so the
            // sessions we materialize below can be linked back to their schedule.
            const scheduleIdByPayload = new Map<unknown, string>()
            for (let i = 0; i < schedules.length; i++) {
              const s = schedules[i]
              const existingSch = existingSchedules.find(es => es.scheduleIndex === s.scheduleIndex)
              if (existingSch) {
                await tx
                  .update(courseSchedule)
                  .set({
                    name: s.name ?? null,
                    schedule: s.schedule || [],
                    weeksToSchedule: s.weeksToSchedule || 8,
                    maxStudents: s.maxStudents ?? null,
                    updatedAt: now,
                  })
                  .where(eq(courseSchedule.scheduleId, existingSch.scheduleId))
                scheduleIdByPayload.set(s, existingSch.scheduleId)
              } else {
                const newScheduleId = crypto.randomUUID()
                await tx.insert(courseSchedule).values({
                  scheduleId: newScheduleId,
                  courseId: publishedCourseId,
                  scheduleIndex: s.scheduleIndex || i + 1,
                  name: s.name ?? null,
                  schedule: s.schedule || [],
                  weeksToSchedule: s.weeksToSchedule || 8,
                  maxStudents: s.maxStudents ?? null,
                  enrolledCount: 0,
                  createdAt: now,
                  updatedAt: now,
                })
                scheduleIdByPayload.set(s, newScheduleId)
              }
            }

            // Remove extra schedules that are no longer in the payload
            const sentIndices = new Set(schedules.map(s => s.scheduleIndex || 0))
            for (const es of existingSchedules) {
              if (!sentIndices.has(es.scheduleIndex)) {
                // Only delete if no enrollments
                if (es.enrolledCount === 0) {
                  await tx
                    .delete(courseSchedule)
                    .where(eq(courseSchedule.scheduleId, es.scheduleId))
                }
              }
            }

            // Published lessons in course order — each schedule's sessions are
            // auto-assigned a lesson sequentially (session 1 → Lesson 1, session 2
            // → Lesson 2, …) so a schedule no longer collapses everything into
            // Lesson 1. Sessions beyond the last lesson are left unassigned (null)
            // for the tutor to fill in via the per-session lesson picker.
            const publishedLessons = await tx
              .select({ lessonId: courseLesson.lessonId, order: courseLesson.order })
              .from(courseLesson)
              .where(
                and(eq(courseLesson.courseId, publishedCourseId), isNull(courseLesson.deletedAt))
              )
              .orderBy(courseLesson.order)

            // Generate live sessions from all schedules
            for (const s of schedules) {
              const scheduleItems = Array.isArray(s.schedule) ? s.schedule : []
              if (scheduleItems.length === 0) continue
              const sessionDates = generateSessionDates(
                scheduleItems,
                s.weeksToSchedule || 8,
                tutorTimeZone
              )

              // Each schedule is an independent offering that walks the whole
              // course, so the lesson cursor restarts at Lesson 1 per schedule.
              // It only advances when a session is actually materialized, so
              // skipped (conflicting/out-of-availability) slots don't burn a lesson.
              let lessonCursor = 0

              const scheduledAts = sessionDates.map(s => s.scheduledAt).filter(Boolean)
              const minScheduledAt =
                scheduledAts.length > 0
                  ? new Date(Math.min(...scheduledAts.map(d => d.getTime())))
                  : null
              const maxScheduledAt =
                scheduledAts.length > 0
                  ? new Date(Math.max(...scheduledAts.map(d => d.getTime())))
                  : null

              // Fetch all existing sessions/events that could overlap with the generated range
              const sessionEndMax = maxScheduledAt
                ? new Date(
                    maxScheduledAt.getTime() +
                      Math.max(...sessionDates.map(s => s.durationMinutes || 60)) * 60000
                  )
                : null

              const [existingLiveSessions, existingCalendarEvents, existingOneOnOnes] =
                await Promise.all([
                  minScheduledAt && maxScheduledAt
                    ? tx
                        .select({
                          sessionId: liveSession.sessionId,
                          scheduledAt: liveSession.scheduledAt,
                          durationMinutes: liveSession.durationMinutes,
                          courseId: liveSession.courseId,
                          roomUrl: liveSession.roomUrl,
                          lessonId: liveSession.lessonId,
                        })
                        .from(liveSession)
                        .where(
                          and(
                            eq(liveSession.tutorId, userId),
                            inArray(liveSession.status, LIVE_SESSION_OPEN_STATUSES),
                            gte(liveSession.scheduledAt, minScheduledAt),
                            lte(liveSession.scheduledAt, maxScheduledAt)
                          )
                        )
                    : Promise.resolve([]),
                  minScheduledAt && sessionEndMax
                    ? tx
                        .select({
                          startTime: calendarEvent.startTime,
                          endTime: calendarEvent.endTime,
                        })
                        .from(calendarEvent)
                        .where(
                          and(
                            eq(calendarEvent.tutorId, userId),
                            eq(calendarEvent.isCancelled, false),
                            isNull(calendarEvent.deletedAt),
                            lt(calendarEvent.startTime, sessionEndMax),
                            gt(calendarEvent.endTime, minScheduledAt)
                          )
                        )
                    : Promise.resolve([]),
                  minScheduledAt && sessionEndMax
                    ? tx
                        .select({
                          requestedDate: oneOnOneBookingRequest.requestedDate,
                          startTime: oneOnOneBookingRequest.startTime,
                          endTime: oneOnOneBookingRequest.endTime,
                          durationMinutes: oneOnOneBookingRequest.durationMinutes,
                        })
                        .from(oneOnOneBookingRequest)
                        .where(
                          and(
                            eq(oneOnOneBookingRequest.tutorId, userId),
                            inArray(oneOnOneBookingRequest.status, ['ACCEPTED', 'PAID']),
                            gte(oneOnOneBookingRequest.requestedDate, minScheduledAt),
                            lte(oneOnOneBookingRequest.requestedDate, sessionEndMax)
                          )
                        )
                    : Promise.resolve([]),
                ])

              // Tutor availability (recurring available windows) + date exceptions,
              // so the server enforces the same availability rules the scheduler UI
              // shows (out-of-availability / blocked sessions are skipped, not
              // silently published). Matches VariantScheduleEditor.getSlotStatus.
              const [availabilityWindows, dateExceptions] = await Promise.all([
                tx
                  .select({
                    dayOfWeek: calendarAvailability.dayOfWeek,
                    startTime: calendarAvailability.startTime,
                    endTime: calendarAvailability.endTime,
                    // Include the flag: tutors store BLOCKED times as
                    // isAvailable=false. Filtering to true only left no windows,
                    // so blocked slots were never enforced on publish.
                    isAvailable: calendarAvailability.isAvailable,
                  })
                  .from(calendarAvailability)
                  .where(
                    and(
                      eq(calendarAvailability.tutorId, userId),
                      or(
                        isNull(calendarAvailability.validUntil),
                        gte(calendarAvailability.validUntil, now)
                      )
                    )
                  ),
                minScheduledAt && maxScheduledAt
                  ? tx
                      .select({
                        date: calendarException.date,
                        startTime: calendarException.startTime,
                        endTime: calendarException.endTime,
                        isAvailable: calendarException.isAvailable,
                      })
                      .from(calendarException)
                      .where(
                        and(
                          eq(calendarException.tutorId, userId),
                          gte(calendarException.date, minScheduledAt),
                          lte(calendarException.date, sessionEndMax ?? maxScheduledAt)
                        )
                      )
                  : Promise.resolve([]),
              ])

              // Wall-clock helpers in the TUTOR's timezone — availability/exception
              // times are stored as the tutor's local "HH:MM", so the session
              // instant must be read in the same zone (not UTC) to compare.
              const hhmm = (d: Date) => formatInZone(d, tutorTimeZone).time
              const dateKeyOf = (d: Date) => formatInZone(d, tutorTimeZone).date
              const timesOverlapStr = (s1: string, e1: string, s2: string, e2: string) =>
                s1 < e2 && e1 > s2

              // Returns a skip reason if the session falls outside availability or
              // on a blocked exception, else null.
              function availabilityBlock(
                start: Date,
                end: Date
              ): 'outside_availability' | 'exception' | null {
                const dow = zonedWeekday(start, tutorTimeZone)
                const sStr = hhmm(start)
                const eStr = hhmm(end)
                const dateKey = dateKeyOf(start)
                const dayWindows = availabilityWindows.filter(a => a.dayOfWeek === dow)
                // "Available unless blocked": a session overlapping a blocked
                // (isAvailable=false) window is out of availability. isAvailable=true
                // and absent rows both mean available, so they never restrict.
                const blocked = dayWindows.filter(a => a.isAvailable === false)
                if (blocked.some(a => timesOverlapStr(sStr, eStr, a.startTime, a.endTime))) {
                  return 'outside_availability'
                }
                for (const ex of dateExceptions) {
                  if (dateKeyOf(new Date(ex.date)) !== dateKey) continue
                  if (!ex.isAvailable) return 'exception'
                  if (
                    ex.startTime &&
                    ex.endTime &&
                    timesOverlapStr(sStr, eStr, ex.startTime, ex.endTime)
                  ) {
                    return 'exception'
                  }
                }
                return null
              }

              // Helper: check if a generated session overlaps with an existing event
              function overlaps(
                start: Date,
                end: Date,
                existing: {
                  startTime?: Date | null
                  endTime?: Date | null
                  scheduledAt?: Date | null
                  durationMinutes?: number | null
                }
              ): boolean {
                const existingStart = existing.scheduledAt || existing.startTime
                if (!existingStart) return false
                const existingEnd =
                  existing.endTime ||
                  new Date(existingStart.getTime() + (existing.durationMinutes || 60) * 60000)
                return start < existingEnd && end > existingStart
              }

              for (const session of sessionDates) {
                const sessionStart = session.scheduledAt
                const sessionEnd = new Date(
                  sessionStart.getTime() + session.durationMinutes * 60000
                )

                // Enforce tutor availability server-side (the scheduler UI guard
                // is not authoritative on its own).
                const availReason = availabilityBlock(sessionStart, sessionEnd)
                if (availReason) {
                  const recs = await findAlternativeSlots(
                    userId,
                    session.scheduledAt,
                    session.durationMinutes
                  )
                  skippedSessions.push({
                    scheduledAt: session.scheduledAt,
                    durationMinutes: session.durationMinutes,
                    reason: availReason,
                    recommendations: recs,
                  })
                  continue
                }

                const conflictingLs = existingLiveSessions.find(ls =>
                  overlaps(sessionStart, sessionEnd, ls)
                )
                const conflictingCe = existingCalendarEvents.find(ce =>
                  overlaps(sessionStart, sessionEnd, ce)
                )

                if (conflictingCe) {
                  // Hard conflict with another CalendarEvent — skip and recommend
                  const recs = await findAlternativeSlots(
                    userId,
                    session.scheduledAt,
                    session.durationMinutes
                  )
                  skippedSessions.push({
                    scheduledAt: session.scheduledAt,
                    durationMinutes: session.durationMinutes,
                    reason: 'calendar_event',
                    conflictWith: { start: conflictingCe.startTime, end: conflictingCe.endTime },
                    recommendations: recs,
                  })
                  continue
                }

                const conflictingOo = existingOneOnOnes.find((oo: any) => {
                  const ooStart = oo.requestedDate
                  const ooEnd = new Date(
                    oo.requestedDate.getTime() + (oo.durationMinutes || 60) * 60000
                  )
                  return sessionStart < ooEnd && sessionEnd > ooStart
                })
                if (conflictingOo) {
                  const recs = await findAlternativeSlots(
                    userId,
                    session.scheduledAt,
                    session.durationMinutes
                  )
                  skippedSessions.push({
                    scheduledAt: session.scheduledAt,
                    durationMinutes: session.durationMinutes,
                    reason: 'one_on_one',
                    conflictWith: {
                      start: conflictingOo.requestedDate,
                      end: new Date(
                        conflictingOo.requestedDate.getTime() +
                          (conflictingOo.durationMinutes || 60) * 60000
                      ),
                    },
                    recommendations: recs,
                  })
                  continue
                }

                if (conflictingLs) {
                  if (conflictingLs.courseId === publishedCourseId) {
                    // Same-course existing session: ensure it has a CalendarEvent
                    const [existingCe] = await tx
                      .select({ eventId: calendarEvent.eventId })
                      .from(calendarEvent)
                      .where(
                        and(
                          eq(calendarEvent.externalId, conflictingLs.sessionId),
                          isNull(calendarEvent.deletedAt)
                        )
                      )
                      .limit(1)

                    if (!existingCe && conflictingLs.scheduledAt) {
                      const lsEndTime = new Date(
                        conflictingLs.scheduledAt.getTime() +
                          (conflictingLs.durationMinutes || 60) * 60000
                      )
                      await tx.insert(calendarEvent).values({
                        eventId: crypto.randomUUID(),
                        tutorId: userId,
                        title: session.title,
                        description: templateCourse.description ?? undefined,
                        type: 'LESSON',
                        status: 'CONFIRMED',
                        startTime: conflictingLs.scheduledAt,
                        endTime: lsEndTime,
                        timezone: 'UTC',
                        isAllDay: false,
                        isRecurring: false,
                        isVirtual: true,
                        location: 'Online',
                        meetingUrl: conflictingLs.roomUrl,
                        courseId: publishedCourseId,
                        maxAttendees: 50,
                        createdBy: userId,
                        isCancelled: false,
                        externalId: conflictingLs.sessionId,
                      })
                    }
                    // Backfill the lesson on a session created before lesson
                    // linkage existed (or a re-publish), keeping the sequence
                    // aligned. Only set it when currently empty so a tutor's
                    // manual re-assignment is never overwritten.
                    const backfillLessonId =
                      lessonCursor < publishedLessons.length
                        ? publishedLessons[lessonCursor].lessonId
                        : null
                    if (!conflictingLs.lessonId && backfillLessonId) {
                      await tx
                        .update(liveSession)
                        .set({ lessonId: backfillLessonId })
                        .where(eq(liveSession.sessionId, conflictingLs.sessionId))
                    }
                    // Existing same-course session occupies this slot → advance.
                    lessonCursor++
                    continue
                  } else {
                    // Conflict with a different course — skip and recommend
                    const recs = await findAlternativeSlots(
                      userId,
                      session.scheduledAt,
                      session.durationMinutes
                    )
                    skippedSessions.push({
                      scheduledAt: session.scheduledAt,
                      durationMinutes: session.durationMinutes,
                      reason: 'other_course_live_session',
                      conflictWith: { start: conflictingLs.scheduledAt, end: null },
                      recommendations: recs,
                    })
                    continue
                  }
                }

                const assignedLessonId =
                  lessonCursor < publishedLessons.length
                    ? publishedLessons[lessonCursor].lessonId
                    : undefined

                try {
                  await createSession(
                    {
                      tutorId: userId,
                      title: session.title,
                      scheduledAt: session.scheduledAt,
                      durationMinutes: session.durationMinutes,
                      category: v.category,
                      type: 'COURSE',
                      courseId: publishedCourseId,
                      scheduleId: scheduleIdByPayload.get(s) ?? undefined,
                      lessonId: assignedLessonId,
                      description: templateCourse.description ?? undefined,
                      status: 'scheduled',
                      maxStudents: s.maxStudents ?? 50,
                      timezone: 'UTC',
                    },
                    tx
                  )
                  // Session materialized → advance to the next lesson.
                  lessonCursor++
                } catch (insertError: any) {
                  const pgError = insertError?.cause || insertError
                  const msg = insertError?.message || String(insertError)
                  const pgMsg = pgError?.message || msg
                  console.error('[publish] createSession failed:', {
                    message: msg,
                    pgMessage: pgMsg,
                    pgCode: pgError?.code,
                    pgDetail: pgError?.detail,
                  })
                  throw new Error(
                    `createSession failed: ${pgMsg} (code: ${pgError?.code || 'unknown'}). ` +
                      `Run: npm run db:apply-schema`
                  )
                }
              }
            }
          }

          // Rename assets folder if it's the first time publishing and the folder matches the draft course name
          if (result.length > 0 && templateCourse.name) {
            const firstCategory = result[0].category
            const assets = await tx
              .select({ assetId: tutorAsset.assetId, metadata: tutorAsset.metadata })
              .from(tutorAsset)
              .where(eq(tutorAsset.tutorId, userId))

            for (const a of assets) {
              const meta = a.metadata as any
              if (meta && meta.folder === templateCourse.name) {
                await tx
                  .update(tutorAsset)
                  .set({ metadata: { ...meta, folder: firstCategory } })
                  .where(eq(tutorAsset.assetId, a.assetId))
              }
            }
          }

          // Unpublish variants that exist in DB but were not sent in the request.
          // Never do this in schedules-only mode — Save must not change publish
          // state for anything.
          if (!schedulesOnly) {
            for (const existing of existingRows) {
              const key = `${existing.category}|${existing.nationality}`
              if (!requestedKeys.has(key)) {
                await tx
                  .update(course)
                  .set({ isPublished: false, updatedAt: now })
                  .where(eq(course.courseId, existing.publishedCourseId))
              }
            }
          }
        })

        return NextResponse.json({
          success: true,
          count: result.length,
          variants: result,
          skippedCount: skippedSessions.length,
          skippedSessions,
        })
      } catch (error: any) {
        const pgError = error?.cause || error
        console.error('[POST /api/tutor/courses/[id]/publish] Error:', {
          message: error?.message,
          pgMessage: pgError?.message,
          pgCode: pgError?.code,
          pgDetail: pgError?.detail,
          pgHint: pgError?.hint,
          pgColumn: pgError?.column,
          pgTable: pgError?.table,
          stack: error?.stack,
        })
        const hint =
          pgError?.code === '42P01'
            ? 'Missing table detected (CourseSchedule may not exist). Run: npm run db:migrate'
            : pgError?.code === '42703'
              ? 'Missing column detected. Run: npm run db:apply-schema'
              : pgError?.code === '42704'
                ? 'Missing type/enum detected. Run: npm run db:apply-schema'
                : undefined
        return NextResponse.json(
          {
            error: error.message || 'Failed to publish course variants',
            detail: pgError?.detail || pgError?.message,
            hint,
          },
          { status: 500 }
        )
      }
    },
    { role: 'TUTOR' }
  )
)

// Unpublish: set isPublished=false on all variants for this template
export const DELETE = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const params = await context.params
      const templateCourseId = params.id as string
      const userId = session.user.id

      try {
        const isOwner = await verifyCourseOwnership(templateCourseId, userId)
        if (!isOwner) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const existingVariants = await drizzleDb
          .select({ publishedCourseId: courseVariant.publishedCourseId })
          .from(courseVariant)
          .where(eq(courseVariant.templateCourseId, templateCourseId))

        const existingPublishedIds = existingVariants.map(v => v.publishedCourseId)

        if (existingPublishedIds.length > 0) {
          await drizzleDb
            .update(course)
            .set({ isPublished: false, updatedAt: new Date() })
            .where(inArray(course.courseId, existingPublishedIds))
        }

        return NextResponse.json({
          success: true,
          message: 'All course variants unpublished',
        })
      } catch (error: any) {
        console.error('[DELETE /api/tutor/courses/[id]/publish] Error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to unpublish course' },
          { status: 500 }
        )
      }
    },
    { role: 'TUTOR' }
  )
)
