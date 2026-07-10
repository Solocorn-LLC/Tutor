/**
 * GET /api/parent/students
 * List children/students linked to parent's family account
 */

import { NextRequest, NextResponse } from 'next/server'
import { inArray } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { getFamilyAccountForParent } from '@/lib/api/parent-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import { courseEnrollment, courseProgress } from '@/lib/db/schema'
import cacheManager from '@/lib/cache-manager'

const CACHE_TTL = 180

export const GET = withAuth(
  async (req: NextRequest, session) => {
    const family = await getFamilyAccountForParent(session)
    if (!family) {
      return NextResponse.json({ error: 'No family account found' }, { status: 404 })
    }

    const cacheKey = `parent:students:${family.familyAccountId}`
    const cached = await cacheManager.get<object>(cacheKey)
    if (cached) return NextResponse.json({ success: true, data: cached })

    const children = family.members.filter((m: any) =>
      ['child', 'children'].includes(m.relation.toLowerCase())
    )

    if (family.studentIds.length === 0) {
      const data = children.map((m: any) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        relation: m.relation,
        userId: null,
        enrollments: [],
        progress: null,
      }))
      await cacheManager.set(cacheKey, data, {
        ttl: CACHE_TTL,
        tags: [`family:${family.familyAccountId}`],
      })
      return NextResponse.json({ success: true, data })
    }

    const [enrollments, progressRecords] = await Promise.all([
      drizzleDb.query.courseEnrollment.findMany({
        where: inArray(courseEnrollment.studentId, family.studentIds),
        with: {
          course: { columns: { courseId: true, name: true } },
        },
      }),
      drizzleDb.query.courseProgress.findMany({
        where: inArray(courseProgress.studentId, family.studentIds),
      }),
    ])

    const data = children.map((m: any) => {
      const uid = m.userId
      const enrolls = uid ? enrollments.filter((e: any) => e.studentId === uid) : []
      const prog = uid ? progressRecords.find((p: any) => p.studentId === uid) : null
      return {
        id: uid || m.id,
        name: m.user?.profile?.name || m.name,
        email: m.email || m.user?.email,
        relation: m.relation,
        userId: uid,
        enrollments: enrolls.map((e: any) => ({
          courseId: e.course?.courseId,
          courseName: e.course?.name,
          enrolledAt: e.enrolledAt,
        })),
        progress: prog
          ? {
              lessonsCompleted: prog.lessonsCompleted,
              totalLessons: prog.totalLessons,
              averageScore: prog.averageScore,
              isCompleted: prog.isCompleted,
            }
          : null,
        level: null,
        xp: null,
      }
    })

    await cacheManager.set(cacheKey, data, {
      ttl: CACHE_TTL,
      tags: [`family:${family.familyAccountId}`],
    })
    return NextResponse.json({ success: true, data })
  },
  { role: 'PARENT' }
)
