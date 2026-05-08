/**
 * GET  /api/tutor/courses/[id]/course  — Load the full builder tree
 * PUT  /api/tutor/courses/[id]/course  — Save (upsert) the full builder tree
 *
 * Simplified API for the new Course -> Lesson -> Tasks/Assessments/Homework structure.
 * All lesson content is stored in the builderData JSONB column.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { CourseBuilderService } from '@/lib/services/course-builder.service'

// ---- GET — Load builder tree from DB ----

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: courseId } = await params
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
}

// ---- PUT — Save builder tree to DB (upsert) ----

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: courseId } = await params
  const userId = session.user.id

  console.log('[CourseBuilder PUT] Starting save for courseId:', courseId, 'userId:', userId)

  const body = await req.json().catch(() => ({}))
  const lessons = (body as { lessons?: unknown }).lessons

  try {
    await CourseBuilderService.updateCourseBuilderData(courseId, userId, lessons)
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
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// Alias POST to PUT for frontend compatibility
export { PUT as POST }
