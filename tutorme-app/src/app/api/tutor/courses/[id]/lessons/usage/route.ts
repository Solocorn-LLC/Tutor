/**
 * POST /api/tutor/courses/[id]/lessons/usage
 *
 * Body: { lessonIds: string[] }
 * Returns per-lesson deployment usage so the builder can block deleting a
 * lesson that has had material deployed from it in a live class.
 */

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { verifyCourseOwnership } from '@/lib/api/course-helpers'
import { getLessonUsage } from '@/lib/courses/lesson-usage'

export const POST = withAuth(
  async (req, session, context) => {
    const courseId = await getParamAsync(context.params, 'id')
    const userId = session.user.id

    if (!courseId || courseId === 'undefined' || courseId === 'null') {
      return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
    }

    const isOwner = await verifyCourseOwnership(courseId, userId)
    if (!isOwner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const lessonIds = Array.isArray(body?.lessonIds)
      ? body.lessonIds.filter((x: unknown): x is string => typeof x === 'string')
      : []

    if (lessonIds.length === 0) {
      return NextResponse.json({ usage: {} })
    }

    const usage = await getLessonUsage(courseId, lessonIds)
    return NextResponse.json({ usage })
  },
  { role: 'TUTOR' }
)
