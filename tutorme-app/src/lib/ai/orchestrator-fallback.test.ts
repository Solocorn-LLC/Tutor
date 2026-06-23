import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the provider layer so we can simulate one provider failing (e.g. a Gemini
// 429 quota error) and assert the orchestrator falls back to the other.
const generateWithKimi = vi.fn()
const chatWithKimi = vi.fn()
const isGeminiActive = vi.fn(() => true)

vi.mock('@/lib/ai/kimi', () => ({
  generateWithKimi: (...args: unknown[]) => generateWithKimi(...args),
  chatWithKimi: (...args: unknown[]) => chatWithKimi(...args),
}))
vi.mock('@/lib/ai/provider', () => ({ isGeminiActive: () => isGeminiActive() }))
vi.mock('@/lib/adk-client', () => ({ adkGenerate: vi.fn(), adkChat: vi.fn() }))
vi.mock('@/lib/db', () => ({ cache: { get: vi.fn(async () => null), set: vi.fn(async () => {}) } }))

import { generateWithFallback, chatWithFallback } from '@/lib/agents'

describe('orchestrator cross-provider fallback', () => {
  const env = { ...process.env }
  beforeEach(() => {
    vi.clearAllMocks()
    isGeminiActive.mockReturnValue(true)
    process.env.GEMINI_API_KEY = 'g-key'
    process.env.KIMI_API_KEY = 'k-key'
    delete process.env.ADK_BASE_URL
    delete process.env.MOCK_AI
  })
  afterEach(() => {
    process.env = { ...env }
  })

  it('falls back to Kimi when the active provider (Gemini) hits a 429', async () => {
    generateWithKimi.mockImplementation(async (_p: string, opts: { forceProvider?: string }) => {
      if (opts.forceProvider === 'gemini') throw new Error('Gemini API error: 429 - quota exceeded')
      return 'kimi-says-hi'
    })

    const result = await generateWithFallback('summarize this', { skipCache: true })
    expect(result.content).toBe('kimi-says-hi')
    expect(result.provider).toBe('kimi')
    // Tried Gemini first, then Kimi.
    expect(generateWithKimi).toHaveBeenCalledTimes(2)
  })

  it('throws a truthful error (with the real upstream reason) when all providers fail', async () => {
    generateWithKimi.mockRejectedValue(new Error('Gemini API error: 429 - quota exceeded'))
    await expect(generateWithFallback('x', { skipCache: true })).rejects.toThrow(/429|quota/)
    // Not the misleading "No AI providers configured".
    await expect(generateWithFallback('x', { skipCache: true })).rejects.not.toThrow(
      /No AI providers configured/
    )
  })

  it('chat path falls back too', async () => {
    chatWithKimi.mockImplementation(async (_m: unknown, opts: { forceProvider?: string }) => {
      if (opts.forceProvider === 'gemini') throw new Error('503 unavailable')
      return 'kimi-chat'
    })
    const result = await chatWithFallback([{ role: 'user', content: 'hi' }], { skipCache: true })
    expect(result.content).toBe('kimi-chat')
    expect(result.provider).toBe('kimi')
  })

  it('only uses providers whose key is configured', async () => {
    delete process.env.KIMI_API_KEY // only Gemini configured
    generateWithKimi.mockResolvedValue('gemini-only')
    const result = await generateWithFallback('x', { skipCache: true })
    expect(result.provider).toBe('gemini')
    expect(generateWithKimi).toHaveBeenCalledTimes(1)
  })
})
