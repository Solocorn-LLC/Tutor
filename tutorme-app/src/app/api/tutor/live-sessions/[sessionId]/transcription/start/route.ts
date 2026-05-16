import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function fetchDaily(endpoint: string, options: RequestInit = {}) {
  const apiKey = process.env.DAILY_API_KEY
  if (!apiKey) throw new Error('DAILY_API_KEY not configured')
  const res = await fetch(`https://api.daily.co/v1${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Daily API error: ${res.status} ${text}`)
  }
  return res.json().catch(() => ({}))
}

async function ensureDailyWebhook() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  const basicAuth = process.env.DAILY_WEBHOOK_BASIC_AUTH
  if (!baseUrl || !basicAuth) return

  const url = `${baseUrl.replace(/\/$/, '')}/api/webhooks/daily`

  const list = await fetchDaily('/webhooks', { method: 'GET' })
  const hooks: any[] = Array.isArray(list?.data) ? list.data : Array.isArray(list) ? list : []
  const exists = hooks.some(h => String(h?.url || '') === url)
  if (exists) return

  await fetchDaily('/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      url,
      basicAuth,
      eventTypes: ['transcript.started', 'transcript.ready-to-download', 'transcript.error'],
    }),
  })
}

export async function POST(req: NextRequest, { params }: { params: any }) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionId = await getParamAsync(params, 'sessionId')
  if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
  }

  const [row] = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      tutorId: liveSession.tutorId,
      roomId: liveSession.roomId,
      status: liveSession.status,
    })
    .from(liveSession)
    .where(eq(liveSession.sessionId, sessionId))
    .limit(1)

  if (!row) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (row.tutorId !== session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  if (!row.roomId) {
    return NextResponse.json({ error: 'Session has no Daily roomId' }, { status: 400 })
  }

  try {
    await ensureDailyWebhook()
  } catch {}

  try {
    await fetchDaily(`/rooms/${encodeURIComponent(row.roomId)}`, {
      method: 'POST',
      body: JSON.stringify({ properties: { enable_transcription_storage: true } }),
    })
  } catch {}

  try {
    await fetchDaily(`/rooms/${encodeURIComponent(row.roomId)}/transcription/start`, {
      method: 'POST',
      body: JSON.stringify({ language: 'en', punctuate: true }),
    })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to start transcription', message: error?.message || String(error) },
      { status: 400 }
    )
  }
}
