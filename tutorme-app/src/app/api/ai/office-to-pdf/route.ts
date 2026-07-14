/**
 * Convert a stored Office document (Word / PowerPoint, modern or legacy) to PDF
 * on demand, so the client can rasterise its pages for diagram-aware DMI
 * generation. LibreOffice renders the true document — including vector shapes
 * and hand-drawn diagrams the OOXML media folder doesn't contain.
 *
 * Body: { fileKey: string, fileName?: string }
 * Returns: application/pdf bytes (or an error status).
 */
import { NextRequest, NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { withAuth, withCsrf, withRateLimitPreset, handleApiError } from '@/lib/api/middleware'
import { readFileBuffer } from '@/lib/storage/service'
import { convertOfficeToPdf } from '@/lib/documents/office-to-pdf'

export const runtime = 'nodejs'

export const POST = withCsrf(
  withAuth(async (request: NextRequest, session: Session) => {
    const startedAt = Date.now()
    const userId = session?.user?.id ?? 'unknown'
    try {
      // LibreOffice conversion is expensive — rate-limit it per user, like the
      // other AI-generation endpoints, so it can't be spammed.
      const { response: rateLimited } = await withRateLimitPreset(request, 'aiGenerate', userId)
      if (rateLimited) {
        console.warn(`[office-to-pdf] 429 rate limited (user ${userId})`)
        return rateLimited
      }

      const body = await request.json().catch(() => null)
      const fileKey = typeof body?.fileKey === 'string' ? body.fileKey : ''
      const fileName = typeof body?.fileName === 'string' ? body.fileName : 'document'

      // Only accept keys from our own storage namespaces — never a raw path — so
      // this can't be used to read arbitrary files.
      if (!fileKey || !/^(documents|assets|resources)\//.test(fileKey) || fileKey.includes('..')) {
        console.warn(
          `[office-to-pdf] 400 invalid fileKey (user ${userId}): ${fileKey || '(empty)'}`
        )
        return NextResponse.json({ error: 'A valid document fileKey is required' }, { status: 400 })
      }

      const input = await readFileBuffer(fileKey)
      if (!input) {
        console.warn(`[office-to-pdf] 404 not found (user ${userId}): ${fileKey}`)
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }

      console.info(
        `[office-to-pdf] request: key=${fileKey} name="${fileName}" ${input.length} bytes (user ${userId})`
      )
      const pdf = await convertOfficeToPdf(input, fileName)
      if (!pdf) {
        console.error(
          `[office-to-pdf] 422 conversion failed: key=${fileKey} after ${Date.now() - startedAt}ms (user ${userId})`
        )
        return NextResponse.json({ error: 'Could not convert the document' }, { status: 422 })
      }

      console.info(
        `[office-to-pdf] 200 ok: key=${fileKey} → ${pdf.length} bytes in ${Date.now() - startedAt}ms (user ${userId})`
      )
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(pdf.length),
          'Cache-Control': 'private, no-store',
        },
      })
    } catch (err) {
      console.error(
        `[office-to-pdf] 500 error after ${Date.now() - startedAt}ms (user ${userId}):`,
        err instanceof Error ? err.message : err
      )
      return handleApiError(err, 'Failed to convert document', 'api/ai/office-to-pdf/route.ts')
    }
  })
)
