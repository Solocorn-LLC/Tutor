// @ts-nocheck
// Disabling strict TS checking for service worker due to missing DOM lib in TS config

/**
 * Enterprise-grade service worker for global PWA
 * Source: compiles to public/sw.js via build script
 * Features: offline caching, background sync, offline queue
 */
declare const self: ServiceWorkerGlobalScope
declare const __SW_CACHE_VERSION__: string

const WEBPACK_ENTRY_POINT = 'tutorme-app'
const CACHE_VERSION = __SW_CACHE_VERSION__ || 'dev'
const CACHE_NAMES = {
  PRECACHE: `${WEBPACK_ENTRY_POINT}-precache-${CACHE_VERSION}`,
  RUNTIME: `${WEBPACK_ENTRY_POINT}-runtime-${CACHE_VERSION}`,
  OFFLINE: `${WEBPACK_ENTRY_POINT}-offline-${CACHE_VERSION}`,
  IMAGES: `${WEBPACK_ENTRY_POINT}-images-${CACHE_VERSION}`,
  API: `${WEBPACK_ENTRY_POINT}-api-${CACHE_VERSION}`,
  STATIC: `${WEBPACK_ENTRY_POINT}-static-${CACHE_VERSION}`,
}

const MAX_OFFLINE_REQUESTS = 100
const API_CACHE_MAX_AGE = 60 * 5 // 5 minutes
const STATIC_CACHE_MAX_AGE = 60 * 60 * 1 // 1 hour
const API_NETWORK_TIMEOUT_MS = 10000
const NAVIGATION_TIMEOUT_MS = 10000

const AUTH_API_PREFIXES = ['/api/auth/', '/api/csrf']

interface OfflineRequest {
  id: string
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  timestamp: number
}

interface OfflineQueue {
  requests: OfflineRequest[]
  lastSync: number
}

const PRECACHE_URLS = ['/offline.html', '/manifest.json']

// Install event - cache critical resources
self.addEventListener('install', (event: any) => {
  console.warn('[Service Worker] Installing...', CACHE_VERSION)

  // Always skip waiting so the new SW activates, even if precache fails
  self.skipWaiting()

  event.waitUntil(
    caches
      .open(CACHE_NAMES.PRECACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(err => console.warn('[Service Worker] Precache failed:', err))
  )
})

// Activate event - cleanup old caches
self.addEventListener('activate', (event: any) => {
  console.warn('[Service Worker] Activating...', CACHE_VERSION)

  event.waitUntil(
    caches
      .keys()
      .then(cacheNames =>
        Promise.all(
          cacheNames
            .filter(
              name =>
                name.startsWith(`${WEBPACK_ENTRY_POINT}-`) &&
                !Object.values(CACHE_NAMES).includes(name)
            )
            .map(name => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
      .catch(err => {
        console.error('[Service Worker] Activation failed:', err)
        // Still try to claim clients even if cleanup failed
        return self.clients.claim()
      })
  )
})

async function storeOfflineRequest(request: OfflineRequest): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAMES.OFFLINE)
    const response = await cache.match('offline-queue')
    let queue: OfflineQueue = { requests: [], lastSync: Date.now() }

    if (response) {
      try {
        queue = (await response.json()) as OfflineQueue
      } catch {
        /* parse error, use fresh */
      }
    }

    queue.requests.push(request)
    queue.lastSync = Date.now()
    if (queue.requests.length > MAX_OFFLINE_REQUESTS) {
      queue.requests = queue.requests.slice(-MAX_OFFLINE_REQUESTS)
    }

    await cache.put(
      'offline-queue',
      new Response(JSON.stringify(queue), {
        headers: { 'Content-Type': 'application/json' },
      })
    )
  } catch (err) {
    console.error('[Service Worker] Failed to store offline request:', err)
  }
}

async function getOfflineRequests(): Promise<OfflineRequest[]> {
  try {
    const cache = await caches.open(CACHE_NAMES.OFFLINE)
    const response = await cache.match('offline-queue')
    if (response) {
      const queue = (await response.json()) as OfflineQueue
      return Array.isArray(queue.requests) ? queue.requests : []
    }
  } catch (err) {
    console.error('[Service Worker] Failed to get offline requests:', err)
  }
  return []
}

async function clearOfflineRequests(): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAMES.OFFLINE)
    await cache.delete('offline-queue')
  } catch (err) {
    console.error('[Service Worker] Failed to clear offline requests:', err)
  }
}

function isCacheFresh(cachedResponse: Response, maxAgeSeconds: number): boolean {
  const date = cachedResponse.headers.get('date')
  if (!date) return false
  const age = (Date.now() - new Date(date).getTime()) / 1000
  if (isNaN(age)) return false
  return age < maxAgeSeconds
}

// Fetch handler with routing logic
self.addEventListener('fetch', (event: any) => {
  const { request } = event

  // Guard: only handle GET requests for cacheable resources
  const isGet = request.method === 'GET'

  // Parse URL safely - invalid URLs fall through to browser default
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  // Navigation requests - serve offline page when offline
  if (
    request.mode === 'navigate' ||
    (isGet && request.headers.get('accept')?.includes('text/html'))
  ) {
    event.respondWith(handleNavigationRequest(event))
    return
  }

  // API requests - only intercept GETs for caching; pass POST/PUT/PATCH/DELETE through
  if (url.pathname.startsWith('/api/')) {
    if (request.method === 'GET') {
      event.respondWith(handleApiRequest(event))
    }
    // Non-GET API requests go directly to network (no SW interception)
    return
  }

  // Only cache GET requests for the following asset types
  if (!isGet) {
    return
  }

  // Images - CacheFirst
  if (/\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i.test(url.pathname)) {
    event.respondWith(handleImageRequest(event))
    return
  }

  // Static assets - StaleWhileRevalidate
  if (/\.(?:js|css|woff2|ttf|json)$/i.test(url.pathname)) {
    event.respondWith(handleStaticRequest(event))
    return
  }

  // Fonts (Google Fonts etc)
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(handleStaticRequest(event))
    return
  }
})

async function handleNavigationRequest(event: any): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS)

  try {
    const response = await fetch(event.request, { signal: controller.signal })
    clearTimeout(timeoutId)
    return response
  } catch {
    clearTimeout(timeoutId)
    const cache = await caches.open(CACHE_NAMES.PRECACHE)
    const cached = await cache.match('/offline.html')
    return (
      cached ||
      new Response(getOfflineFallbackHTML(), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Offline': 'true',
        },
      })
    )
  }
}

async function handleApiRequest(event: any): Promise<Response> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), API_NETWORK_TIMEOUT_MS)

    const response = await fetch(event.request.clone(), {
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (response.ok) {
      const cache = await caches.open(CACHE_NAMES.API)
      const clone = response.clone()
      await cache.put(event.request, clone)
    }
    return response
  } catch (err: any) {
    console.error('[SW] API fetch failed:', event.request.url, event.request.method, err?.name, err?.message)

    // Try cache
    const cache = await caches.open(CACHE_NAMES.API)
    const cached = await cache.match(event.request)
    if (cached) {
      const fresh = isCacheFresh(cached, API_CACHE_MAX_AGE)
      if (fresh) return cached
    }

    // Queue for background sync (only non-GET/HEAD requests)
    const method = event.request.method
    if (method !== 'GET' && method !== 'HEAD') {
      const offlineReq: OfflineRequest = {
        id: Date.now().toString(),
        method,
        url: event.request.url,
        headers: Object.fromEntries(event.request.headers.entries()),
        body: await event.request.text(),
        timestamp: Date.now(),
      }
      await storeOfflineRequest(offlineReq)
    }

    return new Response(
      JSON.stringify({
        error: 'offline',
        message: 'You are offline. Request will sync when connected.',
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'X-Offline': 'true',
        },
      }
    )
  }
}

async function handleImageRequest(event: any): Promise<Response> {
  const cache = await caches.open(CACHE_NAMES.IMAGES)
  const cached = await cache.match(event.request)
  if (cached) return cached

  try {
    const response = await fetch(event.request)
    if (response.ok && response.status === 200) {
      await cache.put(event.request, response.clone())
    }
    return response
  } catch {
    return new Response('', { status: 503 })
  }
}

async function handleStaticRequest(event: any): Promise<Response> {
  const cache = await caches.open(CACHE_NAMES.STATIC)
  const cached = await cache.match(event.request)

  if (cached) {
    const fresh = isCacheFresh(cached, STATIC_CACHE_MAX_AGE)
    if (!fresh) {
      // Stale - background revalidate without blocking
      fetch(event.request)
        .then(async r => {
          if (r.ok && r.status === 200) {
            await cache.put(event.request, r.clone())
          }
        })
        .catch(() => {
          // Background cache update failed - will try again on next request
        })
    }
    return cached
  }

  try {
    const response = await fetch(event.request)
    if (response.ok && response.status === 200) {
      await cache.put(event.request, response.clone())
    }
    return response
  } catch {
    return new Response('', { status: 503 })
  }
}

function getOfflineFallbackHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Offline - Solocorn</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:2rem;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#f9fafb;text-align:center}
    h1{color:#4B5563;margin-bottom:1rem}
    p{color:#6B7280;margin-bottom:2rem}
    .icon{width:100px;height:100px;margin-bottom:2rem;fill:#9CA3AF}
    button{padding:0.5rem 1rem;background:#3B82F6;color:white;border:none;border-radius:0.375rem;cursor:pointer;font-size:1rem}
    button:hover{background:#2563EB}
  </style>
</head>
<body>
  <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M1 9l2 1.5V21a1 1 0 001 1h3v-2H5v-9h14v9h-3v2h3a1 1 0 001-1v-10.5l2-1.5V9a1 1 0 00-1-1H2A1 1 0 001 9z"/></svg>
  <h1>You're offline</h1>
  <p>Please check your internet connection and try again.</p>
  <p>Your progress will be saved and synced automatically when you reconnect.</p>
  <button onclick="history.back()">Go Back</button>
</body>
</html>`
}

// Message handling
self.addEventListener('message', (event: any) => {
  if (!event.data?.type) return
  switch (event.data.type) {
    case 'SKIP-WAITING':
      self.skipWaiting()
      break
    case 'CLIENTS-CLAIM':
      self.clients.claim()
      break
    case 'OFFLINE_SYNC_REQUEST':
      getOfflineRequests().then(requests => {
        event.source?.postMessage({
          type: 'OFFLINE_SYNC_DATA',
          requests,
        })
      })
      break
    case 'CLEAR_OFFLINE_REQUESTS':
      clearOfflineRequests().then(() => {
        event.source?.postMessage({
          type: 'OFFLINE_CLEARED',
          success: true,
        })
      })
      break
  }
})

// Background sync when online
let isSyncing = false

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(replayOfflineRequests())
  }
})

async function replayOfflineRequests(): Promise<void> {
  if (isSyncing) return
  isSyncing = true

  try {
    const requests = await getOfflineRequests()
    if (requests.length === 0) {
      broadcastSyncComplete(true)
      return
    }

    const succeeded: string[] = []
    const failed: OfflineRequest[] = []

    for (const req of requests) {
      try {
        const options: RequestInit = {
          method: req.method,
          headers: new Headers(req.headers),
          credentials: 'include',
        }
        if (req.body) options.body = req.body

        const response = await fetch(req.url, options)
        if (response.ok) {
          succeeded.push(req.id)
        } else {
          failed.push(req)
          console.error(
            '[Service Worker] Background sync HTTP error:',
            req.id,
            response.status
          )
        }
      } catch (err) {
        failed.push(req)
        console.error('[Service Worker] Background sync failed:', req.id, err)
      }
    }

    // Write back only the failed requests (atomic update)
    const cache = await caches.open(CACHE_NAMES.OFFLINE)
    await cache.put(
      'offline-queue',
      new Response(
        JSON.stringify({ requests: failed, lastSync: Date.now() }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      )
    )

    const allSucceeded = failed.length === 0
    broadcastSyncComplete(allSucceeded)
  } finally {
    isSyncing = false
  }
}

function broadcastSyncComplete(success: boolean): void {
  self.clients.matchAll({ type: 'window' }).then((clients: any[]) => {
    clients.forEach(c => {
      c.postMessage({ type: 'OFFLINE_SYNC_COMPLETE', success })
    })
  })
}
