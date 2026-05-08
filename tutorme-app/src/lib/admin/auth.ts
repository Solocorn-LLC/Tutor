/**
 * Admin Authentication & Authorization
 * Handles admin login, session management, and permission checking
 */

import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { eq, and, gt, or, isNull } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  adminSession as adminSessionTable,
  user as userTable,
  profile as profileTable,
  adminAssignment as adminAssignmentTable,
  adminRole as adminRoleTable,
  adminAuditLog as adminAuditLogTable,
  ipWhitelist as ipWhitelistTable,
} from '@/lib/db/schema'
import { compare, hash } from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { nanoid } from 'nanoid'
import crypto from 'crypto'
import { hasPermission, Permission, getRolePermissions } from './permissions'

// Admin session configuration (exported for setting cookie on response in route handlers)
export const ADMIN_TOKEN_NAME = 'admin_session'
export const ADMIN_TOKEN_EXPIRY = 60 * 60 * 8 // 8 hours in seconds

function getJwtSecret(): Uint8Array {
  const configuredSecret = process.env.ADMIN_JWT_SECRET || process.env.NEXTAUTH_SECRET || ''
  if (
    process.env.NODE_ENV === 'production' &&
    (!configuredSecret || configuredSecret === 'default-secret') &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    console.error('CRITICAL: Missing secure ADMIN_JWT_SECRET or NEXTAUTH_SECRET in production')
  }
  // Dev/test fallback only; production must provide env secret above.
  const secret = configuredSecret || 'dev-admin-secret'
  return new TextEncoder().encode(secret)
}

// Types
export interface AdminSession {
  sessionId: string
  adminId: string
  email: string
  name: string | null
  permissions: Permission[]
  roles: string[]
  ipAddress?: string
  userAgent?: string
  createdAt: Date
  expiresAt: Date
}

export interface AdminUser {
  id: string
  email: string
  name: string | null
  image: string | null
  roles: string[]
  permissions: Permission[]
  isActive: boolean
}

/**
 * Hash a password for storage
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12)
}

/**
 * Verify a password against its hash
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return compare(password, hashedPassword)
}

/**
 * Create a new admin session
 */
export async function createAdminSession(
  adminId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  const token = nanoid(32)
  const expiresAt = new Date(Date.now() + ADMIN_TOKEN_EXPIRY * 1000)

  // Store session in database
  await drizzleDb.insert(adminSessionTable).values({
    sessionId: crypto.randomUUID(),
    adminId,
    token,
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
    expiresAt,
    startedAt: new Date(),
    lastActiveAt: new Date(),
    isRevoked: false,
  })

  // Create JWT token
  const jwt = await new SignJWT({
    sessionId: token,
    adminId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getJwtSecret())

  return jwt
}

/**
 * Verify and decode an admin JWT token
 */
export async function verifyAdminToken(
  token: string
): Promise<{ sessionId: string; adminId: string } | null> {
  try {
    const verified = await jwtVerify(token, getJwtSecret())
    return verified.payload as { sessionId: string; adminId: string }
  } catch {
    return null
  }
}

/**
 * Get the current admin session from request
 */
export async function getAdminSession(req?: NextRequest): Promise<AdminSession | null> {
  try {
    let token: string | undefined

    if (req) {
      // Server-side from request
      token = req.cookies?.get?.(ADMIN_TOKEN_NAME)?.value
    } else {
      // Server component
      const cookieStore = await cookies()
      token = cookieStore.get(ADMIN_TOKEN_NAME)?.value
    }

    if (!token) return null

    // Verify JWT
    const payload = await verifyAdminToken(token)
    if (!payload) return null

    // Get session from database with related data
    const sessionData = await drizzleDb.query.adminSession.findFirst({
      where: eq(adminSessionTable.token, payload.sessionId),
      with: {
        admin: {
          with: {
            adminAssignments: {
              where: eq(adminAssignmentTable.isActive, true),
              with: {
                role: true,
              },
            },
            profile: true,
          },
        },
      },
    })

    if (!sessionData || sessionData.isRevoked || sessionData.expiresAt < new Date()) {
      return null
    }

    // Update last active
    await drizzleDb
      .update(adminSessionTable)
      .set({ lastActiveAt: new Date() })
      .where(eq(adminSessionTable.sessionId, sessionData.sessionId))

    // Collect permissions from all roles
    const roles = sessionData.admin.adminAssignments.map(a => a.role.name)
    const permissionsSet = new Set<Permission>()

    sessionData.admin.adminAssignments.forEach(assignment => {
      const rolePerms = getRolePermissions(assignment.role.name)
      rolePerms.forEach(p => permissionsSet.add(p))
    })

    return {
      sessionId: sessionData.sessionId,
      adminId: sessionData.adminId,
      email: sessionData.admin.email,
      name: sessionData.admin.profile?.name || null,
      permissions: Array.from(permissionsSet),
      roles,
      ipAddress: sessionData.ipAddress || undefined,
      userAgent: sessionData.userAgent || undefined,
      createdAt: sessionData.startedAt,
      expiresAt: sessionData.expiresAt,
    }
  } catch (error) {
    console.error('Error getting admin session:', error)
    return null
  }
}

/**
 * Set admin session cookie
 */
export async function setAdminCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(ADMIN_TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ADMIN_TOKEN_EXPIRY,
    path: '/',
  })
}

/**
 * Clear admin session cookie
 */
export async function clearAdminCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete({ name: ADMIN_TOKEN_NAME, path: '/' })
}

/**
 * Check if admin has required permission
 */
export function checkPermission(session: AdminSession | null, permission: Permission): boolean {
  if (!session) return false
  return hasPermission(session.permissions, permission)
}

/**
 * Require admin authentication middleware
 */
export async function requireAdmin(
  req: NextRequest,
  requiredPermission?: Permission
): Promise<
  { session: AdminSession; response?: NextResponse } | { session: null; response: NextResponse }
> {
  const session = await getAdminSession(req)

  if (!session) {
    return {
      session: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  if (requiredPermission && !checkPermission(session, requiredPermission)) {
    return {
      session: null,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { session }
}

/**
 * Get all admin users
 */
export async function getAdminUsers(): Promise<AdminUser[]> {
  const adminsData = await drizzleDb.query.user.findMany({
    where: (users, { exists }) =>
      exists(
        drizzleDb
          .select()
          .from(adminAssignmentTable)
          .where(
            and(
              eq(adminAssignmentTable.userId, users.userId),
              eq(adminAssignmentTable.isActive, true)
            )
          )
      ),
    with: {
      profile: true,
      adminAssignments: {
        where: eq(adminAssignmentTable.isActive, true),
        with: {
          role: true,
        },
      },
    },
  })

  return adminsData.map(user => {
    const roles = user.adminAssignments.map(a => a.role.name)
    const permissionsSet = new Set<Permission>()

    user.adminAssignments.forEach(assignment => {
      const rolePerms = getRolePermissions(assignment.role.name)
      rolePerms.forEach(p => permissionsSet.add(p))
    })

    return {
      id: user.userId,
      email: user.email,
      name: user.profile?.name || null,
      image: user.image,
      roles,
      permissions: Array.from(permissionsSet),
      isActive: user.adminAssignments.length > 0,
    }
  })
}

/**
 * Log admin action to audit log
 */
export async function logAdminAction(
  adminId: string,
  action: string,
  details: {
    resourceType?: string
    resourceId?: string
    previousState?: unknown
    newState?: unknown
    metadata?: Record<string, unknown>
    ipAddress?: string
    userAgent?: string
  }
): Promise<void> {
  try {
    await drizzleDb.insert(adminAuditLogTable).values({
      auditLogId: crypto.randomUUID(),
      adminId,
      action,
      resourceType: details.resourceType || null,
      resourceId: details.resourceId || null,
      previousState: (details.previousState as object) || null,
      newState: (details.newState as object) || null,
      metadata: (details.metadata as object) || null,
      ipAddress: details.ipAddress || null,
      userAgent: details.userAgent || null,
      createdAt: new Date(),
    })
  } catch (error) {
    console.error('Error logging admin action:', error)
  }
}

/**
 * Check if IP is whitelisted for admin access
 */
export async function isIpWhitelisted(ipAddress: string): Promise<boolean> {
  const [whitelist] = await drizzleDb
    .select()
    .from(ipWhitelistTable)
    .where(
      and(
        eq(ipWhitelistTable.ipAddress, ipAddress),
        eq(ipWhitelistTable.isActive, true),
        or(isNull(ipWhitelistTable.expiresAt), gt(ipWhitelistTable.expiresAt, new Date()))
      )
    )
    .limit(1)

  return !!whitelist
}

/**
 * Get client IP from request
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  const realIp = req.headers.get('x-real-ip')

  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  if (realIp) {
    return realIp
  }

  return 'unknown'
}
