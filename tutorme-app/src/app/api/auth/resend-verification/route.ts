/**
 * POST /api/auth/resend-verification  { email }
 * Re-send the email-verification link for an unverified account.
 *
 * Always returns a generic success (never reveals whether the email exists or is
 * already verified) and is rate-limited per IP.
 */

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, profile } from '@/lib/db/schema'
import { checkRateLimit, getClientIdentifier } from '@/lib/security/rate-limit'
import { sendEmailVerification } from '@/lib/auth/email-verification'

const GENERIC = {
  success: true,
  message: 'If your account needs verification, a new link is on its way.',
}

export async function POST(req: NextRequest) {
  const clientId = getClientIdentifier(req)
  const { allowed } = await checkRateLimit(`resend-verification:${clientId}`, {
    max: 5,
    windowMs: 15 * 60 * 1000,
  })
  if (!allowed) {
    return NextResponse.json(GENERIC, { status: 200, headers: { 'Retry-After': '900' } })
  }

  const body = await req.json().catch(() => ({}))
  const email = String(body?.email ?? '')
    .trim()
    .toLowerCase()
  if (!email) return NextResponse.json(GENERIC, { status: 200 })

  try {
    const [userRow] = await drizzleDb
      .select({ userId: user.userId, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.email, email))
      .limit(1)

    if (userRow && !userRow.emailVerified) {
      const [prof] = await drizzleDb
        .select({ name: profile.name })
        .from(profile)
        .where(eq(profile.userId, userRow.userId))
        .limit(1)
      await sendEmailVerification(email, prof?.name)
    }
  } catch (err) {
    console.error('[resend-verification] error:', err)
    // Still return generic success — don't leak backend state.
  }

  return NextResponse.json(GENERIC, { status: 200 })
}
