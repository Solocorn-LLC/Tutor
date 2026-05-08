import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { createApp as createAppType } from './index.js'

const originalEnv = { ...process.env }
let createApp: typeof createAppType

type MockResponse = {
  statusCode: number
  headers: Record<string, string | string[]>
  body?: unknown
}

type InvokeOptions = {
  method: string
  url: string
  headers?: Record<string, string>
}

async function invoke(app: ReturnType<typeof createApp>, options: InvokeOptions): Promise<MockResponse> {
  const req = new EventEmitter() as any
  req.method = options.method
  req.url = options.url
  req.headers = Object.fromEntries(
    Object.entries(options.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
  )

  const res = new EventEmitter() as any
  res.statusCode = 200
  res.headers = {} as Record<string, string | string[]>
  res.setHeader = (name: string, value: string | string[]) => {
    res.headers[name.toLowerCase()] = value
  }
  res.getHeader = (name: string) => res.headers[name.toLowerCase()]
  res.writeHead = (status: number, headers?: Record<string, string | string[]>) => {
    res.statusCode = status
    if (headers) {
      Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value))
    }
    return res
  }
  res.status = (status: number) => {
    res.statusCode = status
    return res
  }
  res.json = (payload: unknown) => {
    res.setHeader('content-type', 'application/json')
    res.body = payload
    res.end(JSON.stringify(payload))
    return res
  }
  res.send = (payload: unknown) => {
    res.body = payload
    res.end(payload)
    return res
  }
  res.end = (payload?: unknown) => {
    if (payload !== undefined && res.body === undefined) {
      res.body = payload
    }
    res.emit('finish')
  }

  await new Promise<void>((resolve, reject) => {
    res.once('finish', resolve)
    try {
      ;(app as unknown as (req: unknown, res: unknown) => void)(req, res)
    } catch (error) {
      reject(error)
    }
  })

  const contentType = res.getHeader('content-type')
  if (typeof res.body === 'string' && contentType?.toString().includes('application/json')) {
    try {
      res.body = JSON.parse(res.body)
    } catch {
      // ignore parse errors for non-JSON responses
    }
  }

  return {
    statusCode: res.statusCode,
    headers: res.headers,
    body: res.body,
  }
}

beforeEach(async () => {
  process.env = { ...originalEnv }
  process.env.NODE_ENV = 'test'
  process.env.ADK_DISABLE_LISTEN = 'true'
  const mod = await import('./index.js')
  createApp = mod.createApp
})

afterEach(() => {
  process.env = { ...originalEnv }
})

test('rejects unauthenticated requests when auth is configured', async () => {
  process.env.ADK_AUTH_TOKEN = 'test-token'
  const app = createApp()
  const res = await invoke(app, { method: 'GET', url: '/v1/status' })
  assert.equal(res.statusCode, 401)
})

test('allows requests with valid bearer token', async () => {
  process.env.ADK_AUTH_TOKEN = 'test-token'
  const app = createApp()
  const res = await invoke(app, {
    method: 'GET',
    url: '/v1/status',
    headers: { authorization: 'Bearer test-token' },
  })

  assert.equal(res.statusCode, 200)
  assert.equal((res.body as { provider?: string })?.provider, 'kimi')
})

test('sets CORS headers for allowed origins', async () => {
  process.env.ADK_AUTH_TOKEN = 'test-token'
  process.env.ADK_ALLOWED_ORIGINS = 'https://allowed.example'
  const app = createApp()
  const res = await invoke(app, {
    method: 'GET',
    url: '/v1/status',
    headers: {
      origin: 'https://allowed.example',
      authorization: 'Bearer test-token',
    },
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['access-control-allow-origin'], 'https://allowed.example')
})

test('blocks disallowed origins', async () => {
  process.env.ADK_AUTH_TOKEN = 'test-token'
  process.env.ADK_ALLOWED_ORIGINS = 'https://allowed.example'
  const app = createApp()
  const res = await invoke(app, {
    method: 'GET',
    url: '/v1/status',
    headers: {
      origin: 'https://blocked.example',
      authorization: 'Bearer test-token',
    },
  })
  assert.equal(res.statusCode, 403)
})

test('requires auth for /health in production unless public', async () => {
  process.env.NODE_ENV = 'production'
  process.env.ADK_AUTH_TOKEN = 'test-token'
  const app = createApp()
  const res = await invoke(app, { method: 'GET', url: '/health' })
  assert.equal(res.statusCode, 401)
})

test('allows public /health when configured', async () => {
  process.env.NODE_ENV = 'production'
  process.env.ADK_PUBLIC_HEALTH = 'true'
  process.env.ADK_AUTH_TOKEN = 'test-token'
  const app = createApp()
  const res = await invoke(app, { method: 'GET', url: '/health' })
  assert.equal(res.statusCode, 200)
})
