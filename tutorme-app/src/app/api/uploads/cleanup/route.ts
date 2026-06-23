/**
 * POST /api/uploads/cleanup
 *
 * Deletes GCS/local files by their storage keys. Used by the Course Builder to
 * clean up orphaned documents when tutors replace or remove sourceDocuments,
 * or delete a task/lesson/node.
 *
 * IMPORTANT: deletion is REFERENCE-AWARE. A document uploaded once is often
 * shared — it lives in the tutor's asset library AND may be referenced by one or
 * more tasks/lessons. Deleting one task must NOT destroy a file that's still in
 * the asset library or another lesson, otherwise the file vanishes from storage
 * while the reference remains, and re-loading it later fails with
 * "Document not found in storage" (the user only recovers by re-uploading). So
 * before removing a key we skip it if it's still referenced anywhere by this
 * tutor (see collectReferencedKeys).
 *
 * Body: { keys: string[] }
 * Response: { deleted: number, skipped: number, errors: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, handleApiError } from '@/lib/api/middleware'
import { removeFile } from '@/lib/storage/service'
import { canDeleteUploadKey } from '@/lib/security/upload-access'
import { collectReferencedKeys } from '@/lib/storage/referenced-keys'

export const POST = withCsrf(
  withAuth(async (req: NextRequest, session) => {
    try {
      const body = await req.json().catch(() => ({}))
      const keys = Array.isArray(body.keys) ? (body.keys as string[]) : []

      if (keys.length === 0) {
        return NextResponse.json({ deleted: 0, skipped: 0, errors: [] })
      }

      const referenced = await collectReferencedKeys(session.user.id)

      const errors: string[] = []
      let deleted = 0
      let skipped = 0

      for (const key of keys) {
        if (!key || typeof key !== 'string') continue
        if (!canDeleteUploadKey(session, key)) {
          errors.push(`${key}: access denied`)
          continue
        }
        // Still referenced elsewhere (asset library / another lesson) — keep it.
        if (referenced.has(key)) {
          skipped++
          continue
        }
        try {
          await removeFile(key)
          deleted++
        } catch (err: any) {
          errors.push(`${key}: ${err?.message || 'delete failed'}`)
        }
      }

      return NextResponse.json({ deleted, skipped, errors })
    } catch (err: any) {
      return handleApiError(err, 'Cleanup failed', 'api/uploads/cleanup/route.ts')
    }
  })
)
