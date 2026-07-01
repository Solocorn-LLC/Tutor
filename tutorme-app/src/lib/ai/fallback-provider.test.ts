import { describe, it, expect, vi, afterEach } from 'vitest'
import { getFallbackProviderConfig, generateWithFallbackProvider } from './fallback-provider'

const CFG = { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' }

describe('fallback-provider', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
    vi.restoreAllMocks()
  })

  it('getFallbackProviderConfig requires all three vars', () => {
    delete process.env.FALLBACK_AI_BASE_URL
    delete process.env.FALLBACK_AI_API_KEY
    delete process.env.FALLBACK_AI_MODEL
    expect(getFallbackProviderConfig()).toBeNull()
    process.env.FALLBACK_AI_BASE_URL = 'https://x/v1'
    process.env.FALLBACK_AI_API_KEY = 'k'
    expect(getFallbackProviderConfig()).toBeNull() // model missing
    process.env.FALLBACK_AI_MODEL = 'm'
    expect(getFallbackProviderConfig()).toEqual(CFG)
  })

  it('strips a trailing slash from the base url', () => {
    process.env.FALLBACK_AI_BASE_URL = 'https://x/v1/'
    process.env.FALLBACK_AI_API_KEY = 'k'
    process.env.FALLBACK_AI_MODEL = 'm'
    expect(getFallbackProviderConfig()?.baseUrl).toBe('https://x/v1')
  })

  it('posts an OpenAI-compatible chat request and returns the content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'HELLO' } }] }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const out = await generateWithFallbackProvider('hi', CFG, { systemPrompt: 'sys' })
    expect(out).toBe('HELLO')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://x/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('m')
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ])
  })

  it('throws on a non-ok response', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'boom',
      }) as unknown as typeof fetch
    await expect(generateWithFallbackProvider('hi', CFG, { retries: 0 })).rejects.toThrow(
      /Fallback provider error: 500/
    )
  })
})
