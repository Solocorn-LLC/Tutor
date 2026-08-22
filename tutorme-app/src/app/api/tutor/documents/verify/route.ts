import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { fileExists } from '@/lib/storage/service'
import { extractGcsKeyFromPublicUrl, isGcsConfigured } from '@/lib/storage/gcs'

interface VerifyRequest {
  fileUrl?: string | null
  fileKey?: string | null
}

/**
 * POST /api/tutor/documents/verify
 *
 * Diagnostic endpoint for the course-builder PDF viewer. Tells the tutor whether
 * a referenced document can still be reached in storage and, if not, why.
 *
 * Checks:
 *   1. Stored fileKey (if present).
 *   2. Key recovered from a GCS public/presigned URL.
 *   3. Same-origin serve-upload path (extract the key from /api/serve-upload/<key>).
 */
export const POST = withAuth(
  async (req: NextRequest, session) => {
    try {
      const body = (await req.json().catch(() => ({}))) as VerifyRequest
      const fileUrl = body.fileUrl || null
      const fileKey = body.fileKey || null

      if (!fileUrl && !fileKey) {
        return NextResponse.json({ error: 'Provide fileUrl and/or fileKey' }, { status: 400 })
      }

      const checks: {
        storedKey?: string | null
        recoveredKey?: string | null
        serveUploadKey?: string | null
        checkedKey?: string | null
        gcsConfigured: boolean
        reason?: string
      } = {
        storedKey: fileKey,
        recoveredKey: null,
        serveUploadKey: null,
        checkedKey: null,
        gcsConfigured: isGcsConfigured(),
      }

      // 1. Stored fileKey
      if (
        fileKey &&
        /^(?:(?:documents|assets|resources|messages|audio)\/|tutors\/[^/]+\/resources\/)/.test(
          fileKey
        ) &&
        !fileKey.includes('..')
      ) {
        checks.checkedKey = fileKey
        const found = await fileExists(fileKey)
        if (found) {
          return NextResponse.json({
            ...checks,
            found: true,
            reason: 'Found by stored fileKey.',
          })
        }
      }

      // 2. Recover key from GCS public URL
      if (fileUrl) {
        const recovered = extractGcsKeyFromPublicUrl(fileUrl)
        if (recovered && recovered !== fileKey) {
          checks.recoveredKey = recovered
          checks.checkedKey = recovered
          const found = await fileExists(recovered)
          if (found) {
            return NextResponse.json({
              ...checks,
              found: true,
              reason: 'Found by recovering key from stored URL; the stored fileKey may be stale.',
            })
          }
        }

        // 3. Same-origin serve-upload path
        if (fileUrl.startsWith('/api/serve-upload/')) {
          const segments = fileUrl.replace('/api/serve-upload/', '').split('/').filter(Boolean)
          if (segments.length > 0) {
            const serveKey = segments.join('/')
            checks.serveUploadKey = serveKey
            if (serveKey !== fileKey && serveKey !== recovered) {
              checks.checkedKey = serveKey
              const found = await fileExists(serveKey)
              if (found) {
                return NextResponse.json({
                  ...checks,
                  found: true,
                  reason: 'Found by key extracted from serve-upload path.',
                })
              }
            }
          }
        }
      }

      return NextResponse.json({
        ...checks,
        found: false,
        reason:
          'The document could not be found in storage with any known key. ' +
          'The object may have been deleted or the stored reference is mismatched.',
      })
    } catch (error: any) {
      console.error('[documents/verify] Error:', error)
      return NextResponse.json({ error: error.message || 'Verification failed' }, { status: 500 })
    }
  },
  { role: 'TUTOR' }
)
