import { NextResponse } from 'next/server'
import { eq, and, asc, inArray } from 'drizzle-orm'
import { expandToCourseFamily } from '@/lib/courses/variant-family'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  liveSession as liveSessionTable,
  courseEnrollment,
  course,
  courseLesson,
} from '@/lib/db/schema'
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
      // Lesson titles so each session can show which lesson it covers.
      // The student enrolls in the published variant, but lessons/sessions may be
      // stored under the template id — match the whole variant family.
      const familyIds = await expandToCourseFamily([courseId])
      const lessonRows = await drizzleDb
        .select({ id: courseLesson.lessonId, title: courseLesson.title, order: courseLesson.order })
        .from(courseLesson)
        .where(and(inArray(courseLesson.courseId, familyIds), isNull(courseLesson.deletedAt)))
        .orderBy(asc(courseLesson.order))
      const lessonTitleById = new Map(lessonRows.map(l => [l.id, l.title]))
      const lessonNumberById = new Map(lessonRows.map((l, i) => [l.id, i + 1]))

      const enrolledScheduleId = (enrollment as { scheduleId?: string | null }).scheduleId ?? null
      const realSessions = await drizzleDb.query.liveSession.findMany({
        where: enrolledScheduleId
          ? and(
              inArray(liveSessionTable.courseId, familyIds),
              or(
                eq(liveSessionTable.scheduleId, enrolledScheduleId),
                isNull(liveSessionTable.scheduleId)
              )
            )
          : inArray(liveSessionTable.courseId, familyIds),
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
        lessonId: s.lessonId ?? null,
        lessonTitle: s.lessonId ? (lessonTitleById.get(s.lessonId) ?? null) : null,
        lessonNumber: s.lessonId ? (lessonNumberById.get(s.lessonId) ?? null) : null,
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
