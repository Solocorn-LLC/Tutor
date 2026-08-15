/**
 * POST /api/tutor/courses/[id]/materials/outline
 * Generate course outline from stored course (each item = one lesson length). Tutor-only.
 */

import { NextResponse } from 'next/server'
import { withAuth, withCsrf, NotFoundError, ForbiddenError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { verifyCourseOwnership } from '@/lib/api/course-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import { course } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { generateCourseOutlineAsModules } from '@/lib/agents/course-materials-service'

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
      const typicalLessonMinutes =
        typeof body.typicalLessonMinutes === 'number'
          ? Math.min(120, Math.max(15, body.typicalLessonMinutes))
          : DEFAULT_LESSON_MINUTES
      const bodyCourseText = typeof body.courseText === 'string' ? body.courseText.trim() : ''
      const bodyNotesText = typeof body.notesText === 'string' ? body.notesText.trim() : ''

      // courseMaterials column doesn't exist
      const materials: Record<string, unknown> = {}
      const courseText =
        bodyCourseText ||
        (materials.editableCourse as string) ||
        (materials.courseText as string) ||
        ''
      const notesOnly = (bodyNotesText || (materials.notesText as string) || '').trim()
      const hasContent = courseText.trim() || notesOnly

      if (!hasContent) {
        return NextResponse.json(
          {
            error: 'Upload at least one of course, notes, or topics before generating the outline.',
          },
          { status: 400 }
        )
      }

      if (bodyCourseText) materials.courseText = bodyCourseText
      if (bodyNotesText) materials.notesText = bodyNotesText

      const notesText = bodyNotesText || (materials.notesText as string) || ''
      const generated = await generateCourseOutlineAsModules({
        courseText: courseText.trim() || notesOnly || '(No course; generate from notes.)',
        notesText: courseText.trim() && notesText ? notesText : undefined,
        subject: courseRow.subject?.[0] || '',
        typicalLessonMinutes,
        language: courseRow.languageOfInstruction ?? 'en',
      })
      const modules = generated.modules
      const outline = generated.outline

      // courseMaterials column doesn't exist - skip saving
      // await drizzleDb
      //   .update(course)
      //   .set({ courseMaterials: materials as object })
      //   .where(eq(course.courseId, id))

      return NextResponse.json({
        outline,
        outlineModules: { modules },
        message: 'Course outline generated. You can populate the class schedule from it.',
      })
    },
    { role: 'TUTOR' }
  )
)
