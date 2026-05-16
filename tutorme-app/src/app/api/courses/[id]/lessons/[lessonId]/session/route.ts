/**
 * Lesson Session API
 * POST: Get or create lesson session for a student
 */

import { NextResponse } from 'next/server'
import { withAuth, withCsrf, NotFoundError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { courseLesson, lessonLearningSession } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { startLesson } from '@/lib/course/lesson-controller'

export const POST = withCsrf(
  withAuth(
    async (_req, session, context) => {
      const lessonId = await getParamAsync(context?.params, 'lessonId')
      if (!lessonId) {
        return NextResponse.json({ error: 'Lesson ID required' }, { status: 400 })
      }

      const [lesson] = await drizzleDb
        .select()
        .from(courseLesson)
        .where(eq(courseLesson.lessonId, lessonId))
        .limit(1)

      if (!lesson) {
        throw new NotFoundError('Lesson not found')
      }

      const [existing] = await drizzleDb
        .select()
        .from(lessonLearningSession)
        .where(
          and(
            eq(lessonLearningSession.studentId, session.user.id),
            eq(lessonLearningSession.lessonId, lessonId)
          )
        )
        .limit(1)

      const sessionData = existing ?? (await startLesson(session.user.id, lessonId))

      return NextResponse.json({ session: sessionData })
    },
    { role: 'STUDENT' }
  )
)
