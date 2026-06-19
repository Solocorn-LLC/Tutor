/**
 * GET /api/proxy-file?url=<encoded-url>
 *
 * Proxies a file fetch server-side to avoid CORS issues.
 * Used by the Course Builder to load PDFs from GCS or external URLs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { assertSafeProxyUrl } from '@/lib/security/proxy-url'
import { isGcsConfigured, refreshGcsUrl, downloadBuffer } from '@/lib/storage/gcs'

/**
 * Infer an inline-renderable content type from an object key's extension.
 * Used by the by-key streaming path so PDFs/images display in an <iframe>/<img>.
 */
function contentTypeForKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'pdf':
      return 'application/pdf'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50MB
const MAX_REDIRECTS = 5

export const runtime = 'nodejs'

/**
 * Fetch a URL, following redirects manually so each hop can be re-validated
 * with assertSafeProxyUrl (prevents SSRF via a redirect to an internal host).
 */
async function fetchFollowingRedirects(startUrl: string): Promise<Response> {
  let currentUrl = startUrl
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': 'TutorMe-Proxy/1.0' },
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return response
      const nextUrl = new URL(location, currentUrl)
      const safeNext = await assertSafeProxyUrl(nextUrl.toString())
      currentUrl = safeNext.toString()
      continue
    }

    return response
  }
  throw new Error('Too many redirects')
}

/**
 * GCS (and S3-compatible) error responses are a small XML document like:
 *   <Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message>...</Error>
 * Extract the code/message so the UI can show a clean, actionable message
 * instead of dumping raw XML.
 */
function parseStorageError(body: string): { code: string | null; message: string | null } {
  const code = /<Code>([^<]*)<\/Code>/i.exec(body)?.[1] ?? null
  const message = /<Message>([^<]*)<\/Message>/i.exec(body)?.[1] ?? null
  return { code, message }
}

async function readLimitedResponse(response: Response): Promise<Buffer> {
  if (!response.body) return Buffer.from(await response.arrayBuffer())

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_SIZE_BYTES) {
      await reader.cancel()
      throw new Error('File too large')
    }
    chunks.push(Buffer.from(value))
  }

  return Buffer.concat(chunks)
}

export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const targetUrl = searchParams.get('url')
  const objectKey = searchParams.get('key')

  // By-key streaming: download the object server-side using the service
  // account's READ access (storage.objects.get) and stream it back same-origin.
  // This is resilient to signing problems — it needs no signed/public URL, so a
  // missing iam.serviceAccounts.signBlob permission (which makes "signed" URLs
  // fall back to public URLs that 403 under uniform bucket-level access) no
  // longer breaks document display for students.
  if (objectKey) {
    // Restrict to known upload prefixes and block path traversal so this can't
    // be used to read arbitrary objects.
    if (!/^(documents|assets|resources)\//.test(objectKey) || objectKey.includes('..')) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
    }
    if (!isGcsConfigured()) {
      return NextResponse.json({ error: 'Storage not configured' }, { status: 503 })
    }
    try {
      const buf = await downloadBuffer(objectKey)
      if (!buf) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': contentTypeForKey(objectKey),
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, max-age=3600',
        },
      })
    } catch (error) {
      console.error('[proxy-file] by-key download failed:', objectKey, error)
      return NextResponse.json({ error: 'Failed to load file' }, { status: 502 })
    }
  }

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url or key parameter' }, { status: 400 })
  }

  let urlToFetch = targetUrl
  try {
    const safeUrl = await assertSafeProxyUrl(targetUrl)
    urlToFetch = safeUrl.toString()

    // Refresh expired GCS presigned URLs before fetching.
    // Cached per object key so repeated requests for the same file don't exhaust signBlob quota.
    if (isGcsConfigured()) {
      try {
        const refreshed = await refreshGcsUrl(urlToFetch, 3600)
        if (refreshed !== urlToFetch) {
          urlToFetch = refreshed
        }
      } catch {
        // If refresh fails, proceed with the validated URL
      }
    }

    const response = await fetchFollowingRedirects(urlToFetch)

    if (!response.ok) {
      // Surface the upstream error body (often a short XML/JSON message from
      // GCS, e.g. "Request has expired" for a stale signed URL) so the UI can
      // show something actionable instead of a bare status code.
      let body = ''
      try {
        body = (await response.text()).slice(0, 1000)
      } catch {
        // ignore — body may not be readable
      }

      const { code, message } = parseStorageError(body)

      // 4xx/5xx from the upstream (expired/invalid link, not found, forbidden,
      // upstream error) describe a real problem with the document itself —
      // pass the real status through. Only an unresolved redirect (3xx with no
      // Location) is a genuine gateway failure.
      const status = response.status >= 400 ? response.status : 502
      const detail = message || body
      return NextResponse.json(
        {
          error: `Upstream returned ${response.status}${detail ? `: ${detail}` : ''}`,
          code,
        },
        { status }
      )
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 })
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const buffer = await readLimitedResponse(response)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('[proxy-file] Fetch failed:', urlToFetch, error)
    const message = error instanceof Error ? error.message : 'Failed to fetch file'
    const status = message.includes('too large')
      ? 413
      : message.includes('URL') ||
          message.includes('protocol') ||
          message.includes('network') ||
          message.includes('hosts')
        ? 400
        : 502
    return NextResponse.json({ error: message }, { status })
  }
})
