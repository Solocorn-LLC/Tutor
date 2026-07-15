import { NextRequest, NextResponse } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, courseEnrollment } from '@/lib/db/schema'
import { eq, desc, and, isNotNull, inArray } from 'drizzle-orm'
import { expandToCourseFamily } from '@/lib/courses/variant-family'
import { notify } from '@/lib/notifications/notify'
import { getRecordingDownloadLink } from '@/lib/video/daily-webhook'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function checkBasicAuth(req: NextRequest): boolean {
  const expected = process.env.DAILY_WEBHOOK_BASIC_AUTH
  if (!expected) return false
  const auth = req.headers.get('authorization') || ''
  if (!auth.startsWith('Basic ')) return false
  const decoded = Buffer.from(auth.slice('Basic '.length), 'base64').toString('utf8')
  return decoded === expected
}

async function findSessionByRoom(roomName: string) {
  const [row] = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      tutorId: liveSession.tutorId,
      courseId: liveSession.courseId,
      roomId: liveSession.roomId,
      title: liveSession.title,
      status: liveSession.status,
    })
    .from(liveSession)
    .where(eq(liveSession.roomId, roomName))
    .orderBy(desc(liveSession.scheduledAt))
    .limit(1)
  return row ?? null
}

async function callAdk(path: string, payload: Record<string, unknown>) {
  const adkBaseUrl = process.env.ADK_BASE_URL?.trim()
  const adkToken = process.env.ADK_AUTH_TOKEN
  if (!adkBaseUrl || !adkToken) return
  try {
    await fetch(`${adkBaseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adkToken}`,
      },
      body: JSON.stringify(payload),
    })
  } catch {}
}

export async function POST(req: NextRequest) {
  if (!checkBasicAuth(req)) return unauthorized()

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const type = body?.type

  // ── transcript.started ──────────────────────────────────────────────
  if (type === 'transcript.started') {
    const roomName = body?.payload?.room_name
    const transcriptId = body?.payload?.id
    if (!roomName || !transcriptId) return NextResponse.json({ ok: true })

    const sessionRow = await findSessionByRoom(roomName)
    if (!sessionRow?.sessionId || !sessionRow?.tutorId) return NextResponse.json({ ok: true })

    await callAdk('/v1/live-transcription/transcript-started', {
      sessionId: sessionRow.sessionId,
      tutorId: sessionRow.tutorId,
      roomName,
      transcriptId,
    })

    return NextResponse.json({ ok: true })
  }

  // ── recording.ready-to-download ─────────────────────────────────────
  if (type === 'recording.ready-to-download' || type === 'recording.ready') {
    const roomName = body?.payload?.room_name
    const recordingId = (body?.payload?.recording_id || body?.payload?.id) as string | undefined
    const duration = body?.payload?.duration as number | undefined

    if (!roomName || !recordingId) return NextResponse.json({ ok: true })

    const sessionRow = await findSessionByRoom(roomName)
    if (!sessionRow?.sessionId) return NextResponse.json({ ok: true })

    // The webhook doesn't include the file URL — fetch a temporary access link.
    const downloadUrl = await getRecordingDownloadLink(recordingId)

    // Persist recording URL on the live session
    if (downloadUrl) {
      await drizzleDb
        .update(liveSession)
        .set({
          recordingUrl: downloadUrl,
          recordingAvailableAt: new Date(),
        })
        .where(eq(liveSession.sessionId, sessionRow.sessionId))
    }

    // Trigger artifact generation pipeline in ADK
    await callAdk('/v1/recordings/ready', {
      sessionId: sessionRow.sessionId,
      tutorId: sessionRow.tutorId,
      roomName,
      recordingId,
      downloadUrl,
      durationSeconds: duration,
    })

    // Notify all enrolled students that the recording is available
    if (sessionRow.courseId) {
      const enrollments = await drizzleDb
        .select({ studentId: courseEnrollment.studentId })
        .from(courseEnrollment)
        .where(
          inArray(courseEnrollment.courseId, await expandToCourseFamily([sessionRow.courseId]))
        )

      await Promise.allSettled(
        enrollments.map(e =>
          notify({
            userId: e.studentId,
            type: 'class',
            title: 'Session Recording Ready',
            message: `The recording for "${sessionRow.title ?? 'your session'}" is now available.`,
            actionUrl: `/student/courses/${sessionRow.courseId}/sessions`,
          })
        )
      )
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true })
}
