/**
 * GET /api/tutor/resources/[id]/download
 *
 * Generates a presigned GCS GET URL for downloading a private resource.
 * For public resources, redirects directly to the public URL.
 * Increments the download counter.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { resource, resourceShare } from '@/lib/db/schema'
import { eq, or, and } from 'drizzle-orm'
import { createPresignedDownloadUrl, isGcsConfigured } from '@/lib/storage/gcs'

export const GET = withAuth(
  async (req: NextRequest, session, context) => {
    const id = await getParamAsync(context?.params, 'id')
    if (!id) {
      return NextResponse.json({ error: 'Resource ID required' }, { status: 400 })
    }
    const userId = session.user.id

    let resourceRow: typeof resource.$inferSelect | null = null

    const direct = await drizzleDb
      .select()
      .from(resource)
      .where(
        and(
          eq(resource.resourceId, id),
          or(eq(resource.tutorId, userId), eq(resource.isPublic, true))!
        )
      )
      .limit(1)
    resourceRow = direct[0] ?? null

    if (!resourceRow) {
      const shared = await drizzleDb
        .select({ resource })
        .from(resource)
        .innerJoin(resourceShare, eq(resourceShare.resourceId, resource.resourceId))
        .where(
          and(
            eq(resource.resourceId, id),
            or(eq(resourceShare.recipientId, userId), eq(resourceShare.sharedWithAll, true))!
          )
        )
        .limit(1)
      resourceRow = shared[0]?.resource ?? null
    }

    if (!resourceRow) {
      return NextResponse.json({ error: 'Resource not found or access denied' }, { status: 404 })
    }

    drizzleDb
      .update(resource)
      .set({ downloadCount: resourceRow.downloadCount + 1 })
      .where(eq(resource.resourceId, id))
      .then(() => {})
      .catch(() => {
        // Failed to update download count - non-critical
      })

    if (isGcsConfigured() && resourceRow.key) {
      const downloadUrl = await createPresignedDownloadUrl(resourceRow.key, 3600, resourceRow.name)
      return NextResponse.json({ downloadUrl, expiresIn: 3600 })
    }

    return NextResponse.json({ downloadUrl: resourceRow.url, expiresIn: null })
  }
)
