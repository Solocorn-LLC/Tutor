/**
 * Web Push (browser) sender. Reads VAPID config from env and delivers payloads
 * to a user's saved PushSubscriptions, pruning dead endpoints (404/410).
 *
 * Required env (server-only): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 * (a mailto:/https: URL). If unset, push is silently disabled (no-op) so the
 * rest of notifications keep working.
 */
import webpush from 'web-push'
import { eq, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { pushSubscription } from '@/lib/db/schema'

let configured: boolean | null = null

function ensureConfigured(): boolean {
  if (configured !== null) return configured
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@tutorme.app'
  if (!publicKey || !privateKey) {
    configured = false
    return false
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    configured = true
  } catch (e) {
    console.error('[web-push] Failed to set VAPID details:', e)
    configured = false
  }
  return configured
}

export function isWebPushConfigured(): boolean {
  return ensureConfigured()
}

export interface WebPushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

/** Send a push to every subscription a user has. Best-effort; never throws. */
export async function sendWebPushToUser(userId: string, payload: WebPushPayload): Promise<void> {
  if (!ensureConfigured()) return
  let subs: { id: string; endpoint: string; p256dh: string; auth: string }[]
  try {
    subs = await drizzleDb
      .select({
        id: pushSubscription.id,
        endpoint: pushSubscription.endpoint,
        p256dh: pushSubscription.p256dh,
        auth: pushSubscription.auth,
      })
      .from(pushSubscription)
      .where(eq(pushSubscription.userId, userId))
  } catch (e) {
    console.error('[web-push] Failed to load subscriptions:', e)
    return
  }
  if (subs.length === 0) return

  const body = JSON.stringify(payload)
  const dead: string[] = []

  await Promise.all(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        )
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode
        // 404/410 mean the subscription is gone — prune it.
        if (status === 404 || status === 410) {
          dead.push(sub.id)
        } else {
          console.error('[web-push] send failed:', status, (err as Error)?.message)
        }
      }
    })
  )

  if (dead.length > 0) {
    try {
      await drizzleDb.delete(pushSubscription).where(inArray(pushSubscription.id, dead))
    } catch (e) {
      console.error('[web-push] Failed to prune dead subscriptions:', e)
    }
  }
}
