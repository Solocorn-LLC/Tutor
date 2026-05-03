import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { backfillCalendarEventsForLiveSessions } from '@/lib/sessions/create-session'
import { z } from 'zod'

const querySchema = z.object({
  dryRun: z.enum(['true', 'false']).default('true'),
  limit: z.coerce.number().min(1).max(5000).default(1000),
})

/**
 * POST /api/admin/sessions/backfill
 * Backfill missing CalendarEvent rows for existing LiveSessions.
 * Requires ADMIN role.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions, request)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const parsed = querySchema.parse({
      dryRun: searchParams.get('dryRun') ?? 'true',
      limit: searchParams.get('limit') ?? '1000',
    })

    const result = await backfillCalendarEventsForLiveSessions({
      dryRun: parsed.dryRun === 'true',
      limit: parsed.limit,
    })

    return NextResponse.json({
      success: true,
      dryRun: parsed.dryRun === 'true',
      backfilled: result.count,
      rows: result.rows,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query params', details: error.issues },
        { status: 400 }
      )
    }
    console.error('[backfill] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
