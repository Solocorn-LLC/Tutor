/**
 * GET /api/live-sessions/[id]/demo-video
 * Public/authenticated endpoint to fetch the demo video for a live session.
 * Used by students after entering a demo class to decide whether to play the video.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, contentItem } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { resolvePublicUrl } from '@/lib/utils'

export const GET = withAuth(async (req: NextRequest, session, context) => {
  const sessionId = await getParamAsync(context?.params, 'id')
  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
  }

  const [liveSessionRecord] = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      sessionType: liveSession.sessionType,
      demoVideoContentId: liveSession.demoVideoContentId,
    })
    .from(liveSession)
    .where(eq(liveSession.sessionId, sessionId))
    .limit(1)

  if (!liveSessionRecord) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (!liveSessionRecord.demoVideoContentId) {
    return NextResponse.json({ video: null })
  }

  const [video] = await drizzleDb
    .select({
      contentId: contentItem.contentId,
      title: contentItem.title,
      url: contentItem.url,
      duration: contentItem.duration,
    })
    .from(contentItem)
    .where(eq(contentItem.contentId, liveSessionRecord.demoVideoContentId))
    .limit(1)

  if (!video) {
    return NextResponse.json({ video: null })
  }

  return NextResponse.json({
    video: {
      contentId: video.contentId,
      title: video.title,
      url: resolvePublicUrl(video.url),
      duration: video.duration,
    },
  })
})
