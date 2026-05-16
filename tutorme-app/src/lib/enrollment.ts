/**
 * Server-side enrollment logic (course).
 * Used by POST /api/course/[id]/enroll and by payment webhooks for course purchases.
 * Drizzle ORM.
 */

import { eq, and, inArray, sql } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseLesson, courseProgress, courseEnrollment } from '@/lib/db/schema'

export async function enrollStudentInCourse(
  studentId: string,
  courseId: string,
  startDate?: string | Date
): Promise<{ enrolled: boolean; progress?: { progressId: string } }> {
  const [courseRow] = await drizzleDb
    .select()
    .from(course)
    .where(eq(course.courseId, courseId))
    .limit(1)
  if (!courseRow) {
    throw new Error('Course not found')
  }

  const totalLessonsResult = await drizzleDb
    .select({ count: sql<number>`count(*)::int` })
    .from(courseLesson)
    .where(eq(courseLesson.courseId, courseId))
  const totalLessons = totalLessonsResult[0]?.count ?? 0

  const [existingProgress] = await drizzleDb
    .select()
    .from(courseProgress)
    .where(and(eq(courseProgress.studentId, studentId), eq(courseProgress.courseId, courseId)))
    .limit(1)
  if (existingProgress) {
    return { enrolled: false }
  }

  const [existingEnrollment] = await drizzleDb
    .select()
    .from(courseEnrollment)
    .where(and(eq(courseEnrollment.studentId, studentId), eq(courseEnrollment.courseId, courseId)))
    .limit(1)

  if (existingEnrollment) {
    await drizzleDb
      .update(courseEnrollment)
      .set({ enrollmentSource: 'signup' })
      .where(eq(courseEnrollment.enrollmentId, existingEnrollment.enrollmentId))
  } else {
    await drizzleDb.insert(courseEnrollment).values({
      enrollmentId: crypto.randomUUID(),
      studentId,
      courseId,
      startDate: startDate ? new Date(startDate) : undefined,
      enrollmentSource: 'signup',
    })
  }

  const inserted = await drizzleDb
    .insert(courseProgress)
    .values({
      progressId: crypto.randomUUID(),
      studentId,
      courseId,
      lessonsCompleted: 0,
      totalLessons,
      isCompleted: false,
    })
    .returning()

  return {
    enrolled: true,
    progress: inserted[0] ? { progressId: inserted[0].progressId } : undefined,
  }
}
