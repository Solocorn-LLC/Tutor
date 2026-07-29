/**
 * GET /api/tutor/classes/[id]/demo-video
 * PATCH /api/tutor/classes/[id]/demo-video
 * DELETE /api/tutor/classes/[id]/demo-video
 *
 * Read, assign, or remove the demo video for a demo class.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, contentItem } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { resolvePublicUrl } from '@/lib/utils'

async function loadSessionAndVideo(sessionId: string, tutorId: string) {
  const [liveSessionRecord] = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      tutorId: liveSession.tutorId,
      demoVideoContentId: liveSession.demoVideoContentId,
    })
    .from(liveSession)
    .where(eq(liveSession.sessionId, sessionId))
    .limit(1)

  if (!liveSessionRecord) return { error: 'Demo class not found', status: 404 }
  if (liveSessionRecord.tutorId !== tutorId) {
    return { error: 'Forbidden', status: 403 }
  }

  if (!liveSessionRecord.demoVideoContentId) {
    return { session: liveSessionRecord, video: null }
  }

  const [video] = await drizzleDb
    .select({
      contentId: contentItem.contentId,
      title: contentItem.title,
      url: contentItem.url,
      duration: contentItem.duration,
      uploadStatus: contentItem.uploadStatus,
      createdAt: contentItem.createdAt,
    })
    .from(contentItem)
    .where(eq(contentItem.contentId, liveSessionRecord.demoVideoContentId))
    .limit(1)

  return { session: liveSessionRecord, video: video || null }
}

export const GET = withAuth(
  async (req: NextRequest, session, context) => {
    const sessionId = await getParamAsync(context?.params, 'id')
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
    }

    const result = await loadSessionAndVideo(sessionId, session.user.id)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    if (!result.video) {
      return NextResponse.json({ video: null })
    }

    return NextResponse.json({
      video: {
        contentId: result.video.contentId,
        title: result.video.title,
        url: resolvePublicUrl(result.video.url),
        duration: result.video.duration,
        uploadStatus: result.video.uploadStatus,
        createdAt: result.video.createdAt?.toISOString() ?? null,
      },
    })
  },
  { role: 'TUTOR' }
)

export const PATCH = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const sessionId = await getParamAsync(context?.params, 'id')
      if (!sessionId) {
        return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
      }

      const body = await req.json().catch(() => ({}))
      const contentId = typeof body.contentId === 'string' ? body.contentId : null
      if (!contentId) {
        return NextResponse.json({ error: 'contentId required' }, { status: 400 })
      }

      const [liveSessionRecord] = await drizzleDb
        .select({ sessionId: liveSession.sessionId, tutorId: liveSession.tutorId })
        .from(liveSession)
        .where(eq(liveSession.sessionId, sessionId))
        .limit(1)

      if (!liveSessionRecord) {
        return NextResponse.json({ error: 'Demo class not found' }, { status: 404 })
      }
      if (liveSessionRecord.tutorId !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const [video] = await drizzleDb
        .select({ contentId: contentItem.contentId, uploadStatus: contentItem.uploadStatus })
        .from(contentItem)
        .where(eq(contentItem.contentId, contentId))
        .limit(1)

      if (!video) {
        return NextResponse.json({ error: 'Video content not found' }, { status: 404 })
      }

      // Mark the content item ready if it was still uploading.
      if (video.uploadStatus === 'uploading') {
        await drizzleDb
          .update(contentItem)
          .set({ uploadStatus: 'ready' })
          .where(eq(contentItem.contentId, contentId))
      }

      await drizzleDb
        .update(liveSession)
        .set({ demoVideoContentId: contentId })
        .where(eq(liveSession.sessionId, sessionId))

      return NextResponse.json({ ok: true, contentId })
    },
    { role: 'TUTOR' }
  )
)

export const DELETE = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const sessionId = await getParamAsync(context?.params, 'id')
      if (!sessionId) {
        return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
      }

      const [liveSessionRecord] = await drizzleDb
        .select({ sessionId: liveSession.sessionId, tutorId: liveSession.tutorId })
        .from(liveSession)
        .where(eq(liveSession.sessionId, sessionId))
        .limit(1)

      if (!liveSessionRecord) {
        return NextResponse.json({ error: 'Demo class not found' }, { status: 404 })
      }
      if (liveSessionRecord.tutorId !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      await drizzleDb
        .update(liveSession)
        .set({ demoVideoContentId: null })
        .where(eq(liveSession.sessionId, sessionId))

      return NextResponse.json({ ok: true })
    },
    { role: 'TUTOR' }
  )
)
