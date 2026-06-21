/**
 * Central Notification Service (Drizzle ORM)
 *
 * Handles in-app (DB), email (Resend), and real-time push (SSE).
 * Uses global crypto.randomUUID() so this file is not tied to Node's crypto (Edge-safe when used server-side only).
 */

import { eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { notificationPreference, notification, user } from '@/lib/db/schema'
import { sendWebPushToUser } from '@/lib/push/web-push'

export type NotificationType =
  | 'assignment'
  | 'class'
  | 'message'
  | 'mention'
  | 'enrollment'
  | 'payment'
  | 'system'
  | 'reminder'
  | 'achievement'
  | 'grade'

interface NotifyParams {
  userId: string
  type: NotificationType
  title: string
  message: string
  data?: Record<string, unknown>
  actionUrl?: string
  force?: boolean
}

interface NotifyManyParams {
  userIds: string[]
  type: NotificationType
  title: string
  message: string
  data?: Record<string, unknown>
  actionUrl?: string
  force?: boolean
}

type SSECallback = (notification: unknown) => void
const sseListeners = new Map<string, Set<SSECallback>>()

export function addSSEListener(userId: string, cb: SSECallback) {
  if (!sseListeners.has(userId)) sseListeners.set(userId, new Set())
  sseListeners.get(userId)!.add(cb)
  return () => {
    sseListeners.get(userId)?.delete(cb)
    if (sseListeners.get(userId)?.size === 0) sseListeners.delete(userId)
  }
}

function broadcastToUser(userId: string, notification: unknown) {
  const listeners = sseListeners.get(userId)
  if (listeners) {
    for (const cb of listeners) {
      try {
        cb(notification)
      } catch {
        /* ignore */
      }
    }
  }
}

interface ChannelDecision {
  inApp: boolean
  email: boolean
  push: boolean
}

async function getChannelDecision(
  userId: string,
  type: NotificationType,
  force: boolean
): Promise<ChannelDecision> {
  if (force) return { inApp: true, email: true, push: true }

  const [prefs] = await drizzleDb
    .select()
    .from(notificationPreference)
    .where(eq(notificationPreference.userId, userId))
    .limit(1)

  if (!prefs) return { inApp: true, email: true, push: true }

  const decision: ChannelDecision = {
    inApp: prefs.inAppEnabled,
    email: prefs.emailEnabled,
    push: prefs.pushEnabled,
  }

  const overrides = prefs.channelOverrides as Record<
    string,
    { inApp?: boolean; email?: boolean; push?: boolean }
  > | null
  if (overrides?.[type]) {
    const o = overrides[type]
    if (typeof o.inApp === 'boolean') decision.inApp = o.inApp
    if (typeof o.email === 'boolean') decision.email = o.email
    if (typeof o.push === 'boolean') decision.push = o.push
  }

  if (prefs.quietHoursStart && prefs.quietHoursEnd) {
    const isQuiet = isInQuietHours(prefs.quietHoursStart, prefs.quietHoursEnd, prefs.timezone)
    if (isQuiet) decision.push = false
  }

  if (prefs.emailDigest !== 'instant') {
    decision.email = false
  }

  return decision
}

export async function getNotificationChannels(
  userId: string,
  type: NotificationType,
  force = false
): Promise<ChannelDecision> {
  return getChannelDecision(userId, type, force)
}

function isInQuietHours(start: string, end: string, timezone: string): boolean {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const currentTime = formatter.format(now)
    if (start <= end) return currentTime >= start && currentTime <= end
    return currentTime >= start || currentTime <= end
  } catch {
    return false
  }
}

async function sendNotificationEmail(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  actionUrl?: string
) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log(`[notify-email] (no RESEND_API_KEY) Would email user ${userId}: ${title}`)
    return
  }

  const [u] = await drizzleDb
    .select({ email: user.email })
    .from(user)
    .where(eq(user.userId, userId))
    .limit(1)
  if (!u?.email) return

  const from = process.env.NOTIFICATION_EMAIL_FROM || 'Solocorn <notifications@tutorme.com>'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const actionButton = actionUrl
    ? `<p style="margin-top:16px"><a href="${appUrl}${actionUrl}" style="background:#3b82f6;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">View Details</a></p>`
    : ''

  const html = `
    <div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <div style="padding:24px;background:#f8fafc;border-radius:12px">
        <h2 style="margin:0 0 8px;color:#1e293b;font-size:18px">${title}</h2>
        <p style="margin:0;color:#475569;font-size:14px;line-height:1.6">${message}</p>
        ${actionButton}
      </div>
      <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px">
        You can <a href="${appUrl}/student/settings" style="color:#3b82f6">manage your notification preferences</a>.
      </p>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: u.email,
        subject: `${title} – Solocorn`,
        html,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error(`[notify-email] Resend failed:`, res.status, err)
    }
  } catch (e) {
    console.error(`[notify-email] Send failed:`, e)
  }
}

export async function notify(params: NotifyParams) {
  const { userId, type, title, message, data, actionUrl, force = false } = params

  const channels = await getChannelDecision(userId, type, force)

  let inAppRecord: {
    notificationId: string
    userId: string
    type: string
    title: string
    message: string
    createdAt: Date
  } | null = null

  if (channels.inApp) {
    const [row] = await drizzleDb
      .insert(notification)
      .values({
        notificationId: crypto.randomUUID(),
        userId,
        type,
        title,
        message,
        data: data ?? undefined,
        actionUrl: actionUrl ?? null,
        read: false,
      })
      .returning()
    inAppRecord = row ?? null
  }

  if (channels.push) {
    broadcastToUser(
      userId,
      inAppRecord ?? { type, title, message, actionUrl, createdAt: new Date() }
    )
    // Browser web-push (best-effort; no-op when VAPID is unconfigured).
    void sendWebPushToUser(userId, {
      title,
      body: message,
      url: actionUrl ?? undefined,
      tag: type,
    }).catch(e => console.error('[notify] web-push error:', e))
  }

  if (channels.email) {
    sendNotificationEmail(userId, type, title, message, actionUrl).catch(e =>
      console.error('[notify] Email send error:', e)
    )
  }

  return inAppRecord
}

export async function notifyMany(params: NotifyManyParams) {
  const { userIds, type, title, message, data, actionUrl, force = false } = params

  const results = await Promise.allSettled(
    userIds.map(userId => notify({ userId, type, title, message, data, actionUrl, force }))
  )

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length

  return { sent: succeeded, failed, total: userIds.length }
}
