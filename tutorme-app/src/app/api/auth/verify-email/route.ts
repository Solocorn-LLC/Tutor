/**
 * GET /api/auth/verify-email?token=...
 * Consume an email-verification token and redirect back to the login page with
 * a status the UI can surface (success | invalid | expired).
 */

import { NextRequest, NextResponse } from 'next/server'
import { consumeVerificationToken } from '@/lib/auth/email-verification'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') || ''

  let status: 'success' | 'invalid' | 'expired'
  try {
    const result = await consumeVerificationToken(token)
    status = result.ok ? 'success' : result.reason
  } catch (err) {
    console.error('[verify-email] error consuming token:', err)
    status = 'invalid'
  }

  // Locale-less path; next-intl middleware redirects to the default locale and
  // preserves the query string.
  return NextResponse.redirect(new URL(`/login?verify=${status}`, url.origin))
}
