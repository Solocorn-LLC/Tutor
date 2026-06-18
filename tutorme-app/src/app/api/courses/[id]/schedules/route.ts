/**
 * GET /api/courses/[id]/schedules
 *
 * Public (any authenticated user) read-only list of a course's named schedules,
 * so students can view the available class times and pick one at signup. Returns
 * the schedule name, weekly slots, and computed capacity (spotsLeft / isFull).
 */

import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseSchedule } from '@/lib/db/schema'

export const GET = withAuth(async (req, _session, context) => {
  const courseId = await getParamAsync(context.params, 'id')
  if (!courseId) {
    return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
  }

  const [courseRow] = await drizzleDb
    .select({ courseId: course.courseId })
    .from(course)
    .where(eq(course.courseId, courseId))
    .limit(1)

  if (!courseRow) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  }

  const rows = await drizzleDb
    .select({
      scheduleId: courseSchedule.scheduleId,
      scheduleIndex: courseSchedule.scheduleIndex,
      name: courseSchedule.name,
      schedule: courseSchedule.schedule,
      weeksToSchedule: courseSchedule.weeksToSchedule,
      maxStudents: courseSchedule.maxStudents,
      enrolledCount: courseSchedule.enrolledCount,
    })
    .from(courseSchedule)
    .where(eq(courseSchedule.courseId, courseId))
    .orderBy(courseSchedule.scheduleIndex)

  const schedules = rows.map(r => {
    const spotsLeft =
      typeof r.maxStudents === 'number' ? Math.max(0, r.maxStudents - (r.enrolledCount ?? 0)) : null
    return {
      scheduleId: r.scheduleId,
      scheduleIndex: r.scheduleIndex,
      name: r.name ?? `Schedule ${r.scheduleIndex}`,
      slots: Array.isArray(r.schedule) ? r.schedule : [],
      weeksToSchedule: r.weeksToSchedule,
      maxStudents: r.maxStudents,
      enrolledCount: r.enrolledCount ?? 0,
      spotsLeft,
      isFull: spotsLeft === 0,
    }
  })

  return NextResponse.json({ schedules })
})
