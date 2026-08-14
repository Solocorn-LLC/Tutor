/**
 * Public API to get tutor's availability for booking
 * GET /api/public/tutors/[username]/availability
 */

import { NextRequest, NextResponse } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, profile } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { expireOverdueOneOnOneBookings } from '@/lib/one-on-one/expire'
import { generateTutorAvailableSlots } from '@/lib/schedule/tutor-available-slots'

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  try {
    const { username: usernameParam } = await params
    const username = usernameParam.replace(/^@+/, '').toLowerCase()

    // Find tutor by profile.username first (matches public profile API), then by userId
    let tutorProfile = await drizzleDb
      .select()
      .from(profile)
      .where(eq(profile.username, username))
      .limit(1)
      .then(rows => rows[0] || null)

    if (!tutorProfile) {
      tutorProfile = await drizzleDb
        .select()
        .from(profile)
        .where(eq(profile.userId, username))
        .limit(1)
        .then(rows => rows[0] || null)
    }

    if (!tutorProfile) {
      return NextResponse.json({ error: 'Tutor not found' }, { status: 404 })
    }

    const tutorId = tutorProfile.userId

    // Verify the user is a tutor
    const tutorUser = await drizzleDb
      .select({ userId: user.userId, role: user.role })
      .from(user)
      .where(eq(user.userId, tutorId))
      .limit(1)

    if (tutorUser.length === 0 || tutorUser[0].role !== 'TUTOR') {
      return NextResponse.json({ error: 'Tutor not found' }, { status: 404 })
    }

    // Check if one-on-one is enabled
    if (!tutorProfile.oneOnOneEnabled) {
      return NextResponse.json(
        { error: 'Tutor does not offer one-on-one sessions', available: false, reason: 'disabled' },
        { status: 200 }
      )
    }

    // Release any of this tutor's overdue unpaid holds first, so a slot that was
    // held by a lapsed booking shows as open. Awaited (scoped + cheap) so the
    // freed slot is reflected in the availability we return below.
    await expireOverdueOneOnOneBookings({ tutorId }).catch(() => {})

    const now = new Date()
    const startDate = start ? new Date(start) : now
    const endDate = end ? new Date(end) : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) // 2 weeks default

    // Use the shared generator so public slots and 1-on-1 validation are identical.
    const slots = await generateTutorAvailableSlots({
      tutorId,
      startDate,
      endDate,
      slotDurationMinutes: 60,
      timezone: tutorProfile.timezone ?? undefined,
    })

    const isFree = !!tutorProfile.oneOnOneFree
    const hasHourlyRate = typeof tutorProfile.hourlyRate === 'number' && tutorProfile.hourlyRate > 0

    return NextResponse.json({
      available: true,
      free: isFree,
      // Free sessions cost 0 and are never "pricing incomplete".
      hourlyRate: isFree ? 0 : hasHourlyRate ? tutorProfile.hourlyRate : 0,
      pricingIncomplete: !isFree && !hasHourlyRate,
      currency: tutorProfile.currency || 'USD',
      timezone: tutorProfile.timezone || 'UTC',
      // Whether this tutor lets students book a recurring weekly series.
      recurringEnabled: tutorProfile.oneOnOneRecurringEnabled ?? true,
      slots,
    })
  } catch (error: any) {
    console.error('Fetch availability error:', error)
    const message = error?.message || String(error) || 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to fetch availability', details: message },
      { status: 500 }
    )
  }
}
