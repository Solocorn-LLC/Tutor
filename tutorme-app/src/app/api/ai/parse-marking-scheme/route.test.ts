import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// Mocked dependencies — everything EXCEPT the real Zod validation and the real
// scheme-response/marking-scheme parsing, so the test exercises the route's wiring
// end-to-end with a stubbed AI response.
const mocks = vi.hoisted(() => ({
  withRateLimitPreset: vi.fn(),
  handleApiError: vi.fn(),
  getServerSession: vi.fn(),
  getSessionForRealm: vi.fn(),
  validateAiResponse: vi.fn(),
  generateWithKimi: vi.fn(),
  generateWithKimiVision: vi.fn(),
  runAssessmentGuardrails: vi.fn(),
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
vi.mock('@/lib/security/ai-sanitization', () => ({
  AISecurityManager: { validateAiResponse: mocks.validateAiResponse },
}))
vi.mock('@/lib/ai/kimi', () => ({
  generateWithKimi: mocks.generateWithKimi,
  generateWithKimiVision: mocks.generateWithKimiVision,
}))
vi.mock('@/lib/ai/guardrails', () => ({
  GUARDRAILED_TEMPERATURE: 0.2,
  guardrailSystemPrompt: () => 'SYSTEM',
  runAssessmentGuardrails: mocks.runAssessmentGuardrails,
}))

import { POST } from './route'

function makeReq(body: unknown): NextRequest {
  return new Request('http://localhost/api/ai/parse-marking-scheme', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

const longText = 'Marking scheme. '.repeat(40) // > 200 chars → text path

const baseBody = {
  content: longText,
  questions: [
    { ref: '1(a)', label: 'Q1a' },
    { ref: '1(b)', label: 'Q1b' },
    { ref: '2', label: 'Q2' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.withRateLimitPreset.mockResolvedValue({ response: null })
  mocks.getSessionForRealm.mockResolvedValue({ user: { id: 'tutor-1' } })
  mocks.getServerSession.mockResolvedValue(null)
  mocks.validateAiResponse.mockResolvedValue({ isValid: true, severity: 'LOW' })
  mocks.runAssessmentGuardrails.mockReturnValue({ violations: [] })
})

describe('POST /api/ai/parse-marking-scheme', () => {
  it('returns matches (canonical ref), flags extras, and passes detection through', async () => {
    mocks.generateWithKimi.mockResolvedValue(
      JSON.stringify({
        examBody: 'AP',
        subject: 'Calculus AB',
        matches: [
          { ref: '1 (a)', answer: 'Paris' }, // known → canonical "1(a)"
          { ref: '3(c)', answer: 'New' }, // not in DMI → extra
        ],
      })
    )
    const res = await POST(makeReq(baseBody))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.matched).toBe(2)
    expect(data.total).toBe(3)
    expect(data.detectedExamBody).toBe('AP')
    expect(data.detectedSubject).toBe('Calculus AB')
    expect(data.matches.find((m: { ref: string }) => m.ref === '1(a)').answer).toBe('Paris')
    expect(data.matches.find((m: { ref: string }) => m.ref === '3(c)').extra).toBe(true)
  })

  it('forwards the board + PCI hint into the model prompt', async () => {
    mocks.generateWithKimi.mockResolvedValue(JSON.stringify({ matches: [] }))
    await POST(makeReq({ ...baseBody, examBody: 'IB', pci: 'award method marks' }))
    const prompt = mocks.generateWithKimi.mock.calls[0][0] as string
    expect(prompt).toContain('IB')
    expect(prompt).toContain('award method marks')
  })

  it('rejects an invalid body (no questions) with 400', async () => {
    const res = await POST(makeReq({ content: longText }))
    expect(res.status).toBe(400)
  })

  it('rejects when neither content nor pages are provided', async () => {
    const res = await POST(makeReq({ questions: baseBody.questions }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when not authenticated', async () => {
    mocks.getSessionForRealm.mockResolvedValue(null)
    mocks.getServerSession.mockResolvedValue(null)
    const res = await POST(makeReq(baseBody))
    expect(res.status).toBe(401)
  })

  it('maps an AI timeout (AbortError) to a clear 504', async () => {
    mocks.generateWithKimi.mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' })
    )
    const res = await POST(makeReq(baseBody))
    expect(res.status).toBe(504)
    const data = await res.json()
    expect(String(data.error)).toMatch(/too long/i)
  })
})
