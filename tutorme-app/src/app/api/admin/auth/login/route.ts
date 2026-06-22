import { NextRequest, NextResponse } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, profile, adminAssignment, adminRole, ipWhitelist } from '@/lib/db/schema'
import { eq, and, sql, ilike } from 'drizzle-orm'
import {
  createAdminSession,
  isIpWhitelisted,
  getClientIp,
  logAdminAction,
  verifyPassword,
  hashPassword,
  ADMIN_TOKEN_NAME,
  ADMIN_TOKEN_EXPIRY,
} from '@/lib/admin/auth'
import { withRateLimitPreset, handleApiError } from '@/lib/api/middleware'
import { isSuspiciousIp, logFailedLogin } from '@/lib/security/suspicious-activity'

export async function POST(req: NextRequest) {
  try {
    const { response: rateLimitResponse } = await withRateLimitPreset(req, 'login')
    if (rateLimitResponse) return rateLimitResponse

    const body = await req.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const clientIp = getClientIp(req)
    const skipSuspiciousInDev =
      process.env.NODE_ENV === 'development' && process.env.ADMIN_SKIP_SUSPICIOUS_IP !== 'false'
    if (
      !skipSuspiciousInDev &&
      clientIp &&
      clientIp !== 'unknown' &&
      (await isSuspiciousIp(clientIp))
    ) {
      return NextResponse.json(
        { error: 'Too many failed login attempts. Please try again later.' },
        { status: 429 }
      )
    }

    const skipWhitelistInDev =
      process.env.NODE_ENV === 'development' &&
      (process.env.ADMIN_SKIP_IP_WHITELIST === 'true' ||
        process.env.ADMIN_SKIP_IP_WHITELIST === '1')
    const whitelistCountResult = skipWhitelistInDev
      ? [{ count: 0 }]
      : await drizzleDb
          .select({ count: sql<number>`count(*)::int` })
          .from(ipWhitelist)
          .where(eq(ipWhitelist.isActive, true))
    const whitelistCount = whitelistCountResult[0]?.count ?? 0

    if (whitelistCount > 0) {
      const whitelisted = await isIpWhitelisted(clientIp)
      if (!whitelisted) {
        return NextResponse.json({ error: 'Access denied from this IP address' }, { status: 403 })
      }
    }

    const users = await drizzleDb.select().from(user).where(ilike(user.email, email)).limit(1)
    const foundUser = users[0]
    if (!foundUser || !foundUser.password) {
      await logFailedLogin(clientIp, email || undefined)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    if (foundUser.status === 'suspended') {
      await logFailedLogin(clientIp, email || undefined)
      return NextResponse.json({ error: 'This account is suspended' }, { status: 403 })
    }

    const passwordCandidates = Array.from(
      new Set(
        [
          password,
          password.trim(),
          password.normalize('NFC'),
          password.trim().normalize('NFC'),
        ].filter(Boolean)
      )
    )
    let isValidPassword = false
    for (const candidate of passwordCandidates) {
      if (await verifyPassword(candidate, foundUser.password)) {
        isValidPassword = true
        break
      }
    }

    if (!isValidPassword && passwordCandidates.includes(foundUser.password)) {
      isValidPassword = true
      const migratedHash = await hashPassword(password)
      await drizzleDb
        .update(user)
        .set({ password: migratedHash })
        .where(eq(user.userId, foundUser.userId))
    }

    if (!isValidPassword) {
      await logFailedLogin(clientIp, email || undefined)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const [userProfile] = await drizzleDb
      .select()
      .from(profile)
      .where(eq(profile.userId, foundUser.userId))
      .limit(1)
    const assignments = await drizzleDb
      .select({ roleName: adminRole.name })
      .from(adminAssignment)
      .innerJoin(adminRole, eq(adminAssignment.roleId, adminRole.roleId))
      .where(and(eq(adminAssignment.userId, foundUser.userId), eq(adminAssignment.isActive, true)))
    const hasAdminEntitlement = assignments.length > 0 || foundUser.role === 'ADMIN'
    if (!hasAdminEntitlement) {
      await logFailedLogin(clientIp, email || undefined)
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    const roles = assignments.length > 0 ? assignments.map(a => a.roleName) : [foundUser.role]

    const userAgent = req.headers.get('user-agent') || undefined
    const token = await createAdminSession(foundUser.userId, clientIp, userAgent)

    await logAdminAction(foundUser.userId, 'admin.login', {
      ipAddress: clientIp,
      userAgent,
    })

    const response = NextResponse.json({
      success: true,
      user: {
        id: foundUser.userId,
        email: foundUser.email,
        name: userProfile?.name ?? null,
        roles,
      },
    })

    response.cookies.set(ADMIN_TOKEN_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ADMIN_TOKEN_EXPIRY,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Admin login error:', error)
    return handleApiError(error, 'Internal server error', 'api/admin/auth/login/route.ts')
  }
}
