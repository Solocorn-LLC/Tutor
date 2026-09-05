import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { GET } from './route'

describe('/api/public/test-kimi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete process.env.ALLOW_PUBLIC_TEST_ENDPOINTS
    delete process.env.KIMI_API_KEY
  })

  it('returns 404 in production when not explicitly enabled', async () => {
    process.env.NODE_ENV = 'production'
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it('returns 500 in development when key is missing', async () => {
    process.env.NODE_ENV = 'development'
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.message).toBe('KIMI_API_KEY not configured')
  })

  it('returns success when API responds', async () => {
    process.env.NODE_ENV = 'development'
    process.env.KIMI_API_KEY = 'test-key'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: 'kimi-k3',
          choices: [{ message: { content: 'ok' } }],
          usage: { total_tokens: 10 },
        }),
      })
    )

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('success')
    expect(body.response).toBe('ok')
  })
})
