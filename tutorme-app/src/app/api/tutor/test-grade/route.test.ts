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
})
