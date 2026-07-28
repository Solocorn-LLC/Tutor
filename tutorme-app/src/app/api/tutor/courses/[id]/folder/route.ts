/**
 * PATCH /api/tutor/courses/:id/folder — Set or clear the folder assigned to a course.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, ValidationError, NotFoundError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { course } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export const PATCH = withCsrf(
  withAuth(async (req, session, context) => {
    const userId = session.user.id
    const params = await context.params
    const courseId = typeof params.id === 'string' ? params.id : ''

    if (!courseId) {
      throw new ValidationError('Course id is required')
    }

    let body: { folder?: string | null }
    try {
      body = await req.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const folder = body.folder === null ? null : (body.folder || '').trim() || null

    const [existing] = await drizzleDb
      .select({ courseId: course.courseId })
      .from(course)
      .where(
        and(eq(course.courseId, courseId), eq(course.creatorId, userId), isNull(course.deletedAt))
      )
      .limit(1)

    if (!existing) {
      throw new NotFoundError('Course not found')
    }

    await drizzleDb.update(course).set({ folder }).where(eq(course.courseId, courseId))

    return NextResponse.json({ success: true, folder })
  })
)
