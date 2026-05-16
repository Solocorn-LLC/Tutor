/**
 * POST /api/tutor/courses/[id]/sync-content
 * Sync lesson content from one variant to all sibling variants.
 * id = templateCourseId
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { verifyCourseOwnership } from '@/lib/api/course-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseLesson, courseVariant } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const params = await context.params
      const templateCourseId = params.id as string
      const userId = session.user.id
      const body = await req.json().catch(() => ({}))
      const sourcePublishedCourseId =
        typeof body.sourcePublishedCourseId === 'string' ? body.sourcePublishedCourseId : null

      if (!sourcePublishedCourseId) {
        return NextResponse.json({ error: 'sourcePublishedCourseId is required' }, { status: 400 })
      }

      try {
        // Verify ownership of the template course
        const isOwner = await verifyCourseOwnership(templateCourseId, userId)
        if (!isOwner) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // Determine if source is the template itself or a variant
        const isTemplateSource = sourcePublishedCourseId === templateCourseId

        if (!isTemplateSource) {
          // Verify the source variant belongs to this template
          const [sourceLink] = await drizzleDb
            .select({ publishedCourseId: courseVariant.publishedCourseId })
            .from(courseVariant)
            .where(
              and(
                eq(courseVariant.templateCourseId, templateCourseId),
                eq(courseVariant.publishedCourseId, sourcePublishedCourseId)
              )
            )
            .limit(1)

          if (!sourceLink) {
            return NextResponse.json(
              { error: 'Source variant not found for this template' },
              { status: 404 }
            )
          }
        }

        // Load source lessons
        const sourceLessons = await drizzleDb
          .select({
            lessonId: courseLesson.lessonId,
            title: courseLesson.title,
            description: courseLesson.description,
            duration: courseLesson.duration,
            order: courseLesson.order,
            builderData: courseLesson.builderData,
          })
          .from(courseLesson)
          .where(eq(courseLesson.courseId, sourcePublishedCourseId))
          .orderBy(courseLesson.order)

        // Find all sibling variants
        const siblingRows = await drizzleDb
          .select({ publishedCourseId: courseVariant.publishedCourseId })
          .from(courseVariant)
          .where(eq(courseVariant.templateCourseId, templateCourseId))

        const targetIds = siblingRows
          .map(r => r.publishedCourseId)
          .filter(id => id !== sourcePublishedCourseId)

        if (targetIds.length === 0) {
          return NextResponse.json({
            success: true,
            message: 'No sibling variants to sync',
            syncedCount: 0,
          })
        }

        const now = new Date()
        let syncedCount = 0

        await drizzleDb.transaction(async tx => {
          for (const targetId of targetIds) {
            // Delete existing lessons for target
            await tx.delete(courseLesson).where(eq(courseLesson.courseId, targetId))

            // Insert copies from source
            for (const lesson of sourceLessons) {
              await tx.insert(courseLesson).values({
                lessonId: crypto.randomUUID(),
                courseId: targetId,
                title: lesson.title,
                description: lesson.description,
                duration: lesson.duration ?? 60,
                order: lesson.order,
                builderData: lesson.builderData,
                createdAt: now,
                updatedAt: now,
              })
            }

            // Update target course updatedAt
            await tx.update(course).set({ updatedAt: now }).where(eq(course.courseId, targetId))

            syncedCount++
          }

          // If source was a variant (not template), also update the template course
          // so it stays in sync as the master
          if (!isTemplateSource) {
            await tx.delete(courseLesson).where(eq(courseLesson.courseId, templateCourseId))

            for (const lesson of sourceLessons) {
              await tx.insert(courseLesson).values({
                lessonId: crypto.randomUUID(),
                courseId: templateCourseId,
                title: lesson.title,
                description: lesson.description,
                duration: lesson.duration ?? 60,
                order: lesson.order,
                builderData: lesson.builderData,
                createdAt: now,
                updatedAt: now,
              })
            }

            await tx
              .update(course)
              .set({ updatedAt: now })
              .where(eq(course.courseId, templateCourseId))
          }
        })

        return NextResponse.json({
          success: true,
          message: `Synced content to ${syncedCount} variant(s)`,
          syncedCount,
          sourceLessonCount: sourceLessons.length,
        })
      } catch (error: any) {
        console.error('[POST /api/tutor/courses/[id]/sync-content] Error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to sync content' },
          { status: 500 }
        )
      }
    },
    { role: 'TUTOR' }
  )
)
