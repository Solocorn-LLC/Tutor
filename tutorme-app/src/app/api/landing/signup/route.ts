/**
 * POST /api/landing/signup — public early-access signup on the marketing landing page.
 * Stores the signup in `landing_signups` (read by the admin "landing submissions" view).
 * Public + unauthenticated, so it is rate-limited and length-capped.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { drizzleDb } from '@/lib/db/drizzle'
import { landingSignup } from '@/lib/db/schema'
import { withRateLimitPreset } from '@/lib/api/middleware'

const MAX = { username: 100, bio: 2000, country: 100, photo: 2000 }

export async function POST(req: NextRequest) {
  try {
    const { response: rateLimited } = await withRateLimitPreset(req, 'register')
    if (rateLimited) return rateLimited

    const body = await req.json().catch(() => null)
    const username = typeof body?.username === 'string' ? body.username.trim() : ''
    const bio = typeof body?.bio === 'string' ? body.bio.trim() : ''
    const country = typeof body?.country === 'string' ? body.country.trim() : ''
    const photo = typeof body?.photo === 'string' ? body.photo.trim() : ''

    if (!username) {
      return NextResponse.json({ error: 'A username is required.' }, { status: 400 })
    }
    // Only store a photo value if it is an http(s) URL — ignore anything else.
    const safePhoto = /^https?:\/\//.test(photo) ? photo.slice(0, MAX.photo) : null

    await drizzleDb.insert(landingSignup).values({
      id: crypto.randomUUID(),
      username: username.slice(0, MAX.username),
      bio: bio ? bio.slice(0, MAX.bio) : null,
      country: country ? country.slice(0, MAX.country) : null,
      photo: safePhoto,
    })

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    console.error('landing signup failed:', err)
    return NextResponse.json({ error: 'Failed to submit signup.' }, { status: 500 })
  }
}
