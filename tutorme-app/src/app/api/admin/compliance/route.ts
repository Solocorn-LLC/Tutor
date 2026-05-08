import { NextRequest, NextResponse } from 'next/server'
import { eq, desc, count, and, gte } from 'drizzle-orm'
import { handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { requireAdmin } from '@/lib/admin/auth'
import { Permissions } from '@/lib/admin/permissions'
import {
  deletionRequest,
  piiAccessLog,
  consentLog,
  thirdPartyAudit,
  dataExportRequest,
  ageVerification,
} from '@/lib/db/schema'

/**
 * GET /api/admin/compliance
 * Returns compliance dashboard summary for admin panel.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, Permissions.SECURITY_READ)
  if (!auth.session) return auth.response!

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [
      pendingDeletions,
      completedDeletions,
      recentPiiAccess,
      exportRequests,
      thirdParties,
      minorUsers,
      recentConsents,
    ] = await Promise.all([
      drizzleDb
        .select()
        .from(deletionRequest)
        .where(eq(deletionRequest.status, 'pending'))
        .orderBy(desc(deletionRequest.requestedAt)),
      drizzleDb
        .select({ id: deletionRequest.id })
        .from(deletionRequest)
        .where(and(eq(deletionRequest.status, 'completed'), gte(deletionRequest.processedAt, thirtyDaysAgo))),
      drizzleDb.select().from(piiAccessLog).orderBy(desc(piiAccessLog.accessedAt)).limit(50),
      drizzleDb
        .select()
        .from(dataExportRequest)
        .where(eq(dataExportRequest.status, 'pending'))
        .orderBy(desc(dataExportRequest.requestedAt)),
      drizzleDb.select().from(thirdPartyAudit).orderBy(thirdPartyAudit.serviceName),
      drizzleDb
        .select()
        .from(ageVerification)
        .where(and(eq(ageVerification.isMinor, true), eq(ageVerification.parentConsentGranted, false))),
      drizzleDb.select().from(consentLog).orderBy(desc(consentLog.grantedAt)).limit(20),
    ])

    return NextResponse.json({
      summary: {
        pendingDeletionRequests: pendingDeletions.length,
        completedDeletionsLast30Days: completedDeletions.length,
        pendingExportRequests: exportRequests.length,
        minorsWithoutParentalConsent: minorUsers.length,
        thirdPartyServicesAudited: thirdParties.length,
        thirdPartyServicesNonCompliant: thirdParties.filter(t => !t.gdprCompliant || !t.coppaCompliant)
          .length,
      },
      pendingDeletions,
      exportRequests,
      recentPiiAccess,
      thirdParties,
      minorUsers,
      recentConsents,
    })
  } catch (error) {
    return handleApiError(error, 'Failed to load compliance data', 'api/admin/compliance')
  }
}

/**
 * POST /api/admin/compliance — Process a deletion/export request
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, Permissions.SECURITY_WRITE)
  if (!auth.session) return auth.response!

  const body = await req.json().catch(() => ({}))
  const { action, requestId, adminNotes } = body as {
    action?: string
    requestId?: string
    adminNotes?: string
  }

  if (!requestId || !action) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    if (action === 'approve_deletion') {
      await drizzleDb
        .update(deletionRequest)
        .set({
          status: 'processing',
          processedBy: auth.session.adminId,
          adminNotes: adminNotes || null,
          processedAt: new Date(),
        })
        .where(eq(deletionRequest.id, requestId))

      return NextResponse.json({
        success: true,
        message: 'Deletion request approved and queued for processing.',
      })
    }

    if (action === 'reject_deletion') {
      await drizzleDb
        .update(deletionRequest)
        .set({
          status: 'rejected',
          processedBy: auth.session.adminId,
          adminNotes: adminNotes || 'Rejected by admin',
          processedAt: new Date(),
        })
        .where(eq(deletionRequest.id, requestId))

      return NextResponse.json({ success: true, message: 'Deletion request rejected.' })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return handleApiError(error, 'Failed to process request', 'api/admin/compliance')
  }
}
