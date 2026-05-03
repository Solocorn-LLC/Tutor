'use strict'
;(() => {
  var o = 'tutorme-app',
    r = 'v2.0.2',
    a = {
      PRECACHE: `${o}-precache-${r}`,
      RUNTIME: `${o}-runtime-${r}`,
      OFFLINE: `${o}-offline-${r}`,
      IMAGES: `${o}-images-${r}`,
      API: `${o}-api-${r}`,
      STATIC: `${o}-static-${r}`,
    }
  var f = 3600 * 24 * 365
  var h = ['/offline.html', '/manifest.json']
  self.addEventListener('install', e => {
    ;(console.warn('[Service Worker] Installing...', r),
      e.waitUntil(
        caches
          .open(a.PRECACHE)
          .then(t => t.addAll(h))
          .then(() => self.skipWaiting())
          .catch(t => console.warn('[Service Worker] Precache failed:', t))
      ))
  })
  self.addEventListener('activate', e => {
    ;(console.warn('[Service Worker] Activating...', r),
      e.waitUntil(
        caches
          .keys()
          .then(t =>
            Promise.all(
              t
                .filter(s => s.startsWith(`${o}-`) && !Object.values(a).includes(s))
                .map(s => caches.delete(s))
            ).then(() => self.clients.claim())
          )
      ))
  })
  async function i() {
    try {
      let t = await (await caches.open(a.OFFLINE)).match('offline-queue')
      if (t) return (await t.json()).requests
    } catch (e) {
      console.error('[Service Worker] Failed to get offline requests:', e)
    }
    return []
  }
  async function d() {
    try {
      await (await caches.open(a.OFFLINE)).delete('offline-queue')
    } catch (e) {
      console.error('[Service Worker] Failed to clear offline requests:', e)
    }
  }
  function p(e, t) {
    let s = e.headers.get('date')
    return s ? (Date.now() - new Date(s).getTime()) / 1e3 < t : !1
  }
  self.addEventListener('fetch', e => {
    var n
    let { request: t } = e,
      s = new URL(t.url)
    if (
      t.mode === 'navigate' ||
      (t.method === 'GET' && (n = t.headers.get('accept')) != null && n.includes('text/html'))
    ) {
      e.respondWith(
        fetch(t).catch(() =>
          caches
            .open(a.PRECACHE)
            .then(c => c.match('/offline.html'))
            .then(
              c =>
                c ||
                new Response(y(), {
                  headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'no-cache',
                    'X-Offline': 'true',
                  },
                })
            )
        )
      )
      return
    }
    if (s.pathname.startsWith('/api/')) {
      e.respondWith(fetch(t))
      return
    }
    if (/\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i.test(s.pathname)) {
      e.respondWith(m(e))
      return
    }
    if (/\.(?:js|css|woff2|ttf|json)$/i.test(s.pathname)) {
      e.respondWith(l(e))
      return
    }
    if (s.hostname.includes('fonts.googleapis.com') || s.hostname.includes('fonts.gstatic.com')) {
      e.respondWith(l(e))
      return
    }
  })
  async function m(e) {
    let t = await caches.match(e.request)
    if (t) return t
    try {
      let s = await fetch(e.request)
      return (s.ok && (await caches.open(a.IMAGES)).put(e.request, s.clone()), s)
    } catch (s) {
      return t || new Response('', { status: 503 })
    }
  }
  async function l(e) {
    let t = await caches.match(e.request)
    if (t && p(t, f))
      return (
        fetch(e.request)
          .then(s => {
            s.ok && caches.open(a.STATIC).then(n => n.put(e.request, s))
          })
          .catch(() => {}),
        t
      )
    try {
      let s = await fetch(e.request)
      return (s.ok && (await caches.open(a.STATIC)).put(e.request, s.clone()), s)
    } catch (s) {
      return t || new Response('', { status: 503 })
    }
  }
  function y() {
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
  self.addEventListener('message', e => {
    var t
    if ((t = e.data) != null && t.type)
      switch (e.data.type) {
        case 'SKIP-WAITING':
          self.skipWaiting()
          break
        case 'CLIENTS-CLAIM':
          self.clients.claim()
          break
        case 'OFFLINE_SYNC_REQUEST':
          i().then(s => {
            var n
            ;(n = e.source) == null || n.postMessage({ type: 'OFFLINE_SYNC_DATA', requests: s })
          })
          break
        case 'CLEAR_OFFLINE_REQUESTS':
          d()
          break
      }
  })
  self.addEventListener('sync', e => {
    e.tag === 'background-sync' && e.waitUntil(g())
  })
  async function g() {
    let e = await i()
    for (let t of e)
      try {
        let s = { method: t.method, headers: new Headers(t.headers) }
        ;(t.body && (s.body = t.body), await fetch(t.url, s))
        let c = (await i()).filter(u => u.id !== t.id)
        await (
          await caches.open(a.OFFLINE)
        ).put(
          'offline-queue',
          new Response(JSON.stringify({ requests: c, lastSync: Date.now() }), {
            headers: { 'Content-Type': 'application/json' },
          })
        )
      } catch (s) {
        console.error('[Service Worker] Background sync failed:', t.id, s)
      }
    self.clients.matchAll({ type: 'window' }).then(t => {
      t.forEach(s => s.postMessage({ type: 'OFFLINE_SYNC_COMPLETE', success: !0 }))
    })
  }
})()
