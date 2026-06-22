/**
 * GET /api/admin/content/overview
 * Content stats for the admin Content page: course/lesson counts + recent courses.
 */
import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { requireAdmin } from '@/lib/admin/auth'
import { Permissions } from '@/lib/admin/permissions'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseLesson, user, profile } from '@/lib/db/schema'
import { and, eq, isNull, desc, sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdmin(req, Permissions.CONTENT_READ)
  if (!session) return response!

  try {
    const one = async (q: Promise<{ c: number }[]>) => (await q)[0]?.c ?? 0

    const totalCourses = await one(
      drizzleDb
        .select({ c: sql<number>`count(*)::int` })
        .from(course)
        .where(isNull(course.deletedAt))
    )
    const publishedCourses = await one(
      drizzleDb
        .select({ c: sql<number>`count(*)::int` })
        .from(course)
        .where(and(isNull(course.deletedAt), eq(course.isPublished, true)))
    )
    const totalLessons = await one(
      drizzleDb.select({ c: sql<number>`count(*)::int` }).from(courseLesson)
    )

    const recentCourses = await drizzleDb
      .select({
        id: course.courseId,
        name: course.name,
        isPublished: course.isPublished,
        createdAt: course.createdAt,
        creatorName: profile.name,
      })
      .from(course)
      .leftJoin(user, eq(user.userId, course.creatorId))
      .leftJoin(profile, eq(profile.userId, course.creatorId))
      .where(isNull(course.deletedAt))
      .orderBy(desc(course.createdAt))
      .limit(10)

    return NextResponse.json({
      summary: {
        totalCourses,
        publishedCourses,
        draftCourses: Math.max(0, totalCourses - publishedCourses),
        totalLessons,
      },
      recentCourses,
    })
  } catch (error) {
    return handleApiError(
      error,
      'Failed to load content overview',
      'api/admin/content/overview/route.ts'
    )
  }
}
