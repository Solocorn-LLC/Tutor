/**
 * GET /api/admin/analytics/overview?days=N
 * Core platform stats for the admin dashboard + analytics page.
 * Returns `summary` (headline counts) and `usersByRole`. The heavier
 * `enterprise` block is intentionally omitted — every consumer guards it with
 * optional chaining, so the cards degrade to zero rather than break.
 */
import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { requireAdmin } from '@/lib/admin/auth'
import { Permissions } from '@/lib/admin/permissions'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, liveSession, courseEnrollment } from '@/lib/db/schema'
import { sql, gte } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdmin(req, Permissions.ANALYTICS_READ)
  if (!session) return response!

  try {
    const url = new URL(req.url)
    const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '7', 10) || 7))
    const cutoff = new Date(Date.now() - days * 86_400_000)

    const count = async (q: Promise<{ c: number }[]>) => (await q)[0]?.c ?? 0

    const totalUsers = await count(drizzleDb.select({ c: sql<number>`count(*)::int` }).from(user))
    const totalSessions = await count(
      drizzleDb.select({ c: sql<number>`count(*)::int` }).from(liveSession)
    )
    const totalEnrollments = await count(
      drizzleDb.select({ c: sql<number>`count(*)::int` }).from(courseEnrollment)
    )
    const newUsers = await count(
      drizzleDb
        .select({ c: sql<number>`count(*)::int` })
        .from(user)
        .where(gte(user.createdAt, cutoff))
    )
    // Active users in the window: students with recent enrollment activity +
    // tutors who ran a session. A user counted in both is negligible double-count.
    const activeStudents = await count(
      drizzleDb
        .select({ c: sql<number>`count(distinct ${courseEnrollment.studentId})::int` })
        .from(courseEnrollment)
        .where(gte(courseEnrollment.lastActivity, cutoff))
    )
    const activeTutors = await count(
      drizzleDb
        .select({ c: sql<number>`count(distinct ${liveSession.tutorId})::int` })
        .from(liveSession)
        .where(gte(liveSession.startedAt, cutoff))
    )

    const usersByRole = await drizzleDb
      .select({ role: user.role, count: sql<number>`count(*)::int` })
      .from(user)
      .groupBy(user.role)

    const prior = Math.max(0, totalUsers - newUsers)
    const userGrowthRate = prior > 0 ? Math.round((newUsers / prior) * 1000) / 10 : 0

    return NextResponse.json({
      summary: {
        totalUsers,
        activeUsers: activeStudents + activeTutors,
        totalSessions,
        totalEnrollments,
        userGrowthRate,
      },
      usersByRole,
      rangeDays: days,
    })
  } catch (error) {
    return handleApiError(
      error,
      'Failed to fetch analytics overview',
      'api/admin/analytics/overview/route.ts'
    )
  }
}
