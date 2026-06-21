/**
 * Browser-side web-push subscription helper. Registers the user's device with
 * the server so they receive session reminders even when the app is closed.
 * Safe no-ops when push is unsupported or VAPID isn't configured.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

async function getCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/csrf', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    return data?.token ?? null
  } catch {
    return null
  }
}

/**
 * Ensure the current browser is subscribed to push. Returns:
 *  - 'subscribed'  — registered (or already registered) successfully
 *  - 'denied'      — the user blocked notifications
 *  - 'unsupported' — push not available / VAPID not configured
 */
export async function ensurePushSubscription(): Promise<
  'subscribed' | 'denied' | 'unsupported'
> {
  if (!isPushSupported()) return 'unsupported'

  // Need the VAPID public key from the server.
  let key: string | null = null
  try {
    const res = await fetch('/api/push/vapid-public-key')
    key = (await res.json())?.key ?? null
  } catch {
    key = null
  }
  if (!key) return 'unsupported'

  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'unsupported'
  }

  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      })
    }
    const csrf = await getCsrfToken()
    await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    })
    return 'subscribed'
  } catch (e) {
    console.error('[push] subscribe failed:', e)
    return 'unsupported'
  }
}
