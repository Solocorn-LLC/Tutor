/**
 * GET /api/parent/students/[studentId]
 * Returns basic info for a single student (parent must own via family account)
 */

import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { getFamilyAccountForParent } from '@/lib/api/parent-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, courseEnrollment } from '@/lib/db/schema'
import cacheManager from '@/lib/cache-manager'

const CACHE_TTL = parseInt(process.env.CACHE_TTL_STUDENT_ANALYTICS || '45', 10)

export const GET = withAuth(
  async (req: NextRequest, session, context) => {
    const startTime = Date.now()
    const studentId = await getParamAsync(context?.params, 'studentId')
    if (!studentId) {
      return NextResponse.json({ error: 'Student ID required' }, { status: 400 })
    }

    const family = await getFamilyAccountForParent(session)
    if (!family) {
      return NextResponse.json({ error: 'No family account found' }, { status: 404 })
    }

    if (!family.studentIds.includes(studentId)) {
      return NextResponse.json({ error: 'Not authorized to view this student' }, { status: 403 })
    }

    const member = family.members.find(
      m => m.userId === studentId || m.familyMemberId === studentId
    )
    if (!member?.userId) {
      return NextResponse.json({ error: 'Student not linked' }, { status: 404 })
    }

    const cacheKey = `parent:student:analytics:${family.familyAccountId}:${studentId}`
    const cached = await cacheManager.get<object>(cacheKey)
    if (cached) {
      const res = NextResponse.json({ success: true, data: cached })
      res.headers.set('X-Cache', 'HIT')
      res.headers.set('X-Response-Time', `${Date.now() - startTime}ms`)
      return res
    }

    const [userData, enrollments] = await Promise.all([
      drizzleDb.query.user.findFirst({
        where: eq(user.userId, studentId),
        with: {
          profile: { columns: { name: true } },
        },
        columns: {
          userId: true,
          email: true,
        },
      }),
      drizzleDb.query.courseEnrollment.findMany({
        where: eq(courseEnrollment.studentId, studentId),
        with: {
          course: { columns: { courseId: true, name: true } },
        },
      }),
    ])

    if (!userData) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    const data = {
      id: userData.userId,
      name: userData.profile?.name ?? member.name,
      email: userData.email,
      relation: member.relation,
      enrollments: enrollments.map((e: any) => ({
        courseId: e.course.courseId,
        courseName: e.course.name,
        enrolledAt: e.enrolledAt,
      })),
      level: null,
      xp: null,
    }

    await cacheManager.set(cacheKey, data, {
      ttl: CACHE_TTL,
      tags: [`family:${family.familyAccountId}`, `student:${studentId}`],
    })

    const res = NextResponse.json({ success: true, data })
    res.headers.set('X-Cache', 'MISS')
    res.headers.set('X-Response-Time', `${Date.now() - startTime}ms`)
    return res
  },
  { role: 'PARENT' }
)
