/**
 * POST /api/landing/message — public contact/inquiry form on the marketing landing page.
 * Stores the message in `landing_inquiries` (read by the admin "landing submissions" view).
 * Public + unauthenticated, so it is rate-limited and length-capped.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { drizzleDb } from '@/lib/db/drizzle'
import { landingInquiry } from '@/lib/db/schema'
import { withRateLimitPreset } from '@/lib/api/middleware'

const MAX = { name: 200, email: 320, message: 5000 }

export async function POST(req: NextRequest) {
  try {
    const { response: rateLimited } = await withRateLimitPreset(req, 'contact')
    if (rateLimited) return rateLimited

    const body = await req.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    const message = typeof body?.message === 'string' ? body.message.trim() : ''

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Name, email and message are required.' }, { status: 400 })
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    await drizzleDb.insert(landingInquiry).values({
      id: crypto.randomUUID(),
      name: name.slice(0, MAX.name),
      email: email.slice(0, MAX.email),
      message: message.slice(0, MAX.message),
    })

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    console.error('landing message failed:', err)
    return NextResponse.json({ error: 'Failed to send message.' }, { status: 500 })
  }
}
