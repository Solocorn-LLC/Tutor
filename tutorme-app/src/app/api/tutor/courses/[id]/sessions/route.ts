/**
 * GET /api/tutor/courses/[id]/sessions
 * Returns all sessions (live classes) for a specific course.
 */

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { eq, and, asc, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  liveSession as liveSessionTable,
  course,
  courseSchedule,
  courseVariant,
  calendarAvailability,
} from '@/lib/db/schema'
import { formatScheduleName } from '@/lib/sessions/schedule-name'
import { formatCourseVariantName } from '@/lib/courses/variant-name'

export const GET = withAuth(
  async (req, session, context) => {
    const tutorId = session.user.id

    const courseId = await getParamAsync(context.params, 'id')

    if (!courseId || courseId === 'undefined' || courseId === 'null') {
      return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
    }

    const safeUrl = req.nextUrl?.href || req.url || ''
    const urlObj = new URL(safeUrl, 'http://localhost:3000')
    const statusParam = urlObj.searchParams.get('status')
    const allowedStatuses = statusParam
      ? statusParam
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : []

    try {
      // Get course schedule
      const [courseRow] = await drizzleDb
        .select({ name: course.name, category: course.categories, schedule: course.schedule })
        .from(course)
        .where(eq(course.courseId, courseId))
        .limit(1)

      // Map each schedule id -> its display name ("Schedule 1" or the tutor's name),
      // and resolve this course's variant (category × nationality) for labelling.
      const [scheduleRows, [variantRow]] = await Promise.all([
        drizzleDb
          .select({
            scheduleId: courseSchedule.scheduleId,
            name: courseSchedule.name,
            scheduleIndex: courseSchedule.scheduleIndex,
          })
          .from(courseSchedule)
          .where(eq(courseSchedule.courseId, courseId)),
        drizzleDb
          .select({ category: courseVariant.category, nationality: courseVariant.nationality })
          .from(courseVariant)
          .where(eq(courseVariant.publishedCourseId, courseId))
          .limit(1),
      ])
      const scheduleNameById = new Map(
        scheduleRows.map(r => [r.scheduleId, formatScheduleName(r.name, r.scheduleIndex)])
      )
      const variantName = formatCourseVariantName(variantRow?.category, variantRow?.nationality)

      const conditions = [
        eq(liveSessionTable.tutorId, tutorId),
        eq(liveSessionTable.courseId, courseId),
      ]

      if (allowedStatuses.length > 0) {
        conditions.push(inArray(liveSessionTable.status, allowedStatuses as any))
      }

      const sessions = await drizzleDb.query.liveSession.findMany({
        where: and(...conditions),
        with: {
          participants: {
            columns: {
              participantId: true,
            },
          },
        },
        orderBy: asc(liveSessionTable.scheduledAt),
      })

      const formattedReal = sessions.map(s => ({
        id: s.sessionId,
        title: s.title,
        category: s.category,
        description: s.description,
        scheduledAt: s.scheduledAt ? new Date(s.scheduledAt).toISOString() : null,
        startedAt: s.startedAt ? new Date(s.startedAt).toISOString() : null,
        endedAt: s.endedAt ? new Date(s.endedAt).toISOString() : null,
        maxStudents: s.maxStudents,
        enrolledStudents: s.participants?.length || 0,
        status: s.status,
        roomUrl: s.roomUrl,
        recordingUrl: s.recordingUrl ?? null,
        isVirtual: false,
        // null scheduleId = a one-time/ad-hoc session (not tied to the recurring schedule)
        scheduleId: s.scheduleId ?? null,
        scheduleName: s.scheduleId ? (scheduleNameById.get(s.scheduleId) ?? null) : null,
        durationMinutes: s.durationMinutes ?? 120,
      }))

      // The tutor's timezone so the dashboard can render session dates in the
      // same wall clock the schedule was created in.
      const [tutorTzRow] = await drizzleDb
        .select({ timezone: calendarAvailability.timezone })
        .from(calendarAvailability)
        .where(eq(calendarAvailability.tutorId, tutorId))
        .limit(1)
      const tutorTimeZone = tutorTzRow?.timezone || 'UTC'

      return NextResponse.json({
        sessions: formattedReal,
        course: { name: courseRow?.name ?? null, variantName },
        timeZone: tutorTimeZone,
      })
    } catch (err) {
      // Log full error details for debugging
      const errObj = err as any
      console.error('[Tutor Sessions API] Drizzle Error:', {
        message: errObj?.message,
        code: errObj?.code,
        detail: errObj?.detail,
        hint: errObj?.hint,
        position: errObj?.position,
        query: errObj?.query,
        parameters: errObj?.parameters,
        stack: errObj?.stack,
        constructor: err?.constructor?.name,
        allKeys: err ? Object.getOwnPropertyNames(err) : [],
      })

      // Extract the most useful error message
      const pgMessage = errObj?.detail || errObj?.message || 'Database query failed'
      return NextResponse.json({ error: pgMessage, code: errObj?.code || null }, { status: 500 })
    }
  },
  { role: 'TUTOR' }
)
