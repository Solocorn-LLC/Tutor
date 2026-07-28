/**
 * PUT    /api/tutor/course-folders/:id  — Rename a custom folder.
 * DELETE /api/tutor/course-folders/:id  — Delete a custom folder.
 *
 * Renaming cascades to the Course.folder string column for the owning tutor.
 * Deleting clears Course.folder for courses that were in that folder.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, ValidationError, NotFoundError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { tutorCourseFolder, course } from '@/lib/db/schema'
import { eq, and, isNull, ne } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export const PUT = withCsrf(
  withAuth(async (req, session, context) => {
    const userId = session.user.id
    const params = await context.params
    const folderId = typeof params.id === 'string' ? params.id : ''

    if (!folderId) {
      throw new ValidationError('Folder id is required')
    }

    let body: { name?: string }
    try {
      body = await req.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const newName = (body.name || '').trim()
    if (!newName) {
      throw new ValidationError('Folder name is required')
    }
    if (newName.toLowerCase() === 'all') {
      throw new ValidationError('"All" is a reserved folder name')
    }

    const [existing] = await drizzleDb
      .select({ name: tutorCourseFolder.name })
      .from(tutorCourseFolder)
      .where(and(eq(tutorCourseFolder.folderId, folderId), eq(tutorCourseFolder.userId, userId)))
      .limit(1)

    if (!existing) {
      throw new NotFoundError('Folder not found')
    }

    const oldName = existing.name

    const duplicate = await drizzleDb
      .select({ id: tutorCourseFolder.folderId })
      .from(tutorCourseFolder)
      .where(
        and(
          eq(tutorCourseFolder.userId, userId),
          eq(tutorCourseFolder.name, newName),
          ne(tutorCourseFolder.folderId, folderId)
        )
      )
      .limit(1)

    if (duplicate.length > 0) {
      throw new ValidationError(`Folder "${newName}" already exists`)
    }

    await drizzleDb.transaction(async tx => {
      await tx
        .update(tutorCourseFolder)
        .set({ name: newName })
        .where(and(eq(tutorCourseFolder.folderId, folderId), eq(tutorCourseFolder.userId, userId)))

      // Cascade rename: courses owned by this tutor that had the old folder name
      // now use the new folder name. Course.folder is a string, so we match by
      // creatorId + oldName.
      await tx
        .update(course)
        .set({ folder: newName })
        .where(
          and(eq(course.creatorId, userId), eq(course.folder, oldName), isNull(course.deletedAt))
        )
    })

    return NextResponse.json({
      folder: {
        id: folderId,
        name: newName,
      },
    })
  })
)

export const DELETE = withCsrf(
  withAuth(async (req, session, context) => {
    const userId = session.user.id
    const params = await context.params
    const folderId = typeof params.id === 'string' ? params.id : ''

    if (!folderId) {
      throw new ValidationError('Folder id is required')
    }

    const [existing] = await drizzleDb
      .select({ name: tutorCourseFolder.name })
      .from(tutorCourseFolder)
      .where(and(eq(tutorCourseFolder.folderId, folderId), eq(tutorCourseFolder.userId, userId)))
      .limit(1)

    if (!existing) {
      throw new NotFoundError('Folder not found')
    }

    await drizzleDb.transaction(async tx => {
      await tx
        .delete(tutorCourseFolder)
        .where(and(eq(tutorCourseFolder.folderId, folderId), eq(tutorCourseFolder.userId, userId)))

      // Clear folder assignment for courses that were in this folder.
      await tx
        .update(course)
        .set({ folder: null })
        .where(
          and(
            eq(course.creatorId, userId),
            eq(course.folder, existing.name),
            isNull(course.deletedAt)
          )
        )
    })

    return NextResponse.json({ success: true })
  })
)
