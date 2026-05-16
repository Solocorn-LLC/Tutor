/**
 * Lesson API Routes
 * GET: Get lesson details
 * POST: Start/resume lesson session
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, NotFoundError, ValidationError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { startLesson, getLessonContent, getNextLesson } from '@/lib/course/lesson-controller'
import { drizzleDb } from '@/lib/db/drizzle'
import { courseLesson } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const GET = withAuth(
  async (req, session, context) => {
    const lessonId = await getParamAsync(context?.params, 'lessonId')
    if (!lessonId) {
      return NextResponse.json({ error: 'Lesson ID required' }, { status: 400 })
    }
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    const lesson = await getLessonContent(lessonId)

    if (action === 'next') {
      const [lessonRecord] = await drizzleDb
        .select()
        .from(courseLesson)
        .where(eq(courseLesson.lessonId, lessonId))
        .limit(1)
      if (!lessonRecord) {
        throw new NotFoundError('Lesson not found')
      }
      // moduleId removed from courseLesson; use alternative approach
      // Try to get courseId from lesson metadata or use empty
      const courseId = ''
      const nextLesson = courseId ? await getNextLesson(session.user.id, courseId) : null
      return NextResponse.json({ nextLesson })
    }

    return NextResponse.json({ lesson })
  },
  { role: 'STUDENT' }
)

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const lessonId = await getParamAsync(context?.params, 'lessonId')
      if (!lessonId) {
        return NextResponse.json({ error: 'Lesson ID required' }, { status: 400 })
      }
      const body = await req.json()
      const { action = 'start' } = body

      if (action === 'start') {
        // Start or resume lesson session
        const lessonLearningSession = await startLesson(session.user.id, lessonId)

        // Get lesson content for initial response
        const lesson = await getLessonContent(lessonId)

        return NextResponse.json({
          success: true,
          session: lessonLearningSession,
          lesson: {
            title: lesson.title,
            objectives: [], // learningObjectives no longer in schema
            concepts: [], // keyConcepts no longer in schema
          },
        })
      }

      throw new ValidationError('Invalid action')
    },
    { role: 'STUDENT' }
  )
)
