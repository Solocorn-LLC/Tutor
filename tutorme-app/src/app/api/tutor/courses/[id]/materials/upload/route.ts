/**
 * POST /api/tutor/courses/[id]/materials/upload
 * Upload course, notes, or topics list. AI converts to editable format and stores.
 * Tutor-only.
 */

import { NextResponse } from 'next/server'
import { withAuth, withCsrf, ValidationError, NotFoundError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { course } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { convertToEditable, convertTopicsToEditable } from '@/lib/agents/course-materials-service'

const TYPES = ['course', 'notes', 'topics'] as const

export const POST = withCsrf(
  withAuth(
    async (req, session, context) => {
      const id = await getParamAsync(context?.params, 'id')
      if (!id) return NextResponse.json({ error: 'Course ID required' }, { status: 400 })

      const [courseRow] = await drizzleDb
        .select({
          id: course.courseId,
          languageOfInstruction: course.languageOfInstruction,
        })
        .from(course)
        .where(eq(course.courseId, id))
      if (!courseRow) throw new NotFoundError('Course not found')

      const body = await req.json().catch(() => ({}))
      const type = body.type as string
      const text = typeof body.text === 'string' ? body.text.trim() : ''

      if (!TYPES.includes(type as (typeof TYPES)[number])) {
        throw new ValidationError('type must be course, notes, or topics')
      }
      if (!text || text.length > 50000) {
        throw new ValidationError('text is required and must be under 50000 characters')
      }

      const lang = courseRow.languageOfInstruction ?? 'en'
      // courseMaterials column doesn't exist
      const materials: Record<string, unknown> = {}

      let editable = ''
      if (type === 'topics') {
        const result = await convertTopicsToEditable({
          topicsListText: text,
          language: lang,
        })
        editable = result.editable
        materials.editableTopics = editable
        materials.topicsText = text
      } else {
        const result = await convertToEditable({
          type: type as 'course' | 'notes',
          rawText: text,
          language: lang,
        })
        editable = result.editable
        if (type === 'course') {
          materials.courseText = text
          materials.editableCourse = editable
        } else {
          materials.notesText = text
          materials.editableNotes = editable
        }
      }

      // Merge new material keys into existing courseMaterials JSONB (preserving other keys)
      await drizzleDb
        .update(course)
        .set({
          courseMaterials: sql`COALESCE("courseMaterials", '{}'::jsonb) || ${JSON.stringify(materials)}::jsonb`,
        })
        .where(eq(course.courseId, id))

      return NextResponse.json({
        type,
        stored: true,
        editable,
        message:
          type === 'topics'
            ? 'Topics converted to editable format.'
            : 'Content converted to editable format.',
      })
    },
    { role: 'TUTOR' }
  )
)
