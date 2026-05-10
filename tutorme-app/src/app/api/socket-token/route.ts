/**
 * GET /api/socket-token
 * Returns a short-lived JWT for Socket.io authentication.
 * Used by client hooks (use-socket, use-simple-socket) to pass auth.token when connecting.
 * Uses getServerSession so cookies are read correctly in App Router / Turbopack.
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { getServerSession, authOptions } from '@/lib/auth'
import { SignJWT } from 'jose'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions, request)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) {
      return handleApiError(
        new Error('Socket token: NEXTAUTH_SECRET is not set'),
        'Server misconfiguration',
        'api/socket-token/route.ts'
      )
    }
    const role = session.user.role ?? 'STUDENT'
    const secretEncoded = new TextEncoder().encode(secret)
    // Longer expiry so tokens survive reconnection across network blips and session duration
    const expiry = '24h'
    const socketToken = await new SignJWT({
      id: session.user.id,
      role: typeof role === 'string' ? role : String(role),
      email: (session.user as { email?: string }).email ?? '',
      name: session.user.name ?? '',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(expiry)
      .setIssuedAt()
      .sign(secretEncoded)

    return NextResponse.json({ token: socketToken })
  } catch (error) {
    console.error('Socket token error:', error)
    return handleApiError(error, 'Failed to issue token', 'api/socket-token/route.ts')
  }
}
