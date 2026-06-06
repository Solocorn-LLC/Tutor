/**
 * Check Enrollment Status API (Drizzle ORM)
 * GET: Check if student is enrolled in a specific course
 */

import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseEnrollment, courseProgress } from '@/lib/db/schema'

export const GET = withAuth(async (req, session) => {
  const courseId = req.nextUrl.searchParams.get('courseId')

  if (!courseId) {
    return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
  }

  const [enrollment] = await drizzleDb
    .select()
    .from(courseEnrollment)
    .where(
      and(eq(courseEnrollment.studentId, session.user.id), eq(courseEnrollment.courseId, courseId))
    )
    .limit(1)

  const [progress] = await drizzleDb
    .select()
    .from(courseProgress)
    .where(
      and(eq(courseProgress.studentId, session.user.id), eq(courseProgress.courseId, courseId))
    )
    .limit(1)

  let courseData: {
    courseId: string
    name: string
    price: number | null
    currency: string | null
  } | null = null
  if (enrollment) {
    const [courseRow] = await drizzleDb
      .select({
        courseId: course.courseId,
        name: course.name,
        price: course.price,
        currency: course.currency,
      })
      .from(course)
      .where(eq(course.courseId, enrollment.courseId))
      .limit(1)
    courseData = courseRow ?? null
  }

  const isEnrolled = !!enrollment || !!progress

  return NextResponse.json({
    isEnrolled,
    enrollment: enrollment
      ? {
          ...enrollment,
          course: courseData,
        }
      : null,
    progress: progress ?? null,
  })
}, { role: 'STUDENT' })
