/**
 * Public API to list active Go Live demo sessions.
 * GET /api/public/live-sessions?type=GO_LIVE_DEMO&status=active
 */

import { NextRequest, NextResponse } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, user, profile, course } from '@/lib/db/schema'
import type { LiveSessionStatus, Role } from '@/lib/db/schema/enums'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

const VALID_SESSION_TYPES = ['ADHOC', 'COURSE', 'ONE_ON_ONE', 'CLINIC', 'GO_LIVE_DEMO']

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionType = searchParams.get('type')?.toUpperCase() || 'GO_LIVE_DEMO'
    const statusParam = searchParams.get('status')?.toLowerCase() || 'active'

    if (!VALID_SESSION_TYPES.includes(sessionType)) {
      return NextResponse.json({ error: 'Invalid session type' }, { status: 400 })
    }

    const statuses =
      statusParam === 'active'
        ? ['scheduled', 'active', 'preparing', 'live', 'paused']
        : statusParam
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)

    const pageSize = Math.min(60, Math.max(1, Number(searchParams.get('pageSize')) || 24))

    console.log('[GET /api/public/live-sessions] params:', {
      sessionType,
      statusParam,
      statuses,
      pageSize,
    })

    // Self-healing schema guard: the LiveSession table may not yet have the
    // sessionType column in older environments. Add it idempotently before any
    // query depends on it.
    await drizzleDb.execute(
      sql`ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "sessionType" text NOT NULL DEFAULT 'ADHOC'`
    )

    const rows = await drizzleDb
      .select({
        sessionId: liveSession.sessionId,
        title: liveSession.title,
        description: liveSession.description,
        status: liveSession.status,
        scheduledAt: liveSession.scheduledAt,
        startedAt: liveSession.startedAt,
        tutorId: liveSession.tutorId,
        tutorUsername: sql<string>`coalesce(${profile.username}, ${user.handle})`.as(
          'tutorUsername'
        ),
        tutorName: sql<string | null>`coalesce(${profile.name}, ${user.handle}, ${user.email})`.as(
          'tutorName'
        ),
        tutorAvatarUrl: sql<string | null>`coalesce(${profile.avatarUrl}, ${user.image})`.as(
          'tutorAvatarUrl'
        ),
        tutorCountry: sql<
          string | null
        >`coalesce(${profile.countryOfResidence}, ${profile.nationality})`.as('tutorCountry'),
        tutorRole: user.role,
        courseName: course.name,
      })
      .from(liveSession)
      .innerJoin(user, eq(liveSession.tutorId, user.userId))
      .leftJoin(profile, eq(liveSession.tutorId, profile.userId))
      .leftJoin(course, eq(liveSession.courseId, course.courseId))
      .where(
        and(
          eq(liveSession.sessionType, sessionType),
          inArray(liveSession.status, statuses as LiveSessionStatus[]),
          eq(user.role, 'TUTOR' as Role)
        )
      )
      .orderBy(desc(liveSession.scheduledAt))
      .limit(pageSize)

    console.log(`[GET /api/public/live-sessions] found ${rows.length} session(s)`)

    if (rows.length === 0) {
      try {
        const allDemos = await drizzleDb
          .select({ count: sql<number>`count(*)::int`.as('count') })
          .from(liveSession)
          .where(eq(liveSession.sessionType, 'GO_LIVE_DEMO'))
        const allActive = await drizzleDb
          .select({ count: sql<number>`count(*)::int`.as('count') })
          .from(liveSession)
          .where(
            inArray(liveSession.status, ['active', 'live', 'scheduled'] as LiveSessionStatus[])
          )
        console.log('[GET /api/public/live-sessions] diagnostics:', {
          totalGoLiveDemoSessions: allDemos[0]?.count ?? 0,
          totalActiveOrLiveOrScheduledSessions: allActive[0]?.count ?? 0,
        })
      } catch (diagErr) {
        console.warn('[GET /api/public/live-sessions] diagnostic query failed:', diagErr)
      }
    }

    const sessions = rows.map(row => ({
      id: row.sessionId,
      sessionId: row.sessionId,
      title: row.title || 'Live Demo',
      description: row.description || null,
      status: row.status,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      tutor: {
        id: row.tutorId,
        username: row.tutorUsername || '',
        name: row.tutorName || '',
        avatarUrl: row.tutorAvatarUrl || null,
        country: row.tutorCountry || '',
      },
      courseName: row.courseName || null,
    }))

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('[GET /api/public/live-sessions] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch live sessions' }, { status: 500 })
  }
}
