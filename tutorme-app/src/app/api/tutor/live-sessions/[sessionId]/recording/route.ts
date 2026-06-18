import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { getParamAsync } from '@/lib/api/params'
import { requireCsrf } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, sessionReplayArtifact } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { randomUUID } from 'crypto'

export async function PATCH(req: NextRequest, { params }: { params: any }) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const csrfError = await requireCsrf(req)
  if (csrfError) return csrfError

  const liveSessionId = await getParamAsync(params, 'sessionId')

  if (!liveSessionId || liveSessionId === 'undefined' || liveSessionId === 'null') {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
  }
  const body = await req.json().catch(() => ({}))
  const isRecording = Boolean(body?.isRecording)
  const recordingUrl = typeof body?.recordingUrl === 'string' ? body.recordingUrl : null

  const rows = await drizzleDb
    .select()
    .from(liveSession)
    .where(and(eq(liveSession.sessionId, liveSessionId), eq(liveSession.tutorId, session.user.id)))
    .limit(1)

  const liveSessionRow = rows[0]
  if (!liveSessionRow) {
    return NextResponse.json({ error: 'Live session not found' }, { status: 404 })
  }

  await drizzleDb
    .update(liveSession)
    .set({
      recordingUrl: isRecording ? recordingUrl : null,
      recordingAvailableAt: isRecording ? (recordingUrl ? new Date() : null) : null,
    })
    .where(eq(liveSession.sessionId, liveSessionId))

  const existing = await drizzleDb
    .select()
    .from(sessionReplayArtifact)
    .where(eq(sessionReplayArtifact.sessionId, liveSessionId))
    .limit(1)

  if (existing[0]) {
    await drizzleDb
      .update(sessionReplayArtifact)
      .set({
        recordingUrl: isRecording ? recordingUrl : null,
        status: isRecording ? 'processing' : 'pending',
        startedAt: isRecording ? new Date() : undefined,
        endedAt: isRecording ? null : new Date(),
      })
      .where(eq(sessionReplayArtifact.sessionId, liveSessionId))
  } else {
    await drizzleDb.insert(sessionReplayArtifact).values({
      artifactId: randomUUID(),
      sessionId: liveSessionId,
      tutorId: session.user.id,
      recordingUrl: isRecording ? recordingUrl : null,
      status: isRecording ? 'processing' : 'pending',
      startedAt: isRecording ? new Date() : null,
      endedAt: isRecording ? null : new Date(),
    })
  }

  return NextResponse.json({ success: true })
}
