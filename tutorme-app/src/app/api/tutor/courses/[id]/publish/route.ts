import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseLesson, courseVariant, liveSession, tutorAsset, calendarEvent } from '@/lib/db/schema'
import { dailyProvider } from '@/lib/video/daily-provider'
import { eq, and, inArray, gte, lte, sql, or, isNull } from 'drizzle-orm'
import crypto from 'crypto'

// GET current variants for this template course
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: templateCourseId } = await params
  const userId = session.user.id

  try {
    const [template] = await drizzleDb
      .select({ courseId: course.courseId })
      .from(course)
      .where(and(eq(course.courseId, templateCourseId), eq(course.creatorId, userId)))
      .limit(1)

    if (!template) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const rows = await drizzleDb
      .select({
        variantId: courseVariant.variantId,
        category: courseVariant.category,
        nationality: courseVariant.nationality,
        publishedCourseId: courseVariant.publishedCourseId,
        isPublished: course.isPublished,
        price: course.price,
        currency: course.currency,
        languageOfInstruction: course.languageOfInstruction,
        schedule: course.schedule,
      })
      .from(courseVariant)
      .innerJoin(course, eq(course.courseId, courseVariant.publishedCourseId))
      .where(eq(courseVariant.templateCourseId, templateCourseId))

    return NextResponse.json({ variants: rows })
  } catch (error: any) {
    console.error('[GET /api/tutor/courses/[id]/publish] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to load variants' }, { status: 500 })
  }
}

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
async function insertLiveSessionRaw(
  tx: any,
  data: {
    sessionId: string
    tutorId: string
    courseId: string
    title: string
    category: string
    description: string | null
    scheduledAt: Date
    status: string
    maxStudents: number
    durationMinutes?: number
    roomId?: string | null
    roomUrl?: string | null
  }
): Promise<void> {
  // Discover actual columns
  const colResult = await tx.execute(sql`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name = 'LiveSession'
  `)
  const columns = new Map((colResult.rows as any[]).map((r: any) => [r.column_name, r]))

  const hasCategory = columns.has('category')
  const hasSubject = columns.has('subject')
  const categoryCol = hasCategory ? 'category' : hasSubject ? 'subject' : null

  if (!categoryCol) {
    throw new Error('LiveSession is missing both "category" and "subject" columns')
  }

  const hasCourseId = columns.has('courseId')
  if (!hasCourseId) {
    throw new Error('LiveSession is missing "courseId" column')
  }

  const hasStatus = columns.has('status')
  if (!hasStatus) {
    throw new Error('LiveSession is missing "status" column')
  }

  const hasMaxStudents = columns.has('maxStudents')
  const hasDescription = columns.has('description')
  const hasDurationMinutes = columns.has('durationMinutes')
  const hasRoomId = columns.has('roomId')
  const hasRoomUrl = columns.has('roomUrl')

  // Build column list and values
  const colNames = ['"id"', '"tutorId"', '"courseId"', '"title"', `"${categoryCol}"`]
  const values: (string | number | Date | null)[] = [
    data.sessionId,
    data.tutorId,
    data.courseId,
    data.title,
    data.category,
  ]

  if (hasDescription) {
    colNames.push('"description"')
    values.push(data.description)
  }

  colNames.push('"scheduledAt"', '"status"')
  values.push(data.scheduledAt, data.status)

  if (hasMaxStudents) {
    colNames.push('"maxStudents"')
    values.push(data.maxStudents)
  }

  if (hasDurationMinutes && typeof data.durationMinutes === 'number') {
    colNames.push('"durationMinutes"')
    values.push(data.durationMinutes)
  }

  if (hasRoomId && data.roomId) {
    colNames.push('"roomId"')
    values.push(data.roomId)
  }

  if (hasRoomUrl && data.roomUrl) {
    colNames.push('"roomUrl"')
    values.push(data.roomUrl)
  }

  const colList = colNames.join(', ')
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ')
  const rawSql = `INSERT INTO "LiveSession" (${colList}) VALUES (${placeholders})`

  // Use underlying pg client for parameter binding
  const client = tx.session?.client
  if (client) {
    await client.query(rawSql, values)
  } else {
    // Fallback: execute without params (should not happen)
    await tx.execute(sql.raw(rawSql))
  }
}

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: templateCourseId } = await params
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
      .where(and(eq(course.courseId, templateCourseId), eq(course.creatorId, userId)))
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
        const courseName = `${v.category} - ${v.nationality}`

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
              price: typeof v.price === 'number' ? v.price : null,
              currency: v.currency || templateCourse.currency || 'USD',
              isFree: templateCourse.isFree ?? false,
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
            price: typeof v.price === 'number' ? v.price : null,
            currency: v.currency || templateCourse.currency || 'USD',
            isFree: templateCourse.isFree ?? false,
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
            ? new Date(maxScheduledAt.getTime() + Math.max(...sessionDates.map(s => s.durationMinutes || 60)) * 60000)
            : null

          const [existingLiveSessions, existingCalendarEvents] = await Promise.all([
            minScheduledAt && maxScheduledAt
              ? tx
                  .select({
                    scheduledAt: liveSession.scheduledAt,
                    durationMinutes: liveSession.durationMinutes,
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
            existing: { startTime?: Date | null; endTime?: Date | null; scheduledAt?: Date | null; durationMinutes?: number | null }
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
            const sessionEnd = new Date(sessionStart.getTime() + session.durationMinutes * 60000)

            const hasConflict =
              existingLiveSessions.some(ls => overlaps(sessionStart, sessionEnd, ls)) ||
              existingCalendarEvents.some(ce => overlaps(sessionStart, sessionEnd, ce))

            if (hasConflict) continue

            try {
              const liveSessionId = crypto.randomUUID()
              const room = await dailyProvider.createRoom(liveSessionId, {
                maxParticipants: 10,
                durationMinutes: session.durationMinutes,
              })
              await insertLiveSessionRaw(tx, {
                sessionId: liveSessionId,
                tutorId: userId,
                courseId: publishedCourseId,
                title: session.title,
                category: v.category,
                description: templateCourse.description ?? null,
                scheduledAt: session.scheduledAt,
                status: 'scheduled',
                maxStudents: 50,
                durationMinutes: session.durationMinutes,
                roomId: room.id,
                roomUrl: room.url,
              })

              // Create corresponding CalendarEvent for tutor calendar
              const endTime = new Date(session.scheduledAt.getTime() + session.durationMinutes * 60000)
              await tx.insert(calendarEvent).values({
                eventId: crypto.randomUUID(),
                tutorId: userId,
                title: session.title,
                description: templateCourse.description ?? null,
                type: 'LESSON',
                status: 'CONFIRMED',
                startTime: session.scheduledAt,
                endTime,
                timezone: 'UTC',
                isAllDay: false,
                isRecurring: false,
                isVirtual: true,
                location: 'Online',
                meetingUrl: room.url,
                courseId: publishedCourseId,
                maxAttendees: 50,
                createdBy: userId,
                isCancelled: false,
                externalId: liveSessionId,
              })
            } catch (insertError: any) {
              const pgError = insertError?.cause || insertError
              const msg = insertError?.message || String(insertError)
              const pgMsg = pgError?.message || msg
              console.error('[publish] LiveSession insert failed:', {
                message: msg,
                pgMessage: pgMsg,
                pgCode: pgError?.code,
                pgDetail: pgError?.detail,
                pgColumn: pgError?.column,
                pgTable: pgError?.table,
                schemaColumns: Array.from(
                  (
                    await tx.execute(
                      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'LiveSession'`
                    )
                  ).rows as any[]
                ).map((r: any) => r.column_name),
              })
              throw new Error(
                `LiveSession insert failed: ${pgMsg} (code: ${pgError?.code || 'unknown'}). ` +
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
}

// Unpublish: set isPublished=false on all variants for this template
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: templateCourseId } = await params
  const userId = session.user.id

  try {
    const [templateCourse] = await drizzleDb
      .select({ courseId: course.courseId })
      .from(course)
      .where(and(eq(course.courseId, templateCourseId), eq(course.creatorId, userId)))
      .limit(1)

    if (!templateCourse) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
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
}
