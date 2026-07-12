import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { eq, and, or } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest, profile } from '@/lib/db/schema'
import { CORE_BOOKING_COLUMNS } from '@/lib/one-on-one/columns'

// Check if there's an active request between student and tutor
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions, request)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const tutorId = searchParams.get('tutorId')
    const studentId = searchParams.get('studentId')

    if (!tutorId) {
      return NextResponse.json({ error: 'tutorId is required' }, { status: 400 })
    }

    // Determine which user is the current user and which is the other party
    const isStudent = session.user.role === 'STUDENT'
    const currentUserId = session.user.id
    const targetStudentId = isStudent ? currentUserId : studentId || currentUserId

    // Check for active request
    const activeRequest = await drizzleDb.query.oneOnOneBookingRequest.findFirst({
      where: and(
        eq(oneOnOneBookingRequest.tutorId, tutorId),
        eq(oneOnOneBookingRequest.studentId, targetStudentId),
        or(
          eq(oneOnOneBookingRequest.status, 'PENDING'),
          eq(oneOnOneBookingRequest.status, 'ACCEPTED'),
          eq(oneOnOneBookingRequest.status, 'PAID')
        )
      ),
      columns: CORE_BOOKING_COLUMNS,
      with: {
        tutor: {
          columns: {
            userId: true,
            handle: true,
            email: true,
            image: true,
          },
        },
        student: {
          columns: {
            userId: true,
            handle: true,
            email: true,
            image: true,
          },
        },
      },
    })

    // Get tutor's one-on-one availability and pricing
    const tutorProfile = await drizzleDb.query.profile.findFirst({
      where: eq(profile.userId, tutorId),
      columns: {
        hourlyRate: true,
        oneOnOneEnabled: true,
        currency: true,
      },
    })

    return NextResponse.json({
      hasActiveRequest: !!activeRequest,
      request: activeRequest || null,
      tutorAvailability: {
        enabled: tutorProfile?.oneOnOneEnabled || false,
        hourlyRate: tutorProfile?.hourlyRate,
        currency: tutorProfile?.currency || 'USD',
      },
    })
  } catch (error) {
    console.error('Error checking one-on-one status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
