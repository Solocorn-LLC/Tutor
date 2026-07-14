/**
 * One-on-one settings API
 * GET: Get tutor's one-on-one settings
 * PATCH: Update tutor's one-on-one settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { drizzleDb } from '@/lib/db/drizzle'
import { profile } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

// GET: Get tutor's one-on-one settings
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions, req)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const tutorId = searchParams.get('tutorId') || session.user.id

    if (!tutorId) {
      return NextResponse.json({ error: 'Tutor ID required' }, { status: 400 })
    }

    // Get tutor's profile with hourly rate
    const tutorProfile = await drizzleDb
      .select({
        profileId: profile.profileId,
        hourlyRate: profile.hourlyRate,
        oneOnOneEnabled: profile.oneOnOneEnabled,
        oneOnOneFree: profile.oneOnOneFree,
        oneOnOneRecurringEnabled: profile.oneOnOneRecurringEnabled,
        bufferMinutes: profile.bufferMinutes,
      })
      .from(profile)
      .where(eq(profile.userId, tutorId))
      .limit(1)

    if (tutorProfile.length === 0) {
      return NextResponse.json({ error: 'Tutor not found' }, { status: 404 })
    }

    return NextResponse.json({
      hourlyRate: tutorProfile[0].hourlyRate || 50, // Default $50/hour
      oneOnOneEnabled: tutorProfile[0].oneOnOneEnabled ?? true,
      oneOnOneFree: tutorProfile[0].oneOnOneFree ?? false,
      oneOnOneRecurringEnabled: tutorProfile[0].oneOnOneRecurringEnabled ?? true,
      sessionDuration: 60, // Default 1 hour
      bufferMinutes: tutorProfile[0].bufferMinutes ?? 0, // gap around bookings
    })
  } catch (error) {
    console.error('Error fetching one-on-one settings:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

// PATCH: Update tutor's one-on-one settings (for tutors only)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions, req)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { hourlyRate, oneOnOneEnabled, oneOnOneFree, oneOnOneRecurringEnabled, bufferMinutes } =
      body
    const tutorId = session.user.id

    // Clamp the buffer to a sane 0–120 minute range when provided.
    const buffer =
      bufferMinutes !== undefined
        ? Math.max(0, Math.min(120, Math.round(Number(bufferMinutes) || 0)))
        : undefined

    // Update profile
    await drizzleDb
      .update(profile)
      .set({
        hourlyRate: hourlyRate !== undefined ? hourlyRate : undefined,
        oneOnOneEnabled: oneOnOneEnabled !== undefined ? oneOnOneEnabled : undefined,
        oneOnOneFree: oneOnOneFree !== undefined ? !!oneOnOneFree : undefined,
        oneOnOneRecurringEnabled:
          oneOnOneRecurringEnabled !== undefined ? !!oneOnOneRecurringEnabled : undefined,
        bufferMinutes: buffer,
        updatedAt: new Date(),
      })
      .where(eq(profile.userId, tutorId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating one-on-one settings:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
