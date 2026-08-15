/**
 * PATCH /api/tutor/courses/:id/folder — Set or clear the folder assigned to a course.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  withAuth,
  withCsrf,
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from '@/lib/api/middleware'
import { verifyCourseOwnership } from '@/lib/api/course-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import { course } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

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

    const isOwner = await verifyCourseOwnership(courseId, userId)
    if (!isOwner) {
      throw new ForbiddenError('You do not have access to this course')
    }

    await drizzleDb.update(course).set({ folder }).where(eq(course.courseId, courseId))

    return NextResponse.json({ success: true, folder })
  })
)
