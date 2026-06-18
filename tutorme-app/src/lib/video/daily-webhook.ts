/**
 * Daily.co webhook management + recording helpers.
 *
 * One global Daily webhook (per domain) delivers transcript AND recording events to
 * /api/webhooks/daily. ensureDailyWebhook() registers it (idempotently) and upgrades an
 * older transcript-only hook to also include recording events.
 */

const DAILY_BASE = 'https://api.daily.co/v1'

const WEBHOOK_EVENT_TYPES = [
  'transcript.started',
  'transcript.ready-to-download',
  'transcript.error',
  'recording.started',
  'recording.ready-to-download',
  'recording.error',
]

async function fetchDaily(endpoint: string, options: RequestInit = {}) {
  const apiKey = process.env.DAILY_API_KEY
  if (!apiKey) throw new Error('DAILY_API_KEY not configured')
  const res = await fetch(`${DAILY_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Daily API ${endpoint} failed: ${res.status} ${text.slice(0, 200)}`)
  }
  return res.json()
}

/**
 * Ensure the Daily webhook pointing at /api/webhooks/daily exists and is subscribed to
 * both transcript and recording events. Safe to call repeatedly; never throws.
 */
export async function ensureDailyWebhook(): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  const basicAuth = process.env.DAILY_WEBHOOK_BASIC_AUTH
  if (!baseUrl || !basicAuth) return

  const url = `${baseUrl.replace(/\/$/, '')}/api/webhooks/daily`

  try {
    const list = await fetchDaily('/webhooks', { method: 'GET' })
    const hooks: Array<{ uuid?: string; url?: string; eventTypes?: string[] }> = Array.isArray(
      list?.data
    )
      ? list.data
      : Array.isArray(list)
        ? list
        : []
    const existing = hooks.find(h => String(h?.url || '') === url)

    if (existing) {
      const have = new Set(existing.eventTypes || [])
      const missing = WEBHOOK_EVENT_TYPES.some(e => !have.has(e))
      // Older hooks were transcript-only; recreate to add recording events.
      if (missing && existing.uuid) {
        await fetchDaily(`/webhooks/${existing.uuid}`, { method: 'DELETE' }).catch(() => {})
      } else {
        return
      }
    }

    await fetchDaily('/webhooks', {
      method: 'POST',
      body: JSON.stringify({ url, basicAuth, eventTypes: WEBHOOK_EVENT_TYPES }),
    })
  } catch (err) {
    console.warn('[Daily] ensureDailyWebhook failed:', err)
  }
}

/**
 * Fetch a temporary download link for a finished cloud recording. The
 * recording.ready-to-download webhook does not include the link directly.
 */
export async function getRecordingDownloadLink(recordingId: string): Promise<string | null> {
  try {
    const res = await fetchDaily(`/recordings/${recordingId}/access-link`, { method: 'GET' })
    return (res?.download_link as string) || null
  } catch (err) {
    console.warn('[Daily] getRecordingDownloadLink failed:', err)
    return null
  }
}
