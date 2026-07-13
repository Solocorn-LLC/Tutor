/**
 * GET /api/student/learning-path
 *
 * Returns a personalized learning path:
 *  - currentLesson: the lesson currently in progress
 *  - nextLessons: next 3 lessons in sequence (prioritising weak areas)
 *  - focusAreas: top 3 weak topics with links to relevant tasks
 *  - overallPath: full ordered list of lessons with status
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { getServerSession, authOptions } from '@/lib/auth'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  courseEnrollment,
  course,
  courseLesson,
  courseLessonProgress,
  studentPerformance,
} from '@/lib/db/schema'
import { eq, inArray, and, asc } from 'drizzle-orm'
import { expandFamilyWithMap } from '@/lib/courses/variant-family'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const studentId = session.user.id

  try {
    const enrollmentRows = await drizzleDb
      .select()
      .from(courseEnrollment)
      .where(eq(courseEnrollment.studentId, studentId))

    const courseIds = enrollmentRows.map(e => e.courseId)
    if (courseIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          currentLesson: null,
          nextLessons: [],
          focusAreas: [],
          completedCount: 0,
          totalCount: 0,
          progressPercent: 0,
        },
      })
    }

    const curricula = await drizzleDb
      .select()
      .from(course)
      .where(inArray(course.courseId, courseIds))

    const courseMap = new Map(curricula.map(c => [c.courseId, c]))

    // Lessons may be authored under the template id while the student enrolled in
    // a published variant — fetch across the variant family and roll each lesson
    // up under the ENROLLED id so `lessonsByCourse.get(enrollment.courseId)` finds
    // them.
    const { ids: lessonCourseIds, toEnrolled } = await expandFamilyWithMap(courseIds)
    const lessons =
      lessonCourseIds.length > 0
        ? await drizzleDb
            .select()
            .from(courseLesson)
            .where(inArray(courseLesson.courseId, lessonCourseIds))
            .orderBy(asc(courseLesson.order))
        : []

    const lessonsByCourse = new Map<string, typeof lessons>()
    for (const l of lessons) {
      const courseId = toEnrolled.get(l.courseId ?? '') ?? l.courseId ?? 'default'
      const list = lessonsByCourse.get(courseId) ?? []
      list.push(l)
      lessonsByCourse.set(courseId, list)
    }

    const allLessonIds = lessons.map(l => l.lessonId)
    const lessonProgress =
      allLessonIds.length > 0
        ? await drizzleDb
            .select()
            .from(courseLessonProgress)
            .where(
              and(
                eq(courseLessonProgress.studentId, studentId),
                inArray(courseLessonProgress.lessonId, allLessonIds)
              )
            )
        : []

    const progressMap = new Map(lessonProgress.map(lp => [lp.lessonId, lp]))

    const performances = await drizzleDb
      .select()
      .from(studentPerformance)
      .where(eq(studentPerformance.studentId, studentId))

    const allWeaknesses: string[] = performances.flatMap(p => (p.weaknesses as string[]) || [])

    type PathEntry = {
      lessonId: string
      title: string
      description: string | null
      courseName: string
      courseId: string
      status: 'completed' | 'in_progress' | 'not_started'
      score: number | null
      order: number
    }

    const pathEntries: PathEntry[] = []
    let globalOrder = 0

    for (const enrollment of enrollmentRows) {
      const courseRow = courseMap.get(enrollment.courseId)
      if (!courseRow) continue
      const courseLessons = lessonsByCourse.get(enrollment.courseId) ?? []
      for (const lesson of courseLessons) {
        const prog = progressMap.get(lesson.lessonId)
        const status: 'completed' | 'in_progress' | 'not_started' =
          prog?.status === 'COMPLETED'
            ? 'completed'
            : prog?.status === 'IN_PROGRESS'
              ? 'in_progress'
              : 'not_started'

        pathEntries.push({
          lessonId: lesson.lessonId,
          title: lesson.title,
          description: null,
          courseName: courseRow.name,
          courseId: courseRow.courseId,
          status,
          score: prog?.score ?? null,
          order: globalOrder++,
        })
      }
    }

    const currentLesson =
      pathEntries.find(e => e.status === 'in_progress') ??
      pathEntries.find(e => e.status === 'not_started') ??
      null

    const notStarted = pathEntries.filter(
      e => e.status === 'not_started' && e.lessonId !== currentLesson?.lessonId
    )

    const scored = notStarted.map(lesson => {
      const weaknessBoost = allWeaknesses.some(
        w =>
          lesson.title.toLowerCase().includes(w.toLowerCase()) ||
          (lesson.description || '').toLowerCase().includes(w.toLowerCase())
      )
        ? -100
        : 0
      return { ...lesson, sortKey: lesson.order + weaknessBoost }
    })
    scored.sort((a, b) => a.sortKey - b.sortKey)
    const nextLessons = scored.slice(0, 3)

    const weakFreq: Record<string, number> = {}
    for (const w of allWeaknesses) weakFreq[w] = (weakFreq[w] || 0) + 1
    const focusAreas = Object.entries(weakFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([topic, count]) => ({ topic, frequency: count }))

    const completedCount = pathEntries.filter(e => e.status === 'completed').length
    const totalCount = pathEntries.length

    return NextResponse.json({
      success: true,
      data: {
        currentLesson,
        nextLessons,
        focusAreas,
        completedCount,
        totalCount,
        progressPercent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
      },
    })
  } catch (error) {
    console.error('Failed to fetch learning path:', error)
    return handleApiError(
      error,
      'Failed to fetch learning path',
      'api/student/learning-path/route.ts'
    )
  }
}
