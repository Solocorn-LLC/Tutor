/**
 * GET /api/tutor/analytics
 * Returns lifetime analytics aggregates for the current tutor.
 */

import { NextResponse } from 'next/server'
import { eq, and, count, countDistinct, isNull } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  profile,
  course,
  courseEnrollment,
  liveSession,
  payment,
} from '@/lib/db/schema'
import { getPlatformFeeRate } from '@/lib/financial/calculations'

export const GET = withAuth(
  async (_req, session) => {
    const tutorId = session.user.id

    try {
      const [
        profileData,
        totalCoursesRes,
        totalStudentsRes,
        totalSessionsRes,
        completedPayments,
      ] = await Promise.all([
        drizzleDb
          .select({ currency: profile.currency })
          .from(profile)
          .where(eq(profile.userId, tutorId))
          .limit(1),

        drizzleDb
          .select({ value: count() })
          .from(course)
          .where(
            and(
              eq(course.creatorId, tutorId),
              eq(course.isPublished, true),
              isNull(course.deletedAt)
            )
          ),

        drizzleDb
          .select({ value: countDistinct(courseEnrollment.studentId) })
          .from(courseEnrollment)
          .innerJoin(course, eq(courseEnrollment.courseId, course.courseId))
          .where(eq(course.creatorId, tutorId)),

        drizzleDb
          .select({ value: count() })
          .from(liveSession)
          .where(
            and(
              eq(liveSession.tutorId, tutorId),
              eq(liveSession.status, 'ended')
            )
          ),

        drizzleDb
          .select({ amount: payment.amount })
          .from(payment)
          .where(and(eq(payment.status, 'COMPLETED'), eq(payment.tutorId, tutorId))),
      ])

      const totalCourses = Number(totalCoursesRes[0]?.value || 0)
      const totalStudents = Number(totalStudentsRes[0]?.value || 0)
      const totalSessions = Number(totalSessionsRes[0]?.value || 0)

      const gross = completedPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
      const rate = getPlatformFeeRate()
      const totalRevenues = Math.round(gross * (1 - rate) * 100) / 100

      const currency = profileData[0]?.currency ?? 'SGD'

      return NextResponse.json({
        totalCourses,
        totalStudents,
        totalRevenues,
        totalSessions,
        currency,
      })
    } catch (error) {
      console.error('Tutor analytics error:', error)
      return NextResponse.json(
        {
          totalCourses: 0,
          totalStudents: 0,
          totalRevenues: 0,
          totalSessions: 0,
          currency: 'SGD',
        },
        { status: 500 }
      )
    }
  },
  { role: 'TUTOR' }
)
