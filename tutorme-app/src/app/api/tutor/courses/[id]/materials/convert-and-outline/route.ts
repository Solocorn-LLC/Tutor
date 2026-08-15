/**
 * POST /api/tutor/courses/[id]/materials/convert-and-outline
 * Convert course text to editable and generate course outline in one call. Tutor-only.
 */

import { NextResponse } from 'next/server'
import {
  withAuth,
  withCsrf,
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { verifyCourseOwnership } from '@/lib/api/course-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import { course } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  convertToEditable,
  generateCourseOutlineFromCourse,
} from '@/lib/agents/course-materials-service'

const DEFAULT_LESSON_MINUTES = 45

export const POST = withCsrf(
  withAuth(
    async (req, session, context) => {
      const id = await getParamAsync(context?.params, 'id')
      if (!id) return NextResponse.json({ error: 'Course ID required' }, { status: 400 })

      const isOwner = await verifyCourseOwnership(id, session.user.id)
      if (!isOwner) {
        throw new ForbiddenError('You do not have access to this course')
      }

      const [courseRow] = await drizzleDb
        .select({
          id: course.courseId,
          subject: course.categories,
          languageOfInstruction: course.languageOfInstruction,
        })
        .from(course)
        .where(eq(course.courseId, id))
      if (!courseRow) throw new NotFoundError('Course not found')

      const body = await req.json().catch(() => ({}))
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      const typicalLessonMinutes =
        typeof body.typicalLessonMinutes === 'number'
          ? Math.min(120, Math.max(15, body.typicalLessonMinutes))
          : DEFAULT_LESSON_MINUTES

      if (!text || text.length > 50000) {
        throw new ValidationError('text is required and must be under 50000 characters')
      }

      const lang = courseRow.languageOfInstruction ?? 'en'

      // Step 1: Convert to editable
      const converted = await convertToEditable({
        type: 'course',
        rawText: text,
        language: lang,
      })
      const editableCourse = converted.editable

      // Step 2: Generate outline from converted course
      const outlined = await generateCourseOutlineFromCourse({
        courseText: editableCourse,
        subject: courseRow.subject?.[0] || '',
        typicalLessonMinutes,
        language: lang,
      })
      const outline = outlined.outline

      // courseMaterials column doesn't exist - skip saving materials

      return NextResponse.json({
        editableCourse,
        outline,
        message:
          'Course converted and outline generated. You can populate the class schedule from the outline.',
      })
    },
    { role: 'TUTOR' }
  )
)
