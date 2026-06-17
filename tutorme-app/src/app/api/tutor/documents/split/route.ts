/**
 * POST /api/tutor/documents/split
 *
 * Splits an already-stored multi-page PDF into one single-page PDF per page and
 * stores each page, returning the per-page file references. This replaces the old
 * client-side loop that uploaded each page in its own request (which tripped the
 * rate limiter — "too many requests" — on multi-page documents).
 *
 * Body: { key?: string, url?: string, fileName?: string }
 *   - key: the storage key of the source document (preferred)
 *   - url: a storage URL (/api/serve-upload/<key> or a GCS URL) to derive the key
 *
 * Returns: { pageCount, pages: [{ pageNumber, url, key, name }] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, handleApiError } from '@/lib/api/middleware'
import type { Session } from 'next-auth'
import { readFileBuffer } from '@/lib/storage/service'
import { extractGcsKeyFromPublicUrl } from '@/lib/storage/gcs'
import { canReadUploadKey } from '@/lib/security/upload-access'
import { splitPdfBufferIntoPages } from '@/lib/documents/split-pdf'

export const runtime = 'nodejs'

/** Derive a storage key from an explicit key or a storage/serve-upload/GCS URL. */
function resolveKey(key?: string, url?: string): string | null {
  if (key && typeof key === 'string') return key
  if (!url || typeof url !== 'string') return null
  const serveMatch = url.match(/\/api\/serve-upload\/(.+)$/)
  if (serveMatch) return decodeURIComponent(serveMatch[1].split('?')[0])
  return extractGcsKeyFromPublicUrl(url)
}

export const POST = withCsrf(
  withAuth(async (request: NextRequest, session: Session) => {
    try {
      const body = await request.json().catch(() => null)
      const resolvedKey = resolveKey(body?.key, body?.url)
      if (!resolvedKey) {
        return NextResponse.json(
          { error: 'A document key or storage URL is required' },
          { status: 400 }
        )
      }

      // Authorize: the caller must be allowed to read the source document.
      const segments = resolvedKey.split('/').filter(Boolean)
      if (!(await canReadUploadKey(session, segments))) {
        return NextResponse.json({ error: 'Not authorized to read this document' }, { status: 403 })
      }

      const sourceBuffer = await readFileBuffer(resolvedKey)
      if (!sourceBuffer) {
        return NextResponse.json({ error: 'Document not found in storage' }, { status: 404 })
      }

      try {
        const { pageCount, pages } = await splitPdfBufferIntoPages(sourceBuffer, {
          userId: session.user.id,
          fileName: body?.fileName,
        })
        return NextResponse.json({ pageCount, pages })
      } catch (splitErr) {
        const code = (splitErr as { code?: string }).code
        if (code === 'INVALID_PDF' || code === 'EMPTY_PDF' || code === 'TOO_MANY_PAGES') {
          return NextResponse.json({ error: (splitErr as Error).message }, { status: 400 })
        }
        throw splitErr
      }
    } catch (err) {
      return handleApiError(err, 'Failed to split document', 'api/tutor/documents/split/route.ts')
    }
  })
)
