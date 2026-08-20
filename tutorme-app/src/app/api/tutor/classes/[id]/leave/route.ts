import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getIO } from '@/lib/socket-server-enhanced'

/**
 * POST /api/tutor/classes/:id/leave
 *
 * Records that the tutor has left the classroom. This releases the tutor's
 * "single active session" lock so they can enter another session (or re-enter
 * the same one). The session itself keeps running for students until its
 * scheduled end time, at which point it is auto-ended.
 */
export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const tutorId = session.user.id
      const classId = await getParamAsync(context.params, 'id')
      if (!classId) {
        return NextResponse.json({ error: 'Class ID required' }, { status: 400 })
      }

      const [row] = await drizzleDb
        .select({ sessionId: liveSession.sessionId, status: liveSession.status })
        .from(liveSession)
        .where(and(eq(liveSession.sessionId, classId), eq(liveSession.tutorId, tutorId)))
        .limit(1)

      if (!row) {
        return NextResponse.json(
          { error: 'Class not found or you do not have permission to leave it' },
          { status: 404 }
        )
      }

      if (row.status === 'ended') {
        return NextResponse.json({ success: true, status: 'ended', alreadyEnded: true })
      }

      await drizzleDb
        .update(liveSession)
        .set({ tutorLeftAt: new Date() })
        .where(eq(liveSession.sessionId, classId))

      getIO()?.to(classId).emit('session:tutor_left', { sessionId: classId, tutorId })

      return NextResponse.json({ success: true, status: 'left' })
    },
    { role: 'TUTOR' }
  )
)
