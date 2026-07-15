/**
 * PATCH /api/tutor/sessions/[id]
 * Cancel a specific session, or assign the lesson it covers.
 */

import { NextResponse } from 'next/server'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { expandToCourseFamily } from '@/lib/courses/variant-family'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession as liveSessionTable, courseEnrollment, courseLesson } from '@/lib/db/schema'
import { notifyMany } from '@/lib/notifications/notify'

export const PATCH = withAuth(
  async (req, session, context) => {
    const tutorId = session.user.id

    const sessionId = await getParamAsync(context.params, 'id')

    if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const { action, reason } = body

    if (action !== 'cancel' && action !== 'set-lesson') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Verify the session belongs to this tutor
    const existingSession = await drizzleDb.query.liveSession.findFirst({
      where: and(eq(liveSessionTable.sessionId, sessionId), eq(liveSessionTable.tutorId, tutorId)),
    })

    if (!existingSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Assign / clear the lesson this session covers.
    if (action === 'set-lesson') {
      const rawLessonId = body.lessonId
      let lessonId: string | null = null
      if (typeof rawLessonId === 'string' && rawLessonId) {
        // The lesson must belong to this session's course, so a tutor can't
        // point a session at an unrelated lesson.
        if (!existingSession.courseId) {
          return NextResponse.json(
            { error: 'This session is not tied to a course' },
            { status: 400 }
          )
        }
        const [lesson] = await drizzleDb
          .select({ lessonId: courseLesson.lessonId })
          .from(courseLesson)
          .where(
            and(
              eq(courseLesson.lessonId, rawLessonId),
              eq(courseLesson.courseId, existingSession.courseId),
              isNull(courseLesson.deletedAt)
            )
          )
          .limit(1)
        if (!lesson) {
          return NextResponse.json({ error: 'Lesson not found in this course' }, { status: 400 })
        }
        lessonId = lesson.lessonId
      }

      const [updated] = await drizzleDb
        .update(liveSessionTable)
        .set({ lessonId })
        .where(
          and(eq(liveSessionTable.sessionId, sessionId), eq(liveSessionTable.tutorId, tutorId))
        )
        .returning()

      return NextResponse.json({ message: 'Lesson updated', session: updated })
    }

    if (existingSession.status === 'ended') {
      return NextResponse.json({ error: 'Session has already ended' }, { status: 400 })
    }

    // Mark session as ended with cancellation note
    const cancellationNote = reason ? ` [Cancelled by tutor: ${reason}]` : ' [Cancelled by tutor]'
    const updatedSession = await drizzleDb
      .update(liveSessionTable)
      .set({
        status: 'ended',
        endedAt: new Date(),
        description: (existingSession.description || '') + cancellationNote,
      })
      .where(and(eq(liveSessionTable.sessionId, sessionId), eq(liveSessionTable.tutorId, tutorId)))
      .returning()

    // Notify enrolled students if this session belongs to a course
    if (existingSession.courseId) {
      try {
        const enrollments = await drizzleDb
          .select({ studentId: courseEnrollment.studentId })
          .from(courseEnrollment)
          .where(
            inArray(
              courseEnrollment.courseId,
              await expandToCourseFamily([existingSession.courseId])
            )
          )

        const studentIds = enrollments.map(e => e.studentId)

        if (studentIds.length > 0) {
          const sessionName = existingSession.title || 'A session'
          const message = reason
            ? `The session "${sessionName}" has been cancelled. Reason: ${reason}`
            : `The session "${sessionName}" has been cancelled.`

          await notifyMany({
            userIds: studentIds,
            type: 'class',
            title: 'Session Cancelled',
            message,
            actionUrl: `/student/courses`,
          })
        }
      } catch (err) {
        console.error('Failed to notify students of session cancellation:', err)
      }
    }

    return NextResponse.json({
      message: 'Session cancelled successfully',
      session: updatedSession[0],
    })
  },
  { role: 'TUTOR' }
)
