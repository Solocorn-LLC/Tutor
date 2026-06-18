/**
 * Course List API
 * GET: List published courses, optionally filtered by subject
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseLesson, courseEnrollment, courseVariant } from '@/lib/db/schema'
import { eq, inArray, sql } from 'drizzle-orm'
import { formatCourseVariantName } from '@/lib/courses/variant-name'

export const GET = withAuth(
  async (req: NextRequest) => {
    const subject = req.nextUrl.searchParams.get('subject')

    let whereClause
    if (subject) {
      const subjectKey = subject.toLowerCase()
      whereClause = sql`${course.categories} IS NOT NULL AND ${course.categories} @> ARRAY[${subjectKey}]::text[]`
    } else {
      whereClause = eq(course.isPublished, true)
    }

    const coursesRows = await drizzleDb
      .select({
        courseId: course.courseId,
        name: course.name,
        description: course.description,
        categories: course.categories,
        price: course.price,
        currency: course.currency,
        isFree: course.isFree,
        createdAt: course.createdAt,
        variantCategory: courseVariant.category,
        variantNationality: courseVariant.nationality,
      })
      .from(course)
      .leftJoin(courseVariant, eq(courseVariant.publishedCourseId, course.courseId))
      .where(whereClause)

    const courseIds = coursesRows.map(c => c.courseId)

    let lessonCounts: { courseId: string; count: number }[] = []
    let enrollmentCounts: { courseId: string; count: number }[] = []

    if (courseIds.length > 0) {
      lessonCounts = await drizzleDb
        .select({
          courseId: courseLesson.courseId,
          count: sql<number>`count(*)::int`,
        })
        .from(courseLesson)
        .where(inArray(courseLesson.courseId, courseIds))
        .groupBy(courseLesson.courseId)

      enrollmentCounts = await drizzleDb
        .select({
          courseId: courseEnrollment.courseId,
          count: sql<number>`count(*)::int`,
        })
        .from(courseEnrollment)
        .where(inArray(courseEnrollment.courseId, courseIds))
        .groupBy(courseEnrollment.courseId)
    }

    const lessonCountMap = new Map(lessonCounts.map(l => [l.courseId, l.count]))
    const enrollmentCountMap = new Map(enrollmentCounts.map(e => [e.courseId, e.count]))

    const courses = coursesRows.map(c => ({
      id: c.courseId,
      name: c.name,
      variantName: formatCourseVariantName(c.variantCategory, c.variantNationality),
      subject: c.categories?.[0] || 'general',
      description: c.description,
      difficulty: 'intermediate',
      estimatedHours: 0,
      price: c.isFree ? 0 : c.price,
      currency: c.currency,
      modulesCount: 0,
      lessonsCount: lessonCountMap.get(c.courseId) ?? 0,
      studentCount: enrollmentCountMap.get(c.courseId) ?? 0,
      createdAt: c.createdAt?.toISOString() ?? new Date().toISOString(),
    }))

    return NextResponse.json({ courses })
  },
  { role: 'STUDENT' }
)
