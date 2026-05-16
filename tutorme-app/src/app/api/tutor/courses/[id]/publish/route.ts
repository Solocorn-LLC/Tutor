import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { verifyCourseOwnership } from '@/lib/api/course-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  course,
  courseLesson,
  courseVariant,
  liveSession,
  tutorAsset,
  calendarEvent,
  calendarAvailability,
  calendarException,
} from '@/lib/db/schema'
import { dailyProvider } from '@/lib/video/daily-provider'
import { createSession } from '@/lib/sessions/create-session'
import { eq, and, inArray, gte, lte, sql, or, isNull } from 'drizzle-orm'
import crypto from 'crypto'

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
          schedule: course.schedule,
        })
        .from(courseVariant)
        .innerJoin(course, eq(course.courseId, courseVariant.publishedCourseId))
        .where(eq(courseVariant.templateCourseId, templateCourseId))

      return NextResponse.json({ variants: rows })
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

interface VariantConfig {
  category: string
  nationality: string
  isPublished: boolean
  isFree?: boolean
  price: number | null
  currency: string
  languageOfInstruction: string
  schedule: ScheduleItem[]
  weeksToSchedule?: number
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
  weeksAhead = 8
): Array<{ scheduledAt: Date; title: string; durationMinutes: number }> {
  const sessions: Array<{ scheduledAt: Date; title: string; durationMinutes: number }> = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (const slot of schedule) {
    const targetDay = DAY_MAP[slot.dayOfWeek]
    if (targetDay === undefined) continue

    const [hours, minutes] = slot.startTime.split(':').map(Number)
    if (hours === undefined || minutes === undefined) continue

    if (slot.date) {
      // Manual specific date
      const [year, month, day] = slot.date.split('-').map(Number)
      if (year && month && day) {
        const sessionDate = new Date(year, month - 1, day, hours, minutes, 0, 0)
        sessions.push({
          scheduledAt: sessionDate,
          title: `Live Session — ${slot.date} ${slot.startTime}`,
          durationMinutes: slot.durationMinutes || 60,
        })
      }
      continue
    }

    // Find the next occurrence of this day
    const cursor = new Date(today)
    const daysUntil = (targetDay - cursor.getDay() + 7) % 7
    cursor.setDate(cursor.getDate() + daysUntil)
    cursor.setHours(hours, minutes, 0, 0)

    // If the time already passed today, start from next week
    if (cursor < new Date()) {
      cursor.setDate(cursor.getDate() + 7)
    }

    // Generate sessions for the next N weeks
    for (let w = 0; w < weeksAhead; w++) {
      const sessionDate = new Date(cursor)
      sessionDate.setDate(cursor.getDate() + w * 7)
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

// Helper: find alternative slots near a given date/time based on tutor availability
async function findAlternativeSlots(
  tutorId: string,
  originalStart: Date,
  durationMinutes: number,
  count = 3
): Promise<Array<{ date: string; startTime: string; endTime: string }>> {
  const recommendations: Array<{ date: string; startTime: string; endTime: string }> = []
  const originalTimeStr = originalStart.toISOString().split('T')[1].slice(0, 5)
  const originalDayOfWeek = originalStart.getDay()

  // Query tutor availability for the same day of week
  const availabilityRows = await drizzleDb
    .select()
    .from(calendarAvailability)
    .where(
      and(
        eq(calendarAvailability.tutorId, tutorId),
        eq(calendarAvailability.dayOfWeek, originalDayOfWeek),
        eq(calendarAvailability.isAvailable, true)
      )
    )

  if (availabilityRows.length === 0) return recommendations

  // Build a set of available time ranges for this day
  const availableRanges = availabilityRows.map(a => ({
    start: a.startTime,
    end: a.endTime,
  }))

  // Check if the original time falls within any available range
  const isTimeAvailable = availableRanges.some(
    r => originalTimeStr >= r.start && originalTimeStr < r.end
  )

  // Search +/- 14 days from original date
  const searchStart = new Date(originalStart)
  searchStart.setDate(searchStart.getDate() - 7)
  const searchEnd = new Date(originalStart)
  searchEnd.setDate(searchEnd.getDate() + 14)

  // Query exceptions in range
  const exceptions = await drizzleDb
    .select()
    .from(calendarException)
    .where(
      and(
        eq(calendarException.tutorId, tutorId),
        gte(calendarException.date, searchStart),
        lte(calendarException.date, searchEnd)
      )
    )

  // Query existing events in range
  const existingEvents = await drizzleDb
    .select({ startTime: calendarEvent.startTime, endTime: calendarEvent.endTime })
    .from(calendarEvent)
    .where(
      and(
        eq(calendarEvent.tutorId, tutorId),
        eq(calendarEvent.isCancelled, false),
        isNull(calendarEvent.deletedAt),
        gte(calendarEvent.startTime, searchStart),
        lte(calendarEvent.startTime, searchEnd)
      )
    )

  const cursor = new Date(originalStart)
  cursor.setDate(cursor.getDate() - 7)

  while (cursor <= searchEnd && recommendations.length < count) {
    if (cursor.getTime() === originalStart.getTime()) {
      cursor.setDate(cursor.getDate() + 1)
      continue
    }

    const dateStr = cursor.toISOString().split('T')[0]
    const dayOfWeek = cursor.getDay()

    // Skip if not the same day of week (or if availability doesn't cover it)
    if (dayOfWeek !== originalDayOfWeek) {
      cursor.setDate(cursor.getDate() + 1)
      continue
    }

    // Check exceptions
    const dayException = exceptions.find(e => e.date.toISOString().split('T')[0] === dateStr)
    if (dayException && !dayException.isAvailable) {
      cursor.setDate(cursor.getDate() + 1)
      continue
    }

    // Check if the same time slot is available on this day
    const slotStart = new Date(`${dateStr}T${originalTimeStr}`)
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000)

    // Skip past dates
    if (slotEnd <= new Date()) {
      cursor.setDate(cursor.getDate() + 1)
      continue
    }

    // Check time falls within availability
    const timeInRange = availableRanges.some(
      r => originalTimeStr >= r.start && originalTimeStr < r.end
    )
    if (!timeInRange) {
      cursor.setDate(cursor.getDate() + 1)
      continue
    }

    // Check exception time ranges
    const timeException = exceptions.find(e => {
      if (e.date.toISOString().split('T')[0] !== dateStr) return false
      if (!e.startTime || !e.endTime) return false
      const exStart = new Date(`${dateStr}T${e.startTime}`)
      const exEnd = new Date(`${dateStr}T${e.endTime}`)
      return slotStart < exEnd && slotEnd > exStart
    })
    if (timeException) {
      cursor.setDate(cursor.getDate() + 1)
      continue
    }

    // Check conflicts with existing events
    const hasConflict = existingEvents.some(
      (ev: any) => slotStart < ev.endTime && slotEnd > ev.startTime
    )
    if (!hasConflict) {
      const endTimeStr = new Date(slotStart.getTime() + durationMinutes * 60000)
        .toISOString()
        .split('T')[1]
        .slice(0, 5)
      recommendations.push({
        date: dateStr,
        startTime: originalTimeStr,
        endTime: endTimeStr,
      })
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  return recommendations
}

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const params = await context.params
      const templateCourseId = params.id as string
      const userId = session.user.id
      const body = await req.json().catch(() => ({}))
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
          action: 'created' | 'updated'
        }> = []

        const skippedSessions: Array<{
          scheduledAt: Date
          durationMinutes: number
          reason: 'calendar_event' | 'other_course_live_session'
          conflictWith?: { start?: Date | null; end?: Date | null }
          recommendations: Array<{ date: string; startTime: string; endTime: string }>
        }> = []

        await drizzleDb.transaction(async tx => {
          // Fetch existing variants with their course data
          const existingRows = await tx
            .select({
              variantId: courseVariant.variantId,
              category: courseVariant.category,
              nationality: courseVariant.nationality,
              publishedCourseId: courseVariant.publishedCourseId,
            })
            .from(courseVariant)
            .where(eq(courseVariant.templateCourseId, templateCourseId))

          const existingMap = new Map(existingRows.map(r => [`${r.category}|${r.nationality}`, r]))

          const requestedKeys = new Set<string>()

          for (const v of variants) {
            const key = `${v.category}|${v.nationality}`
            requestedKeys.add(key)
            const existing = existingMap.get(key)
            const courseName = templateCourse.name
            const isFree =
              typeof v.isFree === 'boolean' ? v.isFree : (templateCourse.isFree ?? false)
            const price = isFree ? 0 : typeof v.price === 'number' ? v.price : null

            let publishedCourseId: string

            if (existing) {
              // Update existing course row
              publishedCourseId = existing.publishedCourseId
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
                  schedule: v.schedule || [],
                })
                .where(eq(course.courseId, publishedCourseId))

              result.push({
                courseId: publishedCourseId,
                name: courseName,
                nationality: v.nationality,
                category: v.category,
                isPublished: v.isPublished,
                action: 'updated',
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
                schedule: v.schedule || [],
              })

              // Copy lessons
              for (const lesson of templateLessons) {
                await tx.insert(courseLesson).values({
                  lessonId: crypto.randomUUID(),
                  courseId: publishedCourseId,
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

            // Generate live sessions from schedule
            const schedule = Array.isArray(v.schedule) ? v.schedule : []
            if (schedule.length > 0) {
              const sessionDates = generateSessionDates(schedule, v.weeksToSchedule || 8)

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

              const [existingLiveSessions, existingCalendarEvents] = await Promise.all([
                minScheduledAt && maxScheduledAt
                  ? tx
                      .select({
                        sessionId: liveSession.sessionId,
                        scheduledAt: liveSession.scheduledAt,
                        durationMinutes: liveSession.durationMinutes,
                        courseId: liveSession.courseId,
                        roomUrl: liveSession.roomUrl,
                      })
                      .from(liveSession)
                      .where(
                        and(
                          eq(liveSession.tutorId, userId),
                          inArray(liveSession.status, [
                            'scheduled',
                            'active',
                            'preparing',
                            'live',
                            'paused',
                          ]),
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
                          or(
                            and(
                              gte(calendarEvent.startTime, minScheduledAt),
                              lte(calendarEvent.startTime, sessionEndMax)
                            ),
                            and(
                              gte(calendarEvent.endTime, minScheduledAt),
                              lte(calendarEvent.endTime, sessionEndMax)
                            )
                          )
                        )
                      )
                  : Promise.resolve([]),
              ])

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
                      description: templateCourse.description ?? undefined,
                      status: 'scheduled',
                      maxStudents: 50,
                      timezone: 'UTC',
                    },
                    tx
                  )
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

          // Unpublish variants that exist in DB but were not sent in the request
          for (const existing of existingRows) {
            const key = `${existing.category}|${existing.nationality}`
            if (!requestedKeys.has(key)) {
              await tx
                .update(course)
                .set({ isPublished: false, updatedAt: now })
                .where(eq(course.courseId, existing.publishedCourseId))
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
          pgError?.code === '42703'
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
