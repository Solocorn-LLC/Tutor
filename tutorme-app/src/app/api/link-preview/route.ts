import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withRateLimitPreset, handleApiError } from '@/lib/api/middleware'
import cacheManager from '@/lib/cache-manager'
import { isValidPreviewUrl } from '@/lib/link-preview/detect-urls'
import { fetchLinkPreview } from '@/lib/link-preview/extract'
import {
  LinkPreviewMetadataSchema,
  LinkPreviewRequestSchema,
  type LinkPreviewMetadata,
} from '@/lib/link-preview/types'

export const maxDuration = 30

const CACHE_TTL_SECONDS = 24 * 60 * 60

export const POST = withAuth(
  async (req: NextRequest, _session, _context) => {
    const rateLimit = await withRateLimitPreset(req, 'aiGenerate')
    if (rateLimit.response) return rateLimit.response

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = LinkPreviewRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const url = parsed.data.url.trim()
    if (!isValidPreviewUrl(url)) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    const cacheKey = `link-preview:v2:${crypto.createHash('sha256').update(url).digest('hex')}`

    try {
      const cached = await cacheManager.get<LinkPreviewMetadata>(cacheKey, {
        schema: LinkPreviewMetadataSchema,
        ttl: CACHE_TTL_SECONDS,
      })
      if (cached) {
        return NextResponse.json(cached)
      }

      const metadata = await fetchLinkPreview(url)
      await cacheManager.set(cacheKey, metadata, {
        schema: LinkPreviewMetadataSchema,
        ttl: CACHE_TTL_SECONDS,
      })
      return NextResponse.json(metadata)
    } catch (error) {
      return handleApiError(error, 'Unable to fetch link preview', 'api/link-preview/route.ts')
    }
  },
  { role: ['TUTOR', 'ADMIN'] }
)
