/**
 * Course Schedule API
 * GET: List all schedules for a course
 * POST: Create a new schedule
 * PUT: Update a schedule
 * DELETE: Remove a schedule (only if no enrollments)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { verifyCourseOwnership } from '@/lib/api/course-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import { courseSchedule, courseEnrollment } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import crypto from 'crypto'

// GET all schedules for a course
export const GET = withAuth(
  async (req: NextRequest, session, context) => {
    const params = await context.params
    const courseId = params.id as string
    const userId = session.user.id

    try {
      const isOwner = await verifyCourseOwnership(courseId, userId)
      if (!isOwner) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      const rows = await drizzleDb
        .select()
        .from(courseSchedule)
        .where(eq(courseSchedule.courseId, courseId))
        .orderBy(courseSchedule.scheduleIndex)

      return NextResponse.json({ schedules: rows })
    } catch (error: any) {
      console.error('[GET /api/tutor/courses/[id]/schedules] Error:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to load schedules' },
        { status: 500 }
      )
    }
  },
  { role: 'TUTOR' }
)

// POST create a new schedule
export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const params = await context.params
      const courseId = params.id as string
      const userId = session.user.id
      const body = await req.json().catch(() => ({}))

      try {
        const isOwner = await verifyCourseOwnership(courseId, userId)
        if (!isOwner) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // Find next schedule index
        const existing = await drizzleDb
          .select({ maxIndex: sql<number>`COALESCE(MAX(${courseSchedule.scheduleIndex}), 0)` })
          .from(courseSchedule)
          .where(eq(courseSchedule.courseId, courseId))

        const nextIndex = (existing[0]?.maxIndex ?? 0) + 1

        const newSchedule = await drizzleDb
          .insert(courseSchedule)
          .values({
            scheduleId: crypto.randomUUID(),
            courseId,
            scheduleIndex: nextIndex,
            schedule: body.schedule || [],
            weeksToSchedule: body.weeksToSchedule ?? 8,
            maxStudents: body.maxStudents ?? null,
            enrolledCount: 0,
          })
          .returning({
            scheduleId: courseSchedule.scheduleId,
            courseId: courseSchedule.courseId,
            scheduleIndex: courseSchedule.scheduleIndex,
            schedule: courseSchedule.schedule,
            weeksToSchedule: courseSchedule.weeksToSchedule,
            maxStudents: courseSchedule.maxStudents,
            enrolledCount: courseSchedule.enrolledCount,
            createdAt: courseSchedule.createdAt,
            updatedAt: courseSchedule.updatedAt,
          })

        return NextResponse.json({ schedule: newSchedule[0] })
      } catch (error: any) {
        console.error('[POST /api/tutor/courses/[id]/schedules] Error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to create schedule' },
          { status: 500 }
        )
      }
    },
    { role: 'TUTOR' }
  )
)

// PUT update a schedule
export const PUT = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const params = await context.params
      const courseId = params.id as string
      const userId = session.user.id
      const body = await req.json().catch(() => ({}))
      const scheduleId = body.scheduleId

      if (!scheduleId) {
        return NextResponse.json({ error: 'scheduleId is required' }, { status: 400 })
      }

      try {
        const isOwner = await verifyCourseOwnership(courseId, userId)
        if (!isOwner) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const updateData: Record<string, unknown> = {}
        if (body.schedule !== undefined) updateData.schedule = body.schedule
        if (body.weeksToSchedule !== undefined) updateData.weeksToSchedule = body.weeksToSchedule
        if (body.maxStudents !== undefined) updateData.maxStudents = body.maxStudents

        const updated = await drizzleDb
          .update(courseSchedule)
          .set(updateData)
          .where(
            and(
              eq(courseSchedule.scheduleId, scheduleId),
              eq(courseSchedule.courseId, courseId)
            )
          )
          .returning({
            scheduleId: courseSchedule.scheduleId,
            courseId: courseSchedule.courseId,
            scheduleIndex: courseSchedule.scheduleIndex,
            schedule: courseSchedule.schedule,
            weeksToSchedule: courseSchedule.weeksToSchedule,
            maxStudents: courseSchedule.maxStudents,
            enrolledCount: courseSchedule.enrolledCount,
            createdAt: courseSchedule.createdAt,
            updatedAt: courseSchedule.updatedAt,
          })

        if (updated.length === 0) {
          return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
        }

        return NextResponse.json({ schedule: updated[0] })
      } catch (error: any) {
        console.error('[PUT /api/tutor/courses/[id]/schedules] Error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to update schedule' },
          { status: 500 }
        )
      }
    },
    { role: 'TUTOR' }
  )
)

// DELETE a schedule
export const DELETE = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const params = await context.params
      const courseId = params.id as string
      const userId = session.user.id
      const { searchParams } = new URL(req.url)
      const scheduleId = searchParams.get('scheduleId')

      if (!scheduleId) {
        return NextResponse.json({ error: 'scheduleId is required' }, { status: 400 })
      }

      try {
        const isOwner = await verifyCourseOwnership(courseId, userId)
        if (!isOwner) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // Check if schedule has enrollments
        const [scheduleRow] = await drizzleDb
          .select({ enrolledCount: courseSchedule.enrolledCount })
          .from(courseSchedule)
          .where(
            and(
              eq(courseSchedule.scheduleId, scheduleId),
              eq(courseSchedule.courseId, courseId)
            )
          )
          .limit(1)

        if (!scheduleRow) {
          return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
        }

        if (scheduleRow.enrolledCount > 0) {
          return NextResponse.json(
            { error: 'Cannot delete schedule with enrolled students' },
            { status: 409 }
          )
        }

        await drizzleDb
          .delete(courseSchedule)
          .where(
            and(
              eq(courseSchedule.scheduleId, scheduleId),
              eq(courseSchedule.courseId, courseId)
            )
          )

        return NextResponse.json({ success: true })
      } catch (error: any) {
        console.error('[DELETE /api/tutor/courses/[id]/schedules] Error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to delete schedule' },
          { status: 500 }
        )
      }
    },
    { role: 'TUTOR' }
  )
)
