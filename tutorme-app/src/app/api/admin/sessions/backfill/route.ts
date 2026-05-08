import { NextRequest, NextResponse } from 'next/server'
import { backfillCalendarEventsForLiveSessions } from '@/lib/sessions/create-session'
import { requireAdmin } from '@/lib/admin/auth'
import { Permissions } from '@/lib/admin/permissions'
import { requireAdminIp } from '@/lib/api/middleware'
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
    const auth = await requireAdmin(request, Permissions.SYSTEM_MAINTENANCE)
    if (!auth.session) return auth.response!
    const ipErr = requireAdminIp(request)
    if (ipErr) return ipErr

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
