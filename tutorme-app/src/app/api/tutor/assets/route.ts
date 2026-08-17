/**
 * GET  /api/tutor/assets  — Load all tutor assets
 * PUT  /api/tutor/assets  — Save (upsert) tutor assets
 *
 * Assets are stored per tutor and shared across all courses.
 * This allows tutors to reuse uploaded files across different courses.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { drizzleDb } from '@/lib/db/drizzle'
import { tutorAsset, course, courseLesson } from '@/lib/db/schema'
import { eq, and, inArray, isNull } from 'drizzle-orm'
import {
  deleteObject,
  extractGcsKeyFromPublicUrl,
  isGcsConfigured,
  refreshGcsUrl,
} from '@/lib/storage/gcs'
import { collectFileKeys } from '@/lib/services/course-builder.service'

interface Asset {
  id: string
  name: string
  content?: string
  url?: string
  fileKey?: string
  mimeType?: string
  size?: number
  createdAt?: string
  metadata?: Record<string, unknown>
}

// ---- GET — Load all tutor assets ----

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tutorId = session.user.id

  try {
    const assets = await drizzleDb
      .select({
        id: tutorAsset.assetId,
        name: tutorAsset.name,
        content: tutorAsset.content,
        url: tutorAsset.url,
        fileKey: tutorAsset.fileKey,
        mimeType: tutorAsset.mimeType,
        size: tutorAsset.size,
        createdAt: tutorAsset.createdAt,
        metadata: tutorAsset.metadata,
      })
      .from(tutorAsset)
      .where(eq(tutorAsset.tutorId, tutorId))
      .orderBy(tutorAsset.createdAt)

    // Refresh GCS URLs before returning — presigned URLs expire after 7 days.
    // Use stored fileKey when available; fall back to extracting key from URL.
    const formattedAssets: Asset[] = await Promise.all(
      assets.map(async asset => {
        let refreshedUrl = asset.url || undefined
        let fileKey = asset.fileKey || undefined

        if (refreshedUrl && isGcsConfigured()) {
          // Prefer stored fileKey for refresh
          if (fileKey) {
            try {
              refreshedUrl = await refreshGcsUrl(refreshedUrl, 7 * 24 * 3600)
            } catch (err) {
              console.error('[assets-get] URL refresh failed for key:', fileKey, err)
            }
          } else {
            // Backward compat: try to extract key from stored URL
            const extractedKey = extractGcsKeyFromPublicUrl(refreshedUrl)
            if (extractedKey) {
              fileKey = extractedKey
              try {
                refreshedUrl = await refreshGcsUrl(refreshedUrl, 7 * 24 * 3600)
              } catch (err) {
                console.error(
                  '[assets-get] URL refresh failed for extracted key:',
                  extractedKey,
                  err
                )
              }
            }
          }
        }

        return {
          id: asset.id,
          name: asset.name,
          content: asset.content || undefined,
          url: refreshedUrl,
          fileKey,
          mimeType: asset.mimeType || undefined,
          size: asset.size || undefined,
          createdAt: asset.createdAt?.toISOString(),
          metadata: (asset.metadata as Record<string, unknown> | null) || undefined,
        }
      })
    )

    return NextResponse.json({ assets: formattedAssets })
  } catch (error) {
    console.error('Error loading tutor assets:', error)
    return NextResponse.json({ error: 'Failed to load assets' }, { status: 500 })
  }
}

// ---- PUT — Save tutor assets (replace all) ----

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tutorId = session.user.id

  try {
    const body = await req.json()
    const assets: Asset[] = body.assets || []

    await drizzleDb.transaction(async tx => {
      // Get existing asset IDs for this tutor
      const existingAssets = await tx
        .select({ id: tutorAsset.assetId })
        .from(tutorAsset)
        .where(eq(tutorAsset.tutorId, tutorId))

      const existingIds = new Set(existingAssets.map(a => a.id))
      const incomingIds = new Set(assets.map(a => a.id))

      // Delete assets that are no longer present (and their GCS files)
      const idsToDelete = [...existingIds].filter(id => !incomingIds.has(id))
      if (idsToDelete.length > 0) {
        const assetsToDelete = await tx
          .select({ url: tutorAsset.url })
          .from(tutorAsset)
          .where(and(eq(tutorAsset.tutorId, tutorId), inArray(tutorAsset.assetId, idsToDelete)))

        for (const asset of assetsToDelete) {
          if (asset.url && isGcsConfigured()) {
            const key = extractGcsKeyFromPublicUrl(asset.url)
            if (key) {
              try {
                await deleteObject(key)
              } catch (err) {
                console.error('[assets-put] GCS delete failed:', err)
              }
            }
          }
        }

        for (const id of idsToDelete) {
          await tx
            .delete(tutorAsset)
            .where(and(eq(tutorAsset.assetId, id), eq(tutorAsset.tutorId, tutorId)))
        }
      }

      // Upsert all incoming assets
      for (const asset of assets) {
        await tx
          .insert(tutorAsset)
          .values({
            assetId: asset.id,
            tutorId,
            name: asset.name,
            content: asset.content || null,
            url: asset.url || null,
            fileKey: asset.fileKey || null,
            mimeType: asset.mimeType || null,
            size: asset.size || null,
            metadata: asset.metadata || null,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: tutorAsset.assetId,
            set: {
              name: asset.name,
              content: asset.content || null,
              url: asset.url || null,
              fileKey: asset.fileKey || null,
              mimeType: asset.mimeType || null,
              size: asset.size || null,
              metadata: asset.metadata || null,
              updatedAt: new Date(),
            },
          })
      }
    })

    return NextResponse.json({
      message: 'Assets saved successfully',
      count: assets.length,
    })
  } catch (error) {
    console.error('Error saving tutor assets:', error)
    return NextResponse.json({ error: 'Failed to save assets' }, { status: 500 })
  }
}

/**
 * Collect storage keys still referenced by this tutor's published courses.
 * A file that appears in any published course's builderData must not be deleted,
 * because students enrolled in that course still need it.
 */
async function collectPublishedReferencedKeys(tutorId: string): Promise<Set<string>> {
  const referenced = new Set<string>()
  const rows = await drizzleDb
    .select({ builderData: courseLesson.builderData })
    .from(courseLesson)
    .innerJoin(course, eq(courseLesson.courseId, course.courseId))
    .where(
      and(
        eq(course.creatorId, tutorId),
        eq(course.isPublished, true),
        isNull(courseLesson.deletedAt)
      )
    )
  for (const key of collectFileKeys(rows.map(r => r.builderData))) {
    referenced.add(key)
  }
  return referenced
}

// ---- DELETE — Delete a specific asset ----

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tutorId = session.user.id
  const { searchParams } = new URL(req.url)
  const assetId = searchParams.get('id')

  if (!assetId) {
    return NextResponse.json({ error: 'Asset ID required' }, { status: 400 })
  }

  try {
    const [assetRow] = await drizzleDb
      .select({ url: tutorAsset.url, fileKey: tutorAsset.fileKey, name: tutorAsset.name })
      .from(tutorAsset)
      .where(and(eq(tutorAsset.assetId, assetId), eq(tutorAsset.tutorId, tutorId)))
      .limit(1)

    if (!assetRow) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    // Determine the storage key for this asset.
    const assetKey =
      assetRow.fileKey || (assetRow.url ? extractGcsKeyFromPublicUrl(assetRow.url) : null)

    // Prevent deletion if the asset is still referenced by a published course.
    const publishedRefs = await collectPublishedReferencedKeys(tutorId)
    if (assetKey && publishedRefs.has(assetKey)) {
      return NextResponse.json(
        {
          error: 'Cannot delete — this file is used by a published course.',
          reason: 'published-course-reference',
          assetName: assetRow.name,
        },
        { status: 409 }
      )
    }

    if (assetRow?.url && isGcsConfigured()) {
      const key = extractGcsKeyFromPublicUrl(assetRow.url)
      if (key) {
        try {
          await deleteObject(key)
        } catch (err) {
          console.error('[assets-delete] GCS delete failed:', err)
        }
      }
    }

    await drizzleDb
      .delete(tutorAsset)
      .where(and(eq(tutorAsset.assetId, assetId), eq(tutorAsset.tutorId, tutorId)))

    return NextResponse.json({ message: 'Asset deleted successfully' })
  } catch (error) {
    console.error('Error deleting tutor asset:', error)
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 })
  }
}
