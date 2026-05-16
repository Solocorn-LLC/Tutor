import { NextResponse } from 'next/server'
import { eq, and, asc } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession as liveSessionTable, courseEnrollment, course } from '@/lib/db/schema'
import { generateUpcomingSessions, mergeSessions } from '@/lib/schedule-sessions'

export const GET = withAuth(async (req, session, context) => {
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

    // Fetch real live sessions
    const realSessions = await drizzleDb.query.liveSession.findMany({
      where: eq(liveSessionTable.courseId, courseId),
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
      tutorId: s.tutorId,
      isVirtual: false,
      durationMinutes: s.durationMinutes ?? 120,
      maxStudents: s.maxStudents ?? 50,
    }))

    // Generate virtual sessions from schedule
    const schedule = (courseRow?.schedule || []) as Array<{
      dayOfWeek: string
      startTime: string
      durationMinutes: number
    }>

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
})
