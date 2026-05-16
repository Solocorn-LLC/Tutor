import { eq, and } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { course } from '@/lib/db/schema'

export async function verifyCourseOwnership(courseId: string, userId: string): Promise<boolean> {
  const existing = await drizzleDb
    .select({ courseId: course.courseId })
    .from(course)
    .where(and(eq(course.courseId, courseId), eq(course.creatorId, userId)))
    .limit(1)
  return existing.length > 0
}
