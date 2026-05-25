import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { verifyCourseOwnership } from '@/lib/api/course-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseLesson } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'

interface ScheduleItem {
  dayOfWeek: string
  startTime: string
  durationMinutes: number
  date?: string
}

interface CloneRequest {
  name?: string
  category?: string
  price?: number | null
  currency?: string
  isFree?: boolean
  languageOfInstruction?: string
  schedule?: ScheduleItem[]
}

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const params = await context.params
      const sourceCourseId = params.id as string
      const userId = session.user.id

      let body: CloneRequest = {}
      try {
        body = (await req.json()) as CloneRequest
      } catch {
        body = {}
      }

      try {
        // Verify ownership of the source course
        const isOwner = await verifyCourseOwnership(sourceCourseId, userId)
        if (!isOwner) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // Fetch source course
        const [sourceCourse] = await drizzleDb
          .select({
            courseId: course.courseId,
            name: course.name,
            description: course.description,
            categories: course.categories,
            isLiveOnline: course.isLiveOnline,
            isFree: course.isFree,
            price: course.price,
            currency: course.currency,
            languageOfInstruction: course.languageOfInstruction,
            schedule: course.schedule,
          })
          .from(course)
          .where(eq(course.courseId, sourceCourseId))
          .limit(1)

        if (!sourceCourse) {
          return NextResponse.json({ error: 'Course not found' }, { status: 404 })
        }

        // Fetch lessons from source course
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
          .where(eq(courseLesson.courseId, sourceCourseId))
          .orderBy(courseLesson.order)

        const now = new Date()
        const newCourseId = crypto.randomUUID()

        // Build categories array
        const categories = body.category
          ? [body.category]
          : sourceCourse.categories || []

        // Build schedule
        const schedule = Array.isArray(body.schedule) ? body.schedule : []

        // Determine pricing
        const isFree =
          typeof body.isFree === 'boolean' ? body.isFree : (sourceCourse.isFree ?? false)
        const price = isFree ? 0 : typeof body.price === 'number' ? body.price : sourceCourse.price

        // Create new independent course
        await drizzleDb.insert(course).values({
          courseId: newCourseId,
          name: body.name || `${sourceCourse.name} — Copy`,
          description: sourceCourse.description,
          categories,
          isPublished: false,
          createdAt: now,
          updatedAt: now,
          creatorId: userId,
          isLiveOnline: sourceCourse.isLiveOnline ?? false,
          languageOfInstruction: body.languageOfInstruction || sourceCourse.languageOfInstruction || null,
          price,
          currency: body.currency || sourceCourse.currency || 'USD',
          isFree,
          schedule,
        })

        // Copy lessons
        for (const lesson of sourceLessons) {
          await drizzleDb.insert(courseLesson).values({
            lessonId: crypto.randomUUID(),
            courseId: newCourseId,
            title: lesson.title,
            description: lesson.description,
            duration: lesson.duration ?? 60,
            order: lesson.order,
            builderData: lesson.builderData,
            createdAt: now,
            updatedAt: now,
          })
        }

        return NextResponse.json({
          success: true,
          courseId: newCourseId,
          name: body.name || `${sourceCourse.name} — Copy`,
        })
      } catch (error: any) {
        console.error('[POST /api/tutor/courses/[id]/clone] Error:', error)
        return NextResponse.json(
          {
            error: error.message || 'Failed to clone course',
          },
          { status: 500 }
        )
      }
    },
    { role: 'TUTOR' }
  )
)
