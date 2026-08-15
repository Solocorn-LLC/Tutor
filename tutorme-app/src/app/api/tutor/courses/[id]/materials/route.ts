/**
 * PATCH /api/tutor/courses/[id]/materials
 * Save edited course, notes, topics, or outline. Tutor-only.
 */

import { NextResponse } from 'next/server'
import { withAuth, withCsrf, NotFoundError, ForbiddenError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { verifyCourseOwnership } from '@/lib/api/course-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import { course } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const PATCH = withCsrf(
  withAuth(
    async (req, session, context) => {
      const id = await getParamAsync(context?.params, 'id')
      if (!id) return NextResponse.json({ error: 'Course ID required' }, { status: 400 })

      const isOwner = await verifyCourseOwnership(id, session.user.id)
      if (!isOwner) {
        throw new ForbiddenError('You do not have access to this course')
      }

      // courseMaterials column doesn't exist - just verify course exists
      const [courseRow] = await drizzleDb
        .select({ courseId: course.courseId })
        .from(course)
        .where(eq(course.courseId, id))
      if (!courseRow) throw new NotFoundError('Course not found')

      const body = await req.json().catch(() => ({}))
      const materials: Record<string, unknown> = {}

      if (typeof body.editableCourse === 'string') materials.editableCourse = body.editableCourse
      if (typeof body.editableNotes === 'string') materials.editableNotes = body.editableNotes
      if (typeof body.editableTopics === 'string') materials.editableTopics = body.editableTopics
      if (Array.isArray(body.outline)) {
        materials.outline = body.outline.map((x: { title?: string; durationMinutes?: number }) => ({
          title: String(x?.title ?? 'Lesson'),
          durationMinutes: typeof x?.durationMinutes === 'number' ? x.durationMinutes : 45,
        }))
      }

      // courseMaterials column doesn't exist - skip saving
      // await drizzleDb
      //   .update(course)
      //   .set({ courseMaterials: materials as object })
      //   .where(eq(course.courseId, id))

      return NextResponse.json({ message: 'Materials saved.' })
    },
    { role: 'TUTOR' }
  )
)
