import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'

/**
 * One-time admin endpoint to clean up orphaned live sessions.
 * Orphaned sessions are those where:
 * - courseId is NULL (course was deleted)
 * - status is still 'scheduled' (never got cancelled)
 *
 * These sessions block time slots in the scheduler showing as "Unavailable".
 * This endpoint updates them to status='ended' so they no longer block.
 *
 * Run via: POST /api/admin/cleanup-orphaned-sessions?token=ADMIN_SECRET
 */

const ADMIN_SECRET = process.env.ADMIN_CLEANUP_SECRET || 'cleanup-orphaned-sessions-2026'

export const POST = withAuth(
  async (req: NextRequest) => {
    try {
      // Verify admin token from query param
      const url = new URL(req.url)
      const token = url.searchParams.get('token')

      if (token !== ADMIN_SECRET) {
        return NextResponse.json(
          { error: 'Unauthorized. Provide correct ?token= query parameter.' },
          { status: 403 }
        )
      }

      // Find orphaned scheduled sessions (course was deleted, courseId is NULL)
      const orphaned = await drizzleDb
        .select({
          sessionId: liveSession.sessionId,
          title: liveSession.title,
          scheduledAt: liveSession.scheduledAt,
        })
        .from(liveSession)
        .where(
          and(
            isNull(liveSession.courseId),
            eq(liveSession.status, 'scheduled')
          )
        )

      if (orphaned.length === 0) {
        return NextResponse.json({
          message: 'No orphaned sessions found.',
          updatedCount: 0,
          sessions: [],
        })
      }

      // Update status to 'ended' so they no longer block the scheduler
      const result = await drizzleDb
        .update(liveSession)
        .set({ status: 'ended', endedAt: new Date() })
        .where(
          and(
            isNull(liveSession.courseId),
            eq(liveSession.status, 'scheduled')
          )
        )
        .returning({ sessionId: liveSession.sessionId })

      return NextResponse.json({
        message: `Updated ${result.length} orphaned sessions to 'ended' status.`,
        updatedCount: result.length,
        sessions: orphaned.map(s => ({
          sessionId: s.sessionId,
          title: s.title,
          scheduledAt: s.scheduledAt,
        })),
      })
    } catch (error: any) {
      console.error('[POST /api/admin/cleanup-orphaned-sessions] Error:', error)
      return NextResponse.json(
        { error: 'Cleanup failed: ' + (error.message || 'Unknown error') },
        { status: 500 }
      )
    }
  },
  { role: 'TUTOR' } // Require tutor auth (additional safety)
)
