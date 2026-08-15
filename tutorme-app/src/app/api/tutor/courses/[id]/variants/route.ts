import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { verifyCourseOwnership } from '@/lib/api/course-helpers'
import { ForbiddenError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { eq, or, and } from 'drizzle-orm'

/**
 * Get all variants of a course
 * GET /api/tutor/courses/[id]/variants
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions, req)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: courseId } = await params

    const isOwner = await verifyCourseOwnership(courseId, session.user.id)
    if (!isOwner) {
      throw new ForbiddenError('You do not have access to this course')
    }

    // Get the course
    const course = await drizzleDb.query.course.findFirst({
      where: (c, { eq }) => eq(c.courseId, courseId),
      columns: {
        courseId: true,
        name: true,
        description: true,
        categories: true,
        isPublished: true,
        isLiveOnline: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Return the course as parent with no variants
    // (variant system requires region/country/parentCourseId columns not yet in production)
    return NextResponse.json({
      parentCourse: {
        id: course.courseId,
        name: course.name,
        description: course.description,
        categories: course.categories,
        isPublished: course.isPublished,
        isLiveOnline: course.isLiveOnline,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
      },
      variants: [],
    })
  } catch (error) {
    console.error('Get course variants error:', error)
    return NextResponse.json({ error: 'Failed to fetch course variants' }, { status: 500 })
  }
}
