import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// Mock the route's collaborators; the grading engine itself is unit-tested
// separately (pci-grader.test.ts), so here we stub it and assert the wiring:
// rate-limit → auth → role → CSRF → body → basis mapping → response shape.
const mocks = vi.hoisted(() => ({
  withRateLimitPreset: vi.fn(),
  requireCsrf: vi.fn(),
  handleApiError: vi.fn(),
  getServerSession: vi.fn(),
  gradeAnswerAgainstBasis: vi.fn(),
  renderGradingSpec: vi.fn(),
  generateWithKimi: vi.fn(),
  sanitizeAiInput: vi.fn((x: string) => x),
  validateAiResponse: vi.fn(() => Promise.resolve({ isValid: true, issues: [], severity: 'LOW' })),
}))

vi.mock('@/lib/api/middleware', () => ({
  withRateLimitPreset: mocks.withRateLimitPreset,
  requireCsrf: mocks.requireCsrf,
  handleApiError: mocks.handleApiError,
}))
vi.mock('@/lib/auth', () => ({
  getServerSession: mocks.getServerSession,
  authOptions: {},
}))
vi.mock('@/lib/grading/pci-grader', () => ({
  gradeAnswerAgainstBasis: mocks.gradeAnswerAgainstBasis,
  renderGradingSpec: mocks.renderGradingSpec,
}))
vi.mock('@/lib/ai/kimi', () => ({
  generateWithKimi: mocks.generateWithKimi,
}))
vi.mock('@/lib/security/ai-sanitization', () => ({
  AISecurityManager: {
    sanitizeAiInput: mocks.sanitizeAiInput,
    validateAiResponse: mocks.validateAiResponse,
  },
}))

import { POST } from './route'

function makeReq(body: unknown): NextRequest {
  return new Request('http://localhost/api/tutor/test-grade', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

const okResult = {
  hasBasis: true,
  aiUnavailable: false,
  score: 80,
  feedback: 'Good method.',
  pciNote: 'Per your PCI, method marks.',
  guardrailViolations: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.withRateLimitPreset.mockResolvedValue({ response: null })
  mocks.requireCsrf.mockResolvedValue(null)
  mocks.getServerSession.mockResolvedValue({ user: { id: 'tutor-1', role: 'TUTOR' } })
  mocks.renderGradingSpec.mockReturnValue('')
  mocks.gradeAnswerAgainstBasis.mockResolvedValue(okResult)
  mocks.generateWithKimi.mockResolvedValue('Because the PCI says so.')
  mocks.sanitizeAiInput.mockImplementation((x: string) => x)
  mocks.validateAiResponse.mockResolvedValue({ isValid: true, issues: [], severity: 'LOW' })
  mocks.handleApiError.mockReturnValue(new Response('err', { status: 500 }))
})

describe('POST /api/tutor/test-grade', () => {
  it('rejects unauthenticated requests', async () => {
    mocks.getServerSession.mockResolvedValue(null)
    const res = await POST(makeReq({ answer: 'x', modelAnswer: '42' }))
    expect(res.status).toBe(401)
    expect(mocks.gradeAnswerAgainstBasis).not.toHaveBeenCalled()
  })

  it('rejects non-tutor roles', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 's1', role: 'STUDENT' } })
    const res = await POST(makeReq({ answer: 'x', modelAnswer: '42' }))
    expect(res.status).toBe(403)
    expect(mocks.gradeAnswerAgainstBasis).not.toHaveBeenCalled()
  })

  it('returns the rate-limit response when throttled', async () => {
    mocks.withRateLimitPreset.mockResolvedValue({ response: new Response('slow', { status: 429 }) })
    const res = await POST(makeReq({ answer: 'x', modelAnswer: '42' }))
    expect(res.status).toBe(429)
    expect(mocks.getServerSession).not.toHaveBeenCalled()
  })

  it('returns the CSRF error when the token is bad', async () => {
    mocks.requireCsrf.mockResolvedValue(new Response('csrf', { status: 403 }))
    const res = await POST(makeReq({ answer: 'x', modelAnswer: '42' }))
    expect(res.status).toBe(403)
    expect(mocks.gradeAnswerAgainstBasis).not.toHaveBeenCalled()
  })

  it('requires a non-empty answer', async () => {
    const res = await POST(makeReq({ modelAnswer: '42' }))
    expect(res.status).toBe(400)
    expect(mocks.gradeAnswerAgainstBasis).not.toHaveBeenCalled()
  })

  it('maps the request into the grading basis and returns the result', async () => {
    const res = await POST(
      makeReq({
        pci: 'award method marks',
        pciSpec: { evaluationLogic: 'x' },
        rubric: 'the rubric',
        modelAnswer: '42',
        questionText: 'What is 6 x 7?',
        responseType: 'numeric',
        sourceDependencies: ['Table 1'],
        answer: '40',
      })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.score).toBe(80)
    expect(json.feedback).toBe('Good method.')
    expect(json.pciNote).toBe('Per your PCI, method marks.')

    // renderGradingSpec is used to turn the structured spec into text.
    expect(mocks.renderGradingSpec).toHaveBeenCalledWith({ evaluationLogic: 'x' })
    // The engine receives the full basis, not just the PCI.
    const arg = mocks.gradeAnswerAgainstBasis.mock.calls[0][0]
    expect(arg).toMatchObject({
      pci: 'award method marks',
      rubric: 'the rubric',
      modelAnswer: '42',
      questionText: 'What is 6 x 7?',
      responseType: 'numeric',
      sourceDependencies: ['Table 1'],
      studentAnswer: '40',
    })
  })

  it('surfaces guardrail warnings from the engine', async () => {
    mocks.gradeAnswerAgainstBasis.mockResolvedValue({
      ...okResult,
      guardrailViolations: [{ ruleId: 'TASK-10', severity: 'warning', message: 'fabricated' }],
    })
    const res = await POST(makeReq({ answer: '40', modelAnswer: '42' }))
    const json = await res.json()
    expect(json.guardrailWarnings).toEqual([
      { ruleId: 'TASK-10', severity: 'warning', message: 'fabricated' },
    ])
  })

  describe('task chat follow-up (ask branch)', () => {
    it('returns a generated answer grounded in PCI, task and history', async () => {
      const res = await POST(
        makeReq({
          pci: 'award method marks',
          questionText: 'What is 6 x 7?',
          question: 'Why did I lose marks?',
          history: [
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'hi there' },
          ],
        })
      )
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.mode).toBe('ask')
      expect(json.answer).toBe('Because the PCI says so.')

      // Sanitization is applied to untrusted inputs.
      expect(mocks.sanitizeAiInput).toHaveBeenCalledWith('Why did I lose marks?')
      expect(mocks.sanitizeAiInput).toHaveBeenCalledWith('hello')
      expect(mocks.sanitizeAiInput).toHaveBeenCalledWith('hi there')

      // Output validation runs on the generated answer.
      expect(mocks.validateAiResponse).toHaveBeenCalledWith('Because the PCI says so.')

      // The prompt contains all grounding context.
      const prompt = mocks.generateWithKimi.mock.calls[0][0]
      expect(prompt).toContain('award method marks')
      expect(prompt).toContain('What is 6 x 7?')
      expect(prompt).toContain('Why did I lose marks?')
    })

    it('rejects an empty sanitized question', async () => {
      mocks.sanitizeAiInput.mockReturnValue('')
      const res = await POST(
        makeReq({
          pci: 'award method marks',
          questionText: 'What is 6 x 7?',
          question: '<script>alert(1)</script>',
        })
      )
      expect(res.status).toBe(400)
      expect(mocks.generateWithKimi).not.toHaveBeenCalled()
    })

    it('returns 502 when the model returns an empty answer', async () => {
      mocks.generateWithKimi.mockResolvedValue('   ')
      const res = await POST(
        makeReq({
          pci: 'award method marks',
          questionText: 'What is 6 x 7?',
          question: 'Why?',
        })
      )
      expect(res.status).toBe(502)
      const json = await res.json()
      expect(json.error).toBe('Could not generate an answer.')
    })

    it('returns 502 when the generated response fails safety validation', async () => {
      mocks.validateAiResponse.mockResolvedValue({
        isValid: false,
        issues: ['AI response contains inappropriate or harmful content'],
        severity: 'CRITICAL',
      })
      const res = await POST(
        makeReq({
          pci: 'award method marks',
          questionText: 'What is 6 x 7?',
          question: 'Why?',
        })
      )
      expect(res.status).toBe(502)
      const json = await res.json()
      expect(json.error).toBe('The generated response failed safety checks.')
    })

    it('returns a friendly message when no PCI is set', async () => {
      const res = await POST(
        makeReq({
          questionText: 'What is 6 x 7?',
          question: 'Why?',
        })
      )
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.answer).toContain("There's no marking policy set for this task")
      expect(mocks.generateWithKimi).not.toHaveBeenCalled()
    })
  })
})
