/**
 * Initialize upload for a demo class video.
 * POST /api/tutor/classes/[id]/demo-video/upload/init
 * Body: { filename?, contentType?, mode? }
 * Creates a ContentItem for the video and returns a GCS presigned upload URL.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, contentItem } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getPresignedPutUrl, isVideoGcsConfigured } from '@/lib/video/upload'

const MAX_UPLOAD_BYTES = 1024 * 1024 * 500 // 500 MB
const ALLOWED_CONTENT_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const sessionId = await getParamAsync(context?.params, 'id')
      if (!sessionId) {
        return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
      }

      const [liveSessionRecord] = await drizzleDb
        .select({
          sessionId: liveSession.sessionId,
          tutorId: liveSession.tutorId,
          title: liveSession.title,
          category: liveSession.category,
          demoVideoContentId: liveSession.demoVideoContentId,
        })
        .from(liveSession)
        .where(eq(liveSession.sessionId, sessionId))
        .limit(1)

      if (!liveSessionRecord) {
        return NextResponse.json({ error: 'Demo class not found' }, { status: 404 })
      }

      if (liveSessionRecord.tutorId !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const body = await req.json().catch(() => ({}))
      const filename =
        typeof body.filename === 'string' && body.filename.trim()
          ? body.filename.trim()
          : 'demo-video.mp4'
      const contentType = ALLOWED_CONTENT_TYPES.includes(body?.contentType)
        ? body.contentType
        : 'video/mp4'
      const maxBytes =
        typeof body.maxBytes === 'number' && body.maxBytes > 0 && body.maxBytes <= MAX_UPLOAD_BYTES
          ? body.maxBytes
          : MAX_UPLOAD_BYTES

      const contentId = crypto.randomUUID()
      const title = `${liveSessionRecord.title} — Demo Video`.slice(0, 500)
      const subject = liveSessionRecord.category || 'General'

      await drizzleDb.insert(contentItem).values({
        contentId,
        title,
        subject,
        type: 'video',
        url: null,
        uploadStatus: 'uploading',
        duration: null,
        difficulty: 'beginner',
        isPublished: false,
        lessonId: null,
      })

      const key = `content/${contentId}/${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      if (isVideoGcsConfigured()) {
        const presign = await getPresignedPutUrl(key, contentType)
        if (presign) {
          return NextResponse.json({
            contentId,
            uploadUrl: presign.uploadUrl,
            publicUrl: presign.publicUrl,
            key: presign.key,
            uploadHeaders: presign.uploadHeaders ?? null,
            expiresIn: 3600,
            maxBytes,
          })
        }
      }

      return NextResponse.json({
        contentId,
        message:
          'GCS not configured. Set GCS_BUCKET or GCS_VIDEO_BUCKET env vars, or set URL via upload-complete.',
        key,
        maxBytes,
      })
    },
    { role: 'TUTOR' }
  )
)
