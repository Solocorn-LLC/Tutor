/**
 * GET /api/proxy-file?url=<encoded-url>
 *
 * Proxies a file fetch server-side to avoid CORS issues.
 * Used by the Course Builder to load PDFs from GCS or external URLs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

export const GET = withAuth(
  async (req: NextRequest) => {
    const { searchParams } = new URL(req.url)
    const targetUrl = searchParams.get('url')

    if (!targetUrl) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
    }

    // Block internal / metadata URLs
    if (
      targetUrl.startsWith('file://') ||
      targetUrl.startsWith('ftp://') ||
      targetUrl.startsWith('data:')
    ) {
      return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 })
    }

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
      })

      if (!response.ok) {
        return NextResponse.json(
          { error: `Upstream returned ${response.status}` },
          { status: response.status >= 500 ? response.status : 502 }
        )
      }

      const contentLength = response.headers.get('content-length')
      if (contentLength && parseInt(contentLength, 10) > MAX_SIZE_BYTES) {
        return NextResponse.json({ error: 'File too large' }, { status: 413 })
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream'
      const buffer = Buffer.from(await response.arrayBuffer())

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch (error) {
      console.error('[proxy-file] Fetch failed:', targetUrl, error)
      return NextResponse.json({ error: 'Failed to fetch file' }, { status: 502 })
    }
  }
)
