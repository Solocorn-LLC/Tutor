/**
 * POST /api/tutor/courses/[id]/schedule/populate-from-outline
 * Generate class schedule slots from the course's stored materials outline. Tutor-only.
 */

import { NextResponse } from 'next/server'
import { withAuth, withCsrf, NotFoundError, ValidationError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { course } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { generateCourseOutlineFromCourse } from '@/lib/agents/course-materials-service'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const POST = withCsrf(
  withAuth(
    async (req, session, context) => {
      const id = await getParamAsync(context?.params, 'id')
      if (!id) return NextResponse.json({ error: 'Course ID required' }, { status: 400 })

      const [courseRow] = await drizzleDb
        .select({
          courseMaterials: course.courseMaterials,
          languageOfInstruction: course.languageOfInstruction,
        })
        .from(course)
        .where(eq(course.courseId, id))
      if (!courseRow) throw new NotFoundError('Course not found')

      const materials = courseRow.courseMaterials as Record<string, string> | null
      const courseText = materials?.courseText ?? materials?.editableCourse ?? ''
      if (!courseText) {
        throw new ValidationError(
          'No course materials found. Upload course content first via the materials upload endpoint.'
        )
      }

      const body = await req.json().catch(() => ({}))
      const typicalLessonMinutes: number =
        typeof body.typicalLessonMinutes === 'number' ? body.typicalLessonMinutes : 60
      const preferredDay: string =
        typeof body.preferredDay === 'string' && DAYS.includes(body.preferredDay)
          ? body.preferredDay
          : 'Monday'

      const { outline } = await generateCourseOutlineFromCourse({
        courseText,
        typicalLessonMinutes,
        language: courseRow.languageOfInstruction ?? 'en',
      })

      if (!outline.length) {
        return NextResponse.json(
          { error: 'Could not extract lessons from course materials. Try uploading clearer content.' },
          { status: 422 }
        )
      }

      // Build schedule items: one slot per lesson, all on the same preferred weekday
      const scheduleItems = outline.map(lesson => ({
        dayOfWeek: preferredDay,
        startTime: '09:00',
        durationMinutes: lesson.durationMinutes,
        title: lesson.title,
      }))

      return NextResponse.json({
        schedule: scheduleItems,
        lessonCount: scheduleItems.length,
        message: `Generated ${scheduleItems.length} schedule slot(s) from course outline.`,
      })
    },
    { role: 'TUTOR' }
  )
)
