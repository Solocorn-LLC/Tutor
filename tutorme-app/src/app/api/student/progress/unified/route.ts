/**
 * Unified Student Progress API
 * GET /api/student/progress/unified — returns all progress items for the authenticated student
 * Query params:
 *   ?type=video|lesson|course|task — optional filter by progress type
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import { getStudentProgress } from '@/lib/progress/get-student-progress'
import { ProgressItemType } from '@/lib/progress/types'

const VALID_TYPES: ProgressItemType[] = ['video', 'lesson', 'course', 'task']

export const GET = withAuth(
  async (req: NextRequest, session) => {
    try {
      const { searchParams } = new URL(req.url)
      const typeParam = searchParams.get('type')

      const filter =
        typeParam && VALID_TYPES.includes(typeParam as ProgressItemType)
          ? { type: typeParam as ProgressItemType }
          : undefined

      const progress = await getStudentProgress(session.user.id, filter)

      return NextResponse.json({ success: true, progress })
    } catch (error) {
      console.error('Unified progress fetch error:', error)
      return handleApiError(
        error,
        'Failed to fetch progress',
        'api/student/progress/unified/route.ts'
      )
    }
  },
  { role: 'STUDENT' }
)
