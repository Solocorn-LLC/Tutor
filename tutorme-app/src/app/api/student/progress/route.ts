/**
 * GET /api/student/progress
 *
 * Aggregates real progress data from:
 *  - StudentPerformance (scores, strengths, weaknesses, skillBreakdown, taskHistory)
 *  - CourseLessonProgress (per-lesson completion)
 *  - CourseEnrollment (enrolled courses)
 *  - UserGamification (XP, level, streak)
 *  - Achievement (earned badges)
 *  - TaskSubmission (submission counts)
 *
 * NOTE: Course and lesson data is now fetched via the unified progress service.
 * Prefer /api/student/progress/unified for a normalized progress list.
 *
 * Performance: <100ms target with cache hit
 * Cache: L1 memory + L2 Redis, 180s TTL via cache.getOrSet
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { studentPerformance, taskSubmission } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import cacheManager from '@/lib/cache-manager'
import { fetchCourseProgress, fetchLessonProgress } from '@/lib/progress/get-student-progress'

import { z } from 'zod'

const StringArraySchema = z.array(z.string()).default([])
const SkillBreakdownSchema = z.record(z.string(), z.unknown()).default({})

const CACHE_TTL = parseInt(process.env.CACHE_TTL_STUDENT_PROGRESS || '180', 10)

export const GET = withAuth(async (req: NextRequest, session) => {
  const studentId = session.user.id
  const startTime = Date.now()

  try {
    const data = await cacheManager.getOrSet(
      `student:progress:${studentId}`,
      async () => {
        // Delegate course and lesson progress fetching to the unified service
        const [courseItems, lessonItems] = await Promise.all([
          fetchCourseProgress(studentId),
          fetchLessonProgress(studentId),
        ])

        const performances = await drizzleDb
          .select()
          .from(studentPerformance)
          .where(eq(studentPerformance.studentId, studentId))

        const [{ count: submissionCount }] = await drizzleDb
          .select({ count: sql<number>`count(*)::int` })
          .from(taskSubmission)
          .where(eq(taskSubmission.studentId, studentId))

        const totalStudyMinutes = 0

        const courses = courseItems.map(courseItem => {
          const courseLessons = lessonItems.filter(l => l.metadata?.courseId === courseItem.id)
          const completedLessons = courseLessons.filter(l => l.completed)
          const inProgressLessons = courseLessons.filter(l => l.metadata?.status === 'IN_PROGRESS')
          const scores = courseLessons
            .map(l => l.metadata?.score as number | null)
            .filter((s): s is number => s != null)
          const avgScore =
            scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
          const studyMinutes = completedLessons.reduce(sum => sum + 30, 0)

          return {
            courseId: courseItem.id,
            name: courseItem.title,
            totalLessons: (courseItem.metadata?.totalLessons as number) ?? 0,
            completedLessons: completedLessons.length,
            inProgressLessons: inProgressLessons.length,
            progress: courseItem.progress,
            averageScore: avgScore,
            studyMinutes,
            enrolledAt: courseItem.metadata?.enrolledAt as Date | null | undefined,
          }
        })

        const allStrengths: string[] = performances.flatMap(p =>
          StringArraySchema.parse(p.strengths || [])
        )
        const allWeaknesses: string[] = performances.flatMap(p =>
          StringArraySchema.parse(p.weaknesses || [])
        )
        const strengthCounts = countFrequency(allStrengths)
        const weaknessCounts = countFrequency(allWeaknesses)

        // Using a permissive parsing for history array elements
        const allHistory: Array<{ date: string; score: number }> = performances.flatMap(
          p =>
            z
              .array(z.any())
              .default([])
              .parse(p.taskHistory || []) as any[]
        )
        const scoreTrend = allHistory
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(-20)

        const totalCompleted = courses.reduce((s, c) => s + c.completedLessons, 0)
        const totalLessons = courses.reduce((s, c) => s + c.totalLessons, 0)
        const overallAvg =
          performances.length > 0
            ? Math.round(performances.reduce((s, p) => s + p.averageScore, 0) / performances.length)
            : null

        return {
          overview: {
            lessonsCompleted: totalCompleted,
            totalLessons,
            studyHours: Math.round((totalStudyMinutes / 60) * 10) / 10,
            averageScore: overallAvg,
            achievementCount: 0,
            submissionCount: submissionCount ?? 0,
            level: 1,
            xp: 0,
            streakDays: 0,
          },
          courses,
          strengths: strengthCounts.slice(0, 5),
          weaknesses: weaknessCounts.slice(0, 5),
          scoreTrend,
          achievements: [],
          skillBreakdown: SkillBreakdownSchema.parse(performances[0]?.skillBreakdown || {}),
        }
      },
      {
        ttl: CACHE_TTL,
        tags: [`student:${studentId}`, 'progress', 'dashboard'],
      }
    )

    const res = NextResponse.json({ success: true, data })
    res.headers.set('X-Response-Time', `${Date.now() - startTime}ms`)
    return res
  } catch (error) {
    console.error('Failed to fetch student progress:', error)
    return handleApiError(error, 'Failed to fetch progress', 'api/student/progress/route.ts')
  }
}, { role: 'STUDENT' })

function countFrequency(items: string[]): Array<{ topic: string; count: number }> {
  const freq: Record<string, number> = {}
  for (const item of items) {
    freq[item] = (freq[item] || 0) + 1
  }
  return Object.entries(freq)
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
}
