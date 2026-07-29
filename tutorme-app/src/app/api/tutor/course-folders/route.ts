/**
 * GET  /api/tutor/course-folders  — List the tutor's custom course folders.
 * POST /api/tutor/course-folders  — Create a new custom course folder.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, ValidationError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { tutorCourseFolder, course } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req, session) => {
  const userId = session.user.id

  const folders = await drizzleDb
    .select({
      id: tutorCourseFolder.folderId,
      name: tutorCourseFolder.name,
      createdAt: tutorCourseFolder.createdAt,
    })
    .from(tutorCourseFolder)
    .where(eq(tutorCourseFolder.userId, userId))
    .orderBy(tutorCourseFolder.name)

  return NextResponse.json({
    folders: folders.map(f => ({
      id: f.id,
      name: f.name,
      createdAt: f.createdAt?.toISOString() ?? null,
    })),
  })
})

export const POST = withCsrf(
  withAuth(async (req, session) => {
    const userId = session.user.id

    let body: { name?: string }
    try {
      body = await req.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const name = (body.name || '').trim()
    if (!name) {
      throw new ValidationError('Folder name is required')
    }
    if (name.toLowerCase() === 'all') {
      throw new ValidationError('"All" is a reserved folder name')
    }

    const existing = await drizzleDb
      .select({ id: tutorCourseFolder.folderId })
      .from(tutorCourseFolder)
      .where(and(eq(tutorCourseFolder.userId, userId), eq(tutorCourseFolder.name, name)))
      .limit(1)

    if (existing.length > 0) {
      throw new ValidationError(`Folder "${name}" already exists`)
    }

    const newFolder = {
      folderId: crypto.randomUUID(),
      userId,
      name,
    }

    await drizzleDb.insert(tutorCourseFolder).values(newFolder)

    return NextResponse.json({
      folder: {
        id: newFolder.folderId,
        name: newFolder.name,
      },
    })
  })
)
