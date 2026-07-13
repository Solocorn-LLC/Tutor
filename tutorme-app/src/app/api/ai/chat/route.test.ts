import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  withRateLimitPreset: vi.fn(),
  handleApiError: vi.fn(),
  getServerSession: vi.fn(),
  runTutorChat: vi.fn(),
  runTutorAssistChat: vi.fn(),
  hasActiveAssessment: vi.fn(),
  sanitizeAiInput: vi.fn(),
  validateAiResponse: vi.fn(),
}))

vi.mock('@/lib/api/middleware', () => ({
  withRateLimitPreset: mocks.withRateLimitPreset,
  handleApiError: mocks.handleApiError,
}))
vi.mock('@/lib/auth', () => ({ getServerSession: mocks.getServerSession, authOptions: {} }))
vi.mock('@/lib/agents/tutor-chat-service', () => ({ runTutorChat: mocks.runTutorChat }))
vi.mock('@/lib/agents/tutor-assist-service', () => ({
  runTutorAssistChat: mocks.runTutorAssistChat,
}))
vi.mock('@/lib/assessment/active-assessment', () => ({
  hasActiveAssessment: mocks.hasActiveAssessment,
}))
vi.mock('@/lib/security/ai-sanitization', () => ({
  AISecurityManager: {
    sanitizeAiInput: mocks.sanitizeAiInput,
    validateAiResponse: mocks.validateAiResponse,
  },
}))

import { POST } from './route'

describe('/api/ai/chat — assistant routing + gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.withRateLimitPreset.mockResolvedValue({ response: null })
    mocks.sanitizeAiInput.mockImplementation((m: string) => m)
    mocks.validateAiResponse.mockResolvedValue({ isValid: true, severity: 'LOW' })
    mocks.hasActiveAssessment.mockResolvedValue(false)
    mocks.runTutorChat.mockResolvedValue({ response: 'socratic', provider: 'kimi', latencyMs: 1 })
    mocks.runTutorAssistChat.mockResolvedValue({
      response: 'direct',
      provider: 'kimi',
      latencyMs: 1,
    })
  })

  const post = (body: Record<string, unknown>) => {
    const req = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return POST(req as unknown as NextRequest)
  }

  it('defaults to the student Socratic tutor (no assistant param)', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 's1', role: 'STUDENT' } })
    const res = await post({ message: 'help me learn' })
    expect(res.status).toBe(200)
    expect(mocks.runTutorChat).toHaveBeenCalledTimes(1)
    expect(mocks.runTutorAssistChat).not.toHaveBeenCalled()
  })

  it('routes a TUTOR + tutor_assist to the DIRECT assistant', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 't1', role: 'TUTOR' } })
    const res = await post({ message: 'draft 3 poll questions as JSON', assistant: 'tutor_assist' })
    const data = await res.json()
    expect(mocks.runTutorAssistChat).toHaveBeenCalledTimes(1)
    expect(mocks.runTutorChat).not.toHaveBeenCalled()
    expect(data.response).toBe('direct')
  })

  it('GATE: a STUDENT requesting tutor_assist falls back to the Socratic tutor', async () => {
    // A student must never reach the direct-answer path — it would bypass the
    // Socratic pedagogy and the ASMT-15 assessment-integrity guardrail.
    mocks.getServerSession.mockResolvedValue({ user: { id: 's1', role: 'STUDENT' } })
    await post({ message: 'just give me the answer', assistant: 'tutor_assist' })
    expect(mocks.runTutorAssistChat).not.toHaveBeenCalled()
    expect(mocks.runTutorChat).toHaveBeenCalledTimes(1)
  })
})
