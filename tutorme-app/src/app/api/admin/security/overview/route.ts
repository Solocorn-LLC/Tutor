/**
 * GET /api/admin/security/overview
 * Security posture for the admin Security page: failed-login volume, active
 * admin sessions, IP whitelist, and recent admin actions.
 */
import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { requireAdmin } from '@/lib/admin/auth'
import { Permissions } from '@/lib/admin/permissions'
import { drizzleDb } from '@/lib/db/drizzle'
import { securityEvent } from '@/lib/db/schema'
import { adminSession, ipWhitelist, adminAuditLog } from '@/lib/db/schema'
import { and, eq, gte, gt, desc, sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdmin(req, Permissions.SECURITY_READ)
  if (!session) return response!

  try {
    const now = new Date()
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const one = async (q: Promise<{ c: number }[]>) => (await q)[0]?.c ?? 0

    const failedLogins24h = await one(
      drizzleDb
        .select({ c: sql<number>`count(*)::int` })
        .from(securityEvent)
        .where(
          and(eq(securityEvent.eventType, 'auth_failed'), gte(securityEvent.createdAt, dayAgo))
        )
    )

    const activeSessions = await one(
      drizzleDb
        .select({ c: sql<number>`count(*)::int` })
        .from(adminSession)
        .where(and(eq(adminSession.isRevoked, false), gt(adminSession.expiresAt, now)))
    )

    const whitelist = await drizzleDb
      .select({
        id: ipWhitelist.whitelistId,
        ipAddress: ipWhitelist.ipAddress,
        description: ipWhitelist.description,
        isActive: ipWhitelist.isActive,
        expiresAt: ipWhitelist.expiresAt,
      })
      .from(ipWhitelist)
      .orderBy(desc(ipWhitelist.createdAt))
      .limit(50)

    const recentActions = await drizzleDb
      .select({
        id: adminAuditLog.auditLogId,
        action: adminAuditLog.action,
        adminId: adminAuditLog.adminId,
        ipAddress: adminAuditLog.ipAddress,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(15)

    return NextResponse.json({
      summary: {
        failedLogins24h,
        activeSessions,
        whitelistActive: whitelist.filter(w => w.isActive).length,
        whitelistEnforced: whitelist.some(w => w.isActive),
      },
      whitelist,
      recentActions,
    })
  } catch (error) {
    return handleApiError(
      error,
      'Failed to load security overview',
      'api/admin/security/overview/route.ts'
    )
  }
}
