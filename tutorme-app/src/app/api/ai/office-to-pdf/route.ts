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
import { withAuth, withCsrf, handleApiError } from '@/lib/api/middleware'
import { readFileBuffer } from '@/lib/storage/service'
import { convertOfficeToPdf } from '@/lib/documents/office-to-pdf'

export const runtime = 'nodejs'

export const POST = withCsrf(
  withAuth(async (request: NextRequest, _session: Session) => {
    try {
      const body = await request.json().catch(() => null)
      const fileKey = typeof body?.fileKey === 'string' ? body.fileKey : ''
      const fileName = typeof body?.fileName === 'string' ? body.fileName : 'document'

      // Only accept keys from our own storage namespaces — never a raw path — so
      // this can't be used to read arbitrary files.
      if (!fileKey || !/^(documents|assets|resources)\//.test(fileKey) || fileKey.includes('..')) {
        return NextResponse.json({ error: 'A valid document fileKey is required' }, { status: 400 })
      }

      const input = await readFileBuffer(fileKey)
      if (!input) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }

      const pdf = await convertOfficeToPdf(input, fileName)
      if (!pdf) {
        return NextResponse.json({ error: 'Could not convert the document' }, { status: 422 })
      }

      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(pdf.length),
          'Cache-Control': 'private, no-store',
        },
      })
    } catch (err) {
      return handleApiError(err, 'Failed to convert document', 'api/ai/office-to-pdf/route.ts')
    }
  })
)
