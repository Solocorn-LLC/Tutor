/**
 * Cron sweep for 1-on-1 AND group-session lifecycle: expire overdue unpaid 1-on-1
 * holds and stale group seat reservations, and mark finished sessions COMPLETED.
 *
 * Also runs lazily (when the relevant surfaces are viewed) and on boot, but this
 * endpoint gives a guaranteed cadence. Protect with CRON_SECRET and hit it on a
 * schedule (the keep-alive workflow does, every 10 min).
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`. Inert (503) until CRON_SECRET is
 * configured, so it can never be triggered by an anonymous caller.
 */

import { NextRequest, NextResponse } from 'next/server'
import { expireOverdueOneOnOneBookings } from '@/lib/one-on-one/expire'
import { completeFinishedOneOnOneSessions } from '@/lib/one-on-one/complete'
import { expireStaleGroupSeats } from '@/lib/group-session/expire-seats'
import { completeFinishedGroupSessions } from '@/lib/group-session/complete'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [expired, completed, seatsReleased, groupsCompleted] = await Promise.all([
      expireOverdueOneOnOneBookings(),
      completeFinishedOneOnOneSessions(),
      expireStaleGroupSeats(),
      completeFinishedGroupSessions(),
    ])
    return NextResponse.json({ ok: true, expired, completed, seatsReleased, groupsCompleted })
  } catch (error) {
    console.error('[cron] session lifecycle sweep failed:', error)
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 })
  }
}
