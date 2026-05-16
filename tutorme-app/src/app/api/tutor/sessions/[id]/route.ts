/**
 * PATCH /api/tutor/sessions/[id]
 * Cancel a specific session
 */

import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession as liveSessionTable, courseEnrollment } from '@/lib/db/schema'
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

    if (action !== 'cancel') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Verify the session belongs to this tutor
    const existingSession = await drizzleDb.query.liveSession.findFirst({
      where: and(eq(liveSessionTable.sessionId, sessionId), eq(liveSessionTable.tutorId, tutorId)),
    })

    if (!existingSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
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
          .where(eq(courseEnrollment.courseId, existingSession.courseId))

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
