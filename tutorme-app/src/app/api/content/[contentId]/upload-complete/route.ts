/**
 * Mark upload complete and set video URL and duration.
 * POST /api/content/[contentId]/upload-complete
 * Body: { url?, key?, durationSeconds?, transcript? }
 * If GCS was used, send publicUrl or we build from key. Otherwise send url.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { contentItem } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

function buildPublicUrl(key: string): string {
  // Video content keys start with "content/" — use the dedicated video bucket if set
  const bucket = key.startsWith('content/')
    ? process.env.GCS_VIDEO_BUCKET || process.env.GCS_BUCKET
    : process.env.GCS_BUCKET
  return `https://storage.googleapis.com/${bucket}/${key}`
}

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const contentId = await getParamAsync(context?.params, 'contentId')
      if (!contentId) return NextResponse.json({ error: 'Content ID required' }, { status: 400 })

      const body = await req.json().catch(() => ({}))
      let url: string | null = typeof body.url === 'string' ? body.url : null
      const key = typeof body.key === 'string' ? body.key : null
      if (!url && key) url = buildPublicUrl(key)
      if (!url) {
        return NextResponse.json({ error: 'url or key required' }, { status: 400 })
      }

      const durationSeconds =
        typeof body.durationSeconds === 'number' && body.durationSeconds >= 0
          ? body.durationSeconds
          : undefined
      const transcript =
        typeof body.transcript === 'string' ? body.transcript.slice(0, 100_000) : undefined

      const result = await drizzleDb
        .update(contentItem)
        .set({
          url,
          uploadStatus: 'ready',
          ...(durationSeconds != null && { duration: durationSeconds }),
          ...(transcript != null && { transcript }),
        })
        .where(eq(contentItem.contentId, contentId))
        .returning({ id: contentItem.contentId })

      if (result.length === 0) {
        return NextResponse.json({ error: 'Content not found' }, { status: 404 })
      }

      return NextResponse.json({ ok: true, contentId })
    },
    { role: 'TUTOR' }
  )
)
