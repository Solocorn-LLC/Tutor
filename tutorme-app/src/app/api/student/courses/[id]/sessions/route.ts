import { NextResponse } from 'next/server'
import { eq, and, asc } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession as liveSessionTable, courseEnrollment, course } from '@/lib/db/schema'
import { or, isNull } from 'drizzle-orm'
import { generateUpcomingSessions, mergeSessions } from '@/lib/schedule-sessions'
import { resolveCourseScheduleSlots } from '@/lib/sessions/course-schedule-slots'

export const GET = withAuth(
  async (req, session, context) => {
    try {
      const studentId = session.user.id

      const courseId = await getParamAsync(context.params, 'id')

      if (!courseId || courseId === 'undefined' || courseId === 'null') {
        return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
      }

      // Verify enrollment
      const [enrollment] = await drizzleDb
        .select()
        .from(courseEnrollment)
        .where(
          and(eq(courseEnrollment.courseId, courseId), eq(courseEnrollment.studentId, studentId))
        )
        .limit(1)

      if (!enrollment) {
        return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 })
      }

      // Get course details for schedule + name
      const [courseRow] = await drizzleDb
        .select({
          name: course.name,
          category: course.categories,
          schedule: course.schedule,
        })
        .from(course)
        .where(eq(course.courseId, courseId))
        .limit(1)

      // Fetch real live sessions, scoped to the student's chosen schedule when
      // they have one (a switch then cascades to which sessions they see).
      // One-time/ad-hoc sessions (scheduleId null) are shown to everyone.
      const enrolledScheduleId = (enrollment as { scheduleId?: string | null }).scheduleId ?? null
      const realSessions = await drizzleDb.query.liveSession.findMany({
        where: enrolledScheduleId
          ? and(
              eq(liveSessionTable.courseId, courseId),
              or(
                eq(liveSessionTable.scheduleId, enrolledScheduleId),
                isNull(liveSessionTable.scheduleId)
              )
            )
          : eq(liveSessionTable.courseId, courseId),
        orderBy: [asc(liveSessionTable.scheduledAt)],
      })

      const formattedReal = realSessions.map(s => ({
        id: s.sessionId,
        title: s.title,
        category: s.category,
        description: s.description,
        scheduledAt: s.scheduledAt?.toISOString() ?? null,
        startedAt: s.startedAt?.toISOString() ?? null,
        endedAt: s.endedAt?.toISOString() ?? null,
        status: s.status,
        roomId: s.roomId,
        roomUrl: s.roomUrl,
        recordingUrl: s.recordingUrl ?? null,
        tutorId: s.tutorId,
        isVirtual: false,
        durationMinutes: s.durationMinutes ?? 120,
        maxStudents: s.maxStudents ?? 50,
      }))

      // Generate virtual sessions from the schedule that publish actually
      // materializes from (CourseSchedule table), falling back to the legacy
      // course.schedule JSON for unpublished drafts.
      const schedule = await resolveCourseScheduleSlots(
        courseId,
        courseRow?.schedule,
        enrolledScheduleId
      )

      const virtualSessions = generateUpcomingSessions(
        schedule,
        courseRow?.name || 'Class',
        courseRow?.category?.[0] || 'General',
        {
          count: 12,
          maxStudents: 50,
        }
      )

      const merged = mergeSessions(formattedReal, virtualSessions)

      return NextResponse.json({ sessions: merged })
    } catch (err: unknown) {
      const e = err as Error
      console.error('[Student Sessions API] Error:', e)
      return NextResponse.json(
        { error: 'Internal server error', detail: e?.message || String(e) },
        { status: 500 }
      )
    }
  },
  { role: 'STUDENT' }
)
