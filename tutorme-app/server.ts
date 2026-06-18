/**
 * Custom Next.js Server with Socket.io
 * Required for real-time WebSocket support in the live clinic system
 */

import { createServer } from 'http'
import { parse } from 'url'
import { resolve } from 'path'
import next from 'next'
import { config as dotenvConfig } from 'dotenv'
import { initEnhancedSocketServer } from './src/lib/socket-server-enhanced'
import { validateEnv } from './src/lib/env'
import { applyStartupSchemaFixes } from './src/lib/db/startup-schema-fix'

// Load environment variables from .env.local before validation
// .env.local takes precedence over .env
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })
dotenvConfig({ path: resolve(process.cwd(), '.env') })

// Startup readiness state
let isReady = false
let initError: Error | null = null

// Fail fast when required env vars are missing
console.log('--- [Server Survivor Block] ---')
console.log(`[Server] Start time: ${new Date().toISOString()}`)
console.log(`[Server] Node Memory Limit: ${process.env.NODE_OPTIONS || 'Default'}`)

// Keep the process alive during background errors so a single thrown promise
// does not drop all connected clients while the server is warming up.
process.on('uncaughtException', err => {
  console.error('🔥 [Server] Uncaught Exception:', err)
})
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 [Server] Unhandled Rejection at:', promise, 'reason:', reason)
})

// Periodic memory monitoring to diagnose OOM-kills early
setInterval(() => {
  const memory = process.memoryUsage()
  const rss = Math.round((memory.rss / 1024 / 1024) * 100) / 100
  const heap = Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100
  console.log(`[Server] Memory Usage: RSS=${rss}MB, Heap=${heap}MB, Ready=${isReady}`)
}, 15000).unref() // Unref so it doesn't block process exit if needed

// 4. Initialization (NEXT.JS + SOCKET.IO)
const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT || '3003', 10)
const hostname = process.env.HOSTNAME || '0.0.0.0'

/**
 * PRODUCTION PATH RESOLUTION:
 * In monorepos, standalone output is nested. We ensure 'dir' points to where .next is.
 */
const appDir = resolve(__dirname)
console.log(`[Server] Environment: ${process.env.NODE_ENV}, Port: ${port}, Hostname: ${hostname}, App Dir: ${appDir}`)

const app = next({
  dev,
  hostname,
  port,
  dir: appDir, // Ensure we look in the current folder for .next
})
const handle = app.getRequestHandler()

// Create the HTTP server and bind to the port IMMEDIATELY
const server = createServer(async (req, res) => {
  try {
    // 1. Check for health check endpoint
    if (req.url === '/api/health' || req.url === '/health') {
      res.statusCode = isReady && !initError ? 200 : 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          status: isReady && !initError ? 'up' : isReady ? 'degraded' : 'initializing',
          error: initError?.message,
          timestamp: new Date().toISOString(),
        })
      )
      return
    }

    // 2. Ensure readiness
    if (!isReady) {
      res.statusCode = 503
      res.setHeader('Retry-After', '2')
      // API clients call res.json() unconditionally in many places, so a plain-text
      // body here would surface as a confusing "Unexpected token ... is not valid
      // JSON" error in the UI. Return JSON for API requests so it lands in the
      // normal { error } handling instead.
      const wantsJson =
        (req.url || '').startsWith('/api/') ||
        (req.headers.accept || '').includes('application/json')
      if (wantsJson) {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Server is warming up... (Renderer preparing)' }))
      } else {
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Starting up - Solocorn</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:2rem;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;color:#334155;text-align:center}
    .spinner{width:48px;height:48px;border:4px solid #e2e8f0;border-top-color:#2563eb;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:1.5rem}
    @keyframes spin{to{transform:rotate(360deg)}}
    h1{font-size:1.5rem;font-weight:600;margin:0 0 .5rem}
    p{margin:0;color:#64748b}
  </style>
</head>
<body>
  <div class="spinner"></div>
  <h1>Starting up...</h1>
  <p>The server is getting ready. This page will refresh automatically.</p>
  <script>
    (function(){
      var hasReloaded = false;
      var check = function(){
        if (hasReloaded) return;
        fetch('/api/health',{cache:'no-store'})
          .then(function(r){ return r.json().then(function(data){ return {ok:r.ok,data:data}; }); })
          .then(function(result){
            if(result.ok && result.data && result.data.status === 'up'){
              hasReloaded = true;
              window.location.reload();
            }
          })
          .catch(function(){});
      };
      setInterval(check, 2000);
    })();
  </script>
</body>
</html>`)
      }
      return
    }

    // 3. Normal request handling
    const parsedUrl = parse(req.url!, true)

    // LOG ALL REQUESTS FOR 404 DIAGNOSTICS:
    if (process.env.DEBUG_SERVER === 'true') {
      console.log(`[Server] Request: ${req.url}`)
    }

    await handle(req, res, parsedUrl)
  } catch (err: unknown) {
    const error = err as Error
    console.error('❌ [Server] Request Handling Fatal Error:', {
      message: error?.message,
      url: req.url,
      stack: error?.stack,
    })
    res.statusCode = 500
    res.end(`Internal Server Error (Diagnostics: ${error?.message || 'Unknown'})`)
  }
})

// BIND PORT IMMEDIATELY
server
  .once('error', err => {
    console.error('❌ [Server] Fatal port binding error:', err)
    process.exit(1)
  })
  .listen(port, hostname, () => {
    console.log(`✅ [Server] Listener active on ${hostname}:${port}`)

    const elapsed = (start: number) => `${Date.now() - start}ms`

    const initialize = async () => {
      const startupStart = Date.now()

      // Step 1: Validate Environment
      try {
        console.log('[Server] Step 1: Validating Environment...')
        validateEnv()
      } catch (envErr: unknown) {
        const error = envErr instanceof Error ? envErr : new Error('Environment validation failed')
        console.error('❌ [Server] Environment Validation Failed:', error.message)
        initError = error
        if (process.env.NODE_ENV === 'production') {
          process.exit(1)
        }
      }

      // Step 1b: Apply idempotent schema drift fixes in the background.
      // This is safe to run on every boot but does not need to block serving traffic.
      const schemaFixStart = Date.now()
      const schemaFixPromise = applyStartupSchemaFixes()
        .then(() => {
          console.log(`[Server] Step 1b: Schema fixes completed in ${elapsed(schemaFixStart)}`)
        })
        .catch((schemaErr: unknown) => {
          const error = schemaErr instanceof Error ? schemaErr : new Error('Schema fix failed')
          console.error('⚠️ [Server] Schema fix warning:', error.message)
        })

      // Step 2 & 3: Prepare Next.js and Socket.io (critical path)
      let isNextPrepared = false
      try {
        console.log('[Server] Step 2: Preparing Next.js renderer...')
        const prepareStart = Date.now()
        await app.prepare()
        isNextPrepared = true
        console.log(`[Server] ✅ Next.js renderer ready in ${elapsed(prepareStart)}.`)

        console.log('[Server] Step 3: Initializing Socket.io...')
        const socketStart = Date.now()
        await initEnhancedSocketServer(server)
        console.log(`[Server] ✅ Socket.io ready in ${elapsed(socketStart)}.`)

        console.log(`🎉 [Server] FULLY OPERATIONAL in ${elapsed(startupStart)}.`)
        isReady = true
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error('Background initialization failed')
        console.error('❌ [Server] Background Initialization Failed:', error)
        initError = error

        // CRITICAL FIX: Only set isReady=true if app.prepare() actually finished
        if (isNextPrepared) {
          console.log(
            '⚠️ [Server] Next.js is prepared. Proceeding with partial readiness (Socket.io or Env may be degraded)'
          )
          isReady = true
        } else {
          console.error('❌ [Server] Next.js failed to prepare. Cannot serve UI traffic.')
          isReady = false
        }
      }

      // Await background schema fixes for logging, but do not let them change readiness.
      await schemaFixPromise
    }

    initialize()
  })
