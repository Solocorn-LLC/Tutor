import { describe, it, expect, beforeEach, vi } from 'vitest'

// Only the model call is external; the marking-basis resolution, spec rendering,
// and guardrail scan are pure and run for real.
const mocks = vi.hoisted(() => ({
  generateWithKimi: vi.fn(),
  generateWithKimiVision: vi.fn(),
}))

vi.mock('@/lib/ai/kimi', () => ({
  generateWithKimi: mocks.generateWithKimi,
  generateWithKimiVision: mocks.generateWithKimiVision,
}))

import { gradeAnswerAgainstBasis } from './pci-grader'

describe('gradeAnswerAgainstBasis', () => {
  beforeEach(() => {
    mocks.generateWithKimi.mockReset()
  })

  it('refuses (no fabricated score) when there is no marking basis', async () => {
    const r = await gradeAnswerAgainstBasis({ studentAnswer: 'anything' })
    expect(r.hasBasis).toBe(false)
    expect(r.score).toBeNull()
    // Must not even call the model when there is nothing to grade against.
    expect(mocks.generateWithKimi).not.toHaveBeenCalled()
  })

  it('reports aiUnavailable when the model call throws — never a default score', async () => {
    mocks.generateWithKimi.mockRejectedValue(new Error('model down'))
    const r = await gradeAnswerAgainstBasis({ modelAnswer: '42', studentAnswer: '42' })
    expect(r.hasBasis).toBe(true)
    expect(r.aiUnavailable).toBe(true)
    expect(r.score).toBeNull()
  })

  it('returns score=null on an unparseable reply — never a fake 50%', async () => {
    mocks.generateWithKimi.mockResolvedValue('Looks good, nice working!')
    const r = await gradeAnswerAgainstBasis({ rubric: 'award method marks', studentAnswer: 'x' })
    expect(r.hasBasis).toBe(true)
    expect(r.aiUnavailable).toBe(false)
    expect(r.score).toBeNull()
  })

  it('parses a valid JSON grade and clamps to 0–100', async () => {
    mocks.generateWithKimi.mockResolvedValue(
      'Here you go: {"score": 140, "feedback": "Correct method.", "pciNote": "Per your PCI, awarded method marks."} done'
    )
    const r = await gradeAnswerAgainstBasis({
      pci: 'award method marks even if the final answer is wrong',
      modelAnswer: '42',
      studentAnswer: '40',
    })
    expect(r.score).toBe(100) // clamped from 140
    expect(r.feedback).toBe('Correct method.')
    expect(r.pciNote).toContain('method marks')
  })

  it('drops the tutor-only pciNote when no PCI was provided', async () => {
    mocks.generateWithKimi.mockResolvedValue('{"score": 60, "feedback": "ok", "pciNote": "leak"}')
    const r = await gradeAnswerAgainstBasis({ modelAnswer: '42', studentAnswer: '30' })
    expect(r.score).toBe(60)
    expect(r.pciNote).toBe('')
  })

  it('treats a structured PCI spec as a valid basis on its own', async () => {
    mocks.generateWithKimi.mockResolvedValue('{"score": 75, "feedback": "Partly right."}')
    const r = await gradeAnswerAgainstBasis({
      specText: 'Evaluation logic: award one mark per valid point, max 4.',
      studentAnswer: 'two valid points',
    })
    expect(r.hasBasis).toBe(true)
    expect(r.score).toBe(75)
  })
})
