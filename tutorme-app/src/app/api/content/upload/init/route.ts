import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { contentItem } from '@/lib/db/schema'
import { getPresignedPutUrl, isGcsConfigured } from '@/lib/video/upload'

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
      const body = await req.json().catch(() => ({}))
      const title = body?.title
      const subject = body?.subject
      const lessonId = body?.lessonId
      const filename = body?.filename ?? 'video.mp4'
      const contentType = body?.contentType ?? 'video/mp4'
      if (!title || typeof title !== 'string' || !subject || typeof subject !== 'string') {
        return NextResponse.json({ error: 'title and subject required' }, { status: 400 })
      }

      const contentId = crypto.randomUUID()
      await drizzleDb.insert(contentItem).values({
        contentId: contentId,
        title: String(title).slice(0, 500),
        subject: String(subject).slice(0, 100),
        type: 'video',
        url: null,
        uploadStatus: 'uploading',
        duration: null,
        difficulty: 'beginner',
        isPublished: false,
        lessonId: typeof lessonId === 'string' ? lessonId : null,
      })
      const content = { contentId: contentId }

      const key =
        'content/' + content.contentId + '/' + String(filename).replace(/[^a-zA-Z0-9._-]/g, '_')

      if (isGcsConfigured()) {
        const presign = await getPresignedPutUrl(key, contentType)
        if (presign) {
          return NextResponse.json({
            contentId: content.contentId,
            uploadUrl: presign.uploadUrl,
            key: presign.key,
            publicUrl: presign.publicUrl,
            uploadHeaders: presign.uploadHeaders ?? null,
            expiresIn: 3600,
          })
        }
      }

      return NextResponse.json({
        contentId: content.contentId,
        message: 'GCS not configured. Set GCS_* env vars or set URL via upload-complete.',
        key,
      })
    },
    { role: 'TUTOR' }
  )
)
