import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Gemini was removed — the orchestrator uses Kimi only. Mock the Kimi layer so we
// can assert success/error handling without real API calls.
const generateWithKimi = vi.fn()
const chatWithKimi = vi.fn()

vi.mock('@/lib/ai/kimi', () => ({
  generateWithKimi: (...args: unknown[]) => generateWithKimi(...args),
  chatWithKimi: (...args: unknown[]) => chatWithKimi(...args),
}))
vi.mock('@/lib/adk-client', () => ({ adkGenerate: vi.fn(), adkChat: vi.fn() }))
vi.mock('@/lib/db', () => ({ cache: { get: vi.fn(async () => null), set: vi.fn(async () => {}) } }))

import { generateWithFallback, chatWithFallback, getAIProvidersStatus } from '@/lib/agents'

describe('orchestrator (Kimi-only)', () => {
  const env = { ...process.env }
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.KIMI_API_KEY = 'k-key'
    delete process.env.ADK_BASE_URL
    delete process.env.MOCK_AI
  })
  afterEach(() => {
    process.env = { ...env }
  })

  it('generates via Kimi', async () => {
    generateWithKimi.mockResolvedValue('kimi-says-hi')
    const r = await generateWithFallback('hi', { skipCache: true })
    expect(r.content).toBe('kimi-says-hi')
    expect(r.provider).toBe('kimi')
  })

  it('surfaces the real upstream error when Kimi fails (not a misleading message)', async () => {
    generateWithKimi.mockRejectedValue(new Error('Kimi API error: 429 - quota exceeded'))
    await expect(generateWithFallback('x', { skipCache: true })).rejects.toThrow(/429|quota/)
    await expect(generateWithFallback('x', { skipCache: true })).rejects.not.toThrow(
      /No AI provider configured/
    )
  })

  it('errors clearly when KIMI_API_KEY is missing', async () => {
    delete process.env.KIMI_API_KEY
    generateWithKimi.mockRejectedValue(new Error('KIMI_API_KEY not configured'))
    await expect(generateWithFallback('x', { skipCache: true })).rejects.toThrow(/KIMI_API_KEY/)
  })

  it('chat goes via Kimi', async () => {
    chatWithKimi.mockResolvedValue('kimi-chat')
    const r = await chatWithFallback([{ role: 'user', content: 'hi' }], { skipCache: true })
    expect(r.content).toBe('kimi-chat')
    expect(r.provider).toBe('kimi')
  })

  it('provider status lists Kimi only', async () => {
    const s = await getAIProvidersStatus()
    expect(s.map(p => p.name)).toEqual(['kimi'])
  })
})
