/**
 * GET /api/tutor/dashboard/hero-stats
 * Returns hero panel stats: sessions today, active courses, enrollments, 1-on-1 requests.
 */

import { NextResponse } from 'next/server'
import { eq, and, gte, lt, count, isNull, sql, inArray } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  course,
  liveSession,
  courseEnrollment,
  oneOnOneBookingRequest,
} from '@/lib/db/schema'

export const GET = withAuth(
  async (_req, session) => {
    const tutorId = session.user.id

    // Define today's boundaries
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    try {
      const [
        sessionsTodayRes,
        publishedCoursesRes,
        enrollmentsRes,
        oneOnOneRequestsRes,
      ] = await Promise.all([
        // 1. Sessions scheduled for today
        drizzleDb
          .select({ value: count() })
          .from(liveSession)
          .where(
            and(
              eq(liveSession.tutorId, tutorId),
              gte(liveSession.scheduledAt, startOfDay),
              lt(liveSession.scheduledAt, endOfDay)
            )
          ),

        // 2. Active courses: published, not deleted, with enrollments or sessions
        // First get all published course IDs for this tutor
        drizzleDb
          .select({ courseId: course.courseId })
          .from(course)
          .where(
            and(
              eq(course.creatorId, tutorId),
              eq(course.isPublished, true),
              isNull(course.deletedAt)
            )
          ),

        // 3. Total enrollments across tutor's courses
        drizzleDb
          .select({ value: count() })
          .from(courseEnrollment)
          .innerJoin(course, eq(courseEnrollment.courseId, course.courseId))
          .where(eq(course.creatorId, tutorId)),

        // 4. Pending 1-on-1 requests
        drizzleDb
          .select({ value: count() })
          .from(oneOnOneBookingRequest)
          .where(
            and(
              eq(oneOnOneBookingRequest.tutorId, tutorId),
              eq(oneOnOneBookingRequest.status, 'PENDING')
            )
          ),
      ])

      const sessionsToday = Number(sessionsTodayRes[0]?.value || 0)
      const enrollments = Number(enrollmentsRes[0]?.value || 0)
      const oneOnOneRequests = Number(oneOnOneRequestsRes[0]?.value || 0)

      // Compute active courses from published courses that have enrollments or sessions
      const publishedCourseIds = publishedCoursesRes.map(c => c.courseId)
      let activeCourses = 0

      if (publishedCourseIds.length > 0) {
        const [coursesWithEnrollments, coursesWithSessions] = await Promise.all([
          // Courses with at least one enrollment
          drizzleDb
            .selectDistinct({ courseId: courseEnrollment.courseId })
            .from(courseEnrollment)
            .where(inArray(courseEnrollment.courseId, publishedCourseIds)),

          // Courses with at least one session
          drizzleDb
            .selectDistinct({ courseId: liveSession.courseId })
            .from(liveSession)
            .where(
              and(
                eq(liveSession.tutorId, tutorId),
                inArray(liveSession.courseId, publishedCourseIds)
              )
            ),
        ])

        const activeCourseIds = new Set([
          ...coursesWithEnrollments.map(c => c.courseId),
          ...coursesWithSessions.map(c => c.courseId).filter(Boolean),
        ])
        activeCourses = activeCourseIds.size
      }

      return NextResponse.json({
        sessionsToday,
        activeCourses,
        enrollments,
        oneOnOneRequests,
      })
    } catch (error) {
      console.error('Hero stats error:', error)
      return NextResponse.json(
        { sessionsToday: 0, activeCourses: 0, enrollments: 0, oneOnOneRequests: 0 },
        { status: 200 }
      )
    }
  },
  { role: 'TUTOR' }
)
