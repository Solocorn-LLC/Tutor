/**
 * GET  /api/tutor/courses/[id]/course  — Load the full builder tree
 * PUT  /api/tutor/courses/[id]/course  — Save (upsert) the full builder tree
 *
 * Simplified API for the new Course -> Lesson -> Tasks/Assessments/Homework structure.
 * All lesson content is stored in the builderData JSONB column.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { verifyCourseOwnership } from '@/lib/api/course-helpers'
import {
  CourseBuilderService,
  LESSON_DEPLOYED_ERROR,
  EMPTY_SAVE_ERROR,
} from '@/lib/services/course-builder.service'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseVariant } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'

// ---- GET — Load builder tree from DB ----

export const GET = withAuth(
  async (req: NextRequest, session, context) => {
    const params = await context.params
    const courseId = params.id as string
    const userId = session.user.id

    try {
      const lessons = await CourseBuilderService.getCourseBuilderData(courseId, userId)
      return NextResponse.json({ lessons })
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      console.error('[CourseBuilder GET] Error:', error.message)
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Not found or not yours' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
  },
  { role: 'TUTOR' }
)

// ---- PUT — Save builder tree to DB (upsert) ----

export const PUT = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const params = await context.params
      const courseId = params.id as string
      const userId = session.user.id

      console.log('[CourseBuilder PUT] Starting save for courseId:', courseId, 'userId:', userId)

      const body = await req.json().catch(() => ({}))
      const lessons = (body as { lessons?: unknown }).lessons
      const description = (body as { description?: string }).description
      const propagateToVariants =
        (body as { propagateToVariants?: boolean }).propagateToVariants === true
      const setIndependent = (body as { setIndependent?: boolean }).setIndependent === true

      try {
        // Verify ownership
        const isOwner = await verifyCourseOwnership(courseId, userId)
        if (!isOwner) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        await CourseBuilderService.updateCourseBuilderData(courseId, userId, lessons)

        // Update course description if provided
        if (typeof description === 'string') {
          await drizzleDb
            .update(course)
            .set({ description: description || null })
            .where(eq(course.courseId, courseId))
        }

        // Find variant info for this course
        const [variantRow] = await drizzleDb
          .select({
            variantId: courseVariant.variantId,
            templateCourseId: courseVariant.templateCourseId,
            publishedCourseId: courseVariant.publishedCourseId,
          })
          .from(courseVariant)
          .where(eq(courseVariant.publishedCourseId, courseId))

        if (variantRow) {
          // Mark this variant as independent if requested
          if (setIndependent) {
            await drizzleDb
              .update(courseVariant)
              .set({ isIndependent: true })
              .where(eq(courseVariant.variantId, variantRow.variantId))
          }

          // Propagate builderData to sibling variants that are not independent
          if (propagateToVariants) {
            const siblingVariants = await drizzleDb
              .select({ publishedCourseId: courseVariant.publishedCourseId })
              .from(courseVariant)
              .where(
                and(
                  eq(courseVariant.templateCourseId, variantRow.templateCourseId),
                  eq(courseVariant.isIndependent, false)
                )
              )

            for (const sibling of siblingVariants) {
              if (sibling.publishedCourseId === courseId) continue
              // Correlate by shared sourceLessonId (fallback: order) and update the
              // sibling's OWN lesson rows in place. Feeding this course's lesson ids
              // straight into updateCourseBuilderData deleted every sibling lesson
              // (their ids never matched) and cascaded away their students' progress.
              await CourseBuilderService.propagateLessonsToVariant(
                sibling.publishedCourseId,
                userId,
                lessons
              )
            }
          }
        }

        return NextResponse.json({ success: true })
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error('Unknown error')
        console.error('[CourseBuilder PUT] Error:', error.message)
        if (error.message.includes('not found')) {
          return NextResponse.json({ error: 'Not found or not yours' }, { status: 404 })
        }
        if (error.message.includes('Invalid payload')) {
          return NextResponse.json({ error: '`lessons` must be an array' }, { status: 400 })
        }
        if (error.message.includes(LESSON_DEPLOYED_ERROR)) {
          return NextResponse.json(
            { error: error.message.replace(`${LESSON_DEPLOYED_ERROR}: `, '') },
            { status: 409 }
          )
        }
        if (error.message.includes(EMPTY_SAVE_ERROR)) {
          return NextResponse.json(
            { error: error.message.replace(`${EMPTY_SAVE_ERROR}: `, '') },
            { status: 409 }
          )
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
      }
    },
    { role: 'TUTOR' }
  )
)

// Alias POST to PUT for frontend compatibility
export { PUT as POST }
