import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  withRateLimitPreset: vi.fn(),
  handleApiError: vi.fn(),
  getServerSession: vi.fn(),
  getSessionForRealm: vi.fn(),
  adkPciMasterChat: vi.fn(),
  generateWithFallback: vi.fn(),
  sanitizeAiInput: vi.fn(),
  validateAiResponse: vi.fn(),
}))

vi.mock('@/lib/api/middleware', () => ({
  withRateLimitPreset: mocks.withRateLimitPreset,
  handleApiError: mocks.handleApiError,
}))

vi.mock('@/lib/auth', () => ({
  getServerSession: mocks.getServerSession,
  getSessionForRealm: mocks.getSessionForRealm,
  authOptions: {},
}))

vi.mock('@/lib/adk-client', () => ({
  adkPciMasterChat: mocks.adkPciMasterChat,
}))

vi.mock('@/lib/agents', () => ({
  generateWithFallback: mocks.generateWithFallback,
}))

vi.mock('@/lib/security/ai-sanitization', () => ({
  AISecurityManager: {
    sanitizeAiInput: mocks.sanitizeAiInput,
    validateAiResponse: mocks.validateAiResponse,
  },
}))

import { POST } from './route'

describe('/api/ai/pci-master', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ADK_BASE_URL = 'http://adk.example'
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as typeof fetch
    mocks.withRateLimitPreset.mockResolvedValue({ response: null })
    mocks.sanitizeAiInput.mockImplementation((msg: string) => msg)
    mocks.validateAiResponse.mockResolvedValue({ isValid: true, issues: [], severity: 'LOW' })
    mocks.adkPciMasterChat.mockResolvedValue({
      response: 'ok',
      conversationId: 'c1',
      parsed: null,
    })
    mocks.generateWithFallback.mockResolvedValue({
      content: 'fallback',
      provider: 'kimi',
      latencyMs: 10,
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('uses tutor realm session when available', async () => {
    mocks.getSessionForRealm.mockResolvedValue({ user: { id: 'tutor-1' } })
    mocks.getServerSession.mockResolvedValue(null)

    const req = new Request('http://localhost/api/ai/pci-master', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    })

    const res = await POST(req as unknown as NextRequest)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.adkPciMasterChat).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'tutor-1', message: 'hello' })
    )
    expect(data.response).toBe('ok')
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.getSessionForRealm.mockResolvedValue(null)
    mocks.getServerSession.mockResolvedValue(null)

    const req = new Request('http://localhost/api/ai/pci-master', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    })

    const res = await POST(req as unknown as NextRequest)
    expect(res.status).toBe(401)
  })

  const postBody = async (body: Record<string, unknown>) => {
    const req = new Request('http://localhost/api/ai/pci-master', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return POST(req as unknown as NextRequest)
  }

  it('task domain: extracts {reply,pci} — chat shows reply, pciDraft holds the finalized rubric', async () => {
    mocks.getSessionForRealm.mockResolvedValue({ user: { id: 'tutor-1' } })
    mocks.adkPciMasterChat.mockResolvedValue({
      response: '{"reply":"What counts as a correct answer?","pci":"FINAL RUBRIC TEXT"}',
      conversationId: 'c1',
      parsed: null,
    })

    const res = await postBody({ message: 'help', context: { type: 'task' } })
    const data = await res.json()

    expect(res.status).toBe(200)
    // chat shows only the conversational reply — never the raw JSON envelope
    expect(data.response).toBe('What counts as a correct answer?')
    expect(data.response).not.toContain('{')
    expect(data.pciDraft).toBe('FINAL RUBRIC TEXT')
  })

  it('task domain: empty pci until finalized (no draft surfaced)', async () => {
    mocks.getSessionForRealm.mockResolvedValue({ user: { id: 'tutor-1' } })
    mocks.adkPciMasterChat.mockResolvedValue({
      response: '{"reply":"Here is the summary, is it right?","pci":""}',
      conversationId: 'c1',
      parsed: null,
    })

    const res = await postBody({ message: 'summarize', context: { type: 'task' } })
    const data = await res.json()

    expect(data.response).toBe('Here is the summary, is it right?')
    expect(data.pciDraft).toBe('')
  })

  it('task domain: falls back gracefully when the model ignores the envelope', async () => {
    mocks.getSessionForRealm.mockResolvedValue({ user: { id: 'tutor-1' } })
    mocks.adkPciMasterChat.mockResolvedValue({
      response: 'Just plain prose, no JSON at all.',
      conversationId: 'c1',
      parsed: null,
    })

    const res = await postBody({ message: 'hi', context: { type: 'task' } })
    const data = await res.json()

    expect(data.response).toBe('Just plain prose, no JSON at all.')
    expect(data.pciDraft).toBe('')
  })

  it('non-guardrail domain: no pciDraft extraction', async () => {
    mocks.getSessionForRealm.mockResolvedValue({ user: { id: 'tutor-1' } })
    mocks.adkPciMasterChat.mockResolvedValue({
      response: 'ok',
      conversationId: 'c1',
      parsed: null,
    })

    const res = await postBody({ message: 'hi' }) // no context.type
    const data = await res.json()

    expect(data.response).toBe('ok')
    expect(data.pciDraft).toBe('')
  })
})
