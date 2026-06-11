/**
 * POST /api/uploads/cleanup
 *
 * Deletes GCS/local files by their storage keys.
 * Used by the Course Builder to clean up orphaned documents
 * when tutors replace or remove sourceDocuments.
 *
 * Body: { keys: string[] }
 * Response: { deleted: number, errors: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, handleApiError } from '@/lib/api/middleware'
import { removeFile } from '@/lib/storage/service'
import { canDeleteUploadKey } from '@/lib/security/upload-access'

export const POST = withCsrf(
  withAuth(async (req: NextRequest, session) => {
    try {
      const body = await req.json().catch(() => ({}))
      const keys = Array.isArray(body.keys) ? (body.keys as string[]) : []

      if (keys.length === 0) {
        return NextResponse.json({ deleted: 0, errors: [] })
      }

      const errors: string[] = []
      let deleted = 0

      for (const key of keys) {
        if (!key || typeof key !== 'string') continue
        if (!canDeleteUploadKey(session, key)) {
          errors.push(`${key}: access denied`)
          continue
        }
        try {
          await removeFile(key)
          deleted++
        } catch (err: any) {
          errors.push(`${key}: ${err?.message || 'delete failed'}`)
        }
      }

      return NextResponse.json({ deleted, errors })
    } catch (err: any) {
      return handleApiError(err, 'Cleanup failed', 'api/uploads/cleanup/route.ts')
    }
  })
)
