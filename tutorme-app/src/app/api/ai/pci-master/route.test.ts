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
    delete process.env.AGENT_KIT_PCI_MASTER
    delete process.env.KIMI_API_KEY
  })

  it('uses tutor realm session when available', async () => {
    mocks.getSessionForRealm.mockResolvedValue({ user: { id: 'tutor-1', role: 'TUTOR' } })
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

  it('task domain: extracts {reply,pci,spec} — reply, finalized rubric, and structured spec (on approval)', async () => {
    mocks.getSessionForRealm.mockResolvedValue({ user: { id: 'tutor-1', role: 'TUTOR' } })
    mocks.adkPciMasterChat.mockResolvedValue({
      response:
        '{"reply":"What counts as a correct answer?","pci":"FINAL RUBRIC TEXT","spec":{"evaluationLogic":"Exact match","retryPolicy":"unspecified","instructionalTone":"Encouraging"}}',
      conversationId: 'c1',
      parsed: null,
    })

    // The tutor's message signals approval, so the finalized rubric surfaces.
    const res = await postBody({ message: 'looks good, finalize it', context: { type: 'task' } })
    const data = await res.json()

    expect(res.status).toBe(200)
    // chat shows only the conversational reply — never the raw JSON envelope
    expect(data.response).toBe('What counts as a correct answer?')
    expect(data.response).not.toContain('{')
    expect(data.pciDraft).toBe('FINAL RUBRIC TEXT')
    // TASK-6: structured spec, with the fabricated "unspecified" field dropped.
    expect(data.pciSpec).toEqual({
      evaluationLogic: 'Exact match',
      instructionalTone: 'Encouraging',
    })
  })

  it('task domain: offers the rubric but flags it unconfirmed until the tutor applies (TASK-5)', async () => {
    mocks.getSessionForRealm.mockResolvedValue({ user: { id: 'tutor-1', role: 'TUTOR' } })
    mocks.adkPciMasterChat.mockResolvedValue({
      response: '{"reply":"Here is the finalized rubric.","pci":"FINAL RUBRIC TEXT"}',
      conversationId: 'c1',
      parsed: null,
    })

    // No approval phrase this turn → the rubric is still OFFERED so the Apply
    // button appears, but flagged unconfirmed. The tutor's Apply click is the
    // explicit TASK-5 confirmation; nothing auto-applies.
    const res = await postBody({ message: 'what do you think?', context: { type: 'task' } })
    const data = await res.json()

    expect(data.pciDraft).toBe('FINAL RUBRIC TEXT')
    expect(data.pciUnconfirmed).toBe(true)
  })

  it('task domain: empty pci until finalized (no draft surfaced)', async () => {
    mocks.getSessionForRealm.mockResolvedValue({ user: { id: 'tutor-1', role: 'TUTOR' } })
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
    mocks.getSessionForRealm.mockResolvedValue({ user: { id: 'tutor-1', role: 'TUTOR' } })
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

  it('flag ON: routes local generation through the agent-kit runner, preserving skipCache/timeout/retries + guardrails', async () => {
    // Force the LOCAL path (no ADK) with a local provider available, flag ON.
    process.env.AGENT_KIT_PCI_MASTER = 'true'
    delete process.env.ADK_BASE_URL
    process.env.KIMI_API_KEY = 'test-key'
    mocks.getSessionForRealm.mockResolvedValue({ user: { id: 'tutor-1', role: 'TUTOR' } })
    mocks.generateWithFallback.mockResolvedValue({
      content: '{"reply":"What makes an answer correct?","pci":""}',
      provider: 'kimi',
      latencyMs: 5,
    })

    const res = await postBody({ message: 'set marks', context: { type: 'task' } })
    const data = await res.json()

    expect(res.status).toBe(200)
    // generation went through the kit's injected generate → generateWithFallback
    expect(mocks.generateWithFallback).toHaveBeenCalledTimes(1)
    const [prompt, opts] = mocks.generateWithFallback.mock.calls[0]
    // the retry/cache budget is preserved (the default adapter would drop these)
    expect(opts).toMatchObject({
      skipCache: true,
      timeoutMs: expect.any(Number),
      retries: expect.any(Number),
    })
    // user input is injection-fenced, and the task guardrail prompt is applied
    expect(prompt).toContain('<user_input>')
    // downstream envelope extraction still runs on the kit's output
    expect(data.response).toBe('What makes an answer correct?')
    expect(data.pciDraft).toBe('')
  })

  it('forwards tiered task context (course, lesson, extracted PDF text) into the LLM prompt', async () => {
    // Force the local text-generation path (no ADK).
    delete process.env.ADK_BASE_URL
    process.env.KIMI_API_KEY = 'test-key'
    mocks.getSessionForRealm.mockResolvedValue({ user: { id: 'tutor-1', role: 'TUTOR' } })
    mocks.generateWithFallback.mockResolvedValue({
      content: '{"reply":"I cannot read the attached PDF. Please paste or describe it.","pci":""}',
      provider: 'kimi',
      latencyMs: 5,
    })

    const res = await postBody({
      message: 'set up the marking policy',
      context: {
        type: 'task',
        courseContext: 'Course: Algebra 101\nNode 1: Linear equations',
        lessonContext: 'Lesson: Solving linear equations\nContent 1: introduction text',
        sourceDocument: {
          fileName: 'Lesson Demo 1.pdf',
          mimeType: 'application/pdf',
          extractedText: 'This document is actually about quadratic equations.',
        },
      },
    })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.generateWithFallback).toHaveBeenCalledTimes(1)
    const [prompt] = mocks.generateWithFallback.mock.calls[0] as [string, unknown]
    expect(prompt).toContain('Course Context:')
    expect(prompt).toContain('Lesson Context:')
    expect(prompt).toContain('Attached Document Extracted Text:')
    expect(prompt).toContain('This document is actually about quadratic equations.')
    expect(data.response).toBe('I cannot read the attached PDF. Please paste or describe it.')
    expect(data.pciDraft).toBe('')
  })

  it('non-guardrail domain: no pciDraft extraction', async () => {
    mocks.getSessionForRealm.mockResolvedValue({ user: { id: 'tutor-1', role: 'TUTOR' } })
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
