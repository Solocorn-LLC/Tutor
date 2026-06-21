/**
 * GET /api/push/vapid-public-key
 * Exposes the VAPID public key for the browser to subscribe with. Returns
 * { key: null } when web-push isn't configured so the client can skip silently.
 */
import { NextResponse } from 'next/server'

export function GET() {
  const key = process.env.VAPID_PUBLIC_KEY || null
  return NextResponse.json({ key })
}
