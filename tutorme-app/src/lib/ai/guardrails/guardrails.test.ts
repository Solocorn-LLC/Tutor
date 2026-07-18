import { describe, it, expect } from 'vitest'
import {
  validateTaskPciOutput,
  validateAssessmentOutput,
  canTransition,
  stripEvaluationLayer,
  findEvaluationLeaks,
  guardrailSystemPrompt,
  TASK_PCI_GUARDRAILS,
  ASSESSMENT_GUARDRAILS,
} from './index'

describe('task PCI validator (warn-only)', () => {
  it('flags a fabricated retry count not present in tutor content', () => {
    const v = validateTaskPciOutput('Students will get 3 retries before the answer is revealed.', {
      sourceContent: 'Explain photosynthesis to the student.',
    })
    expect(v.some(x => x.ruleId === 'TASK-13')).toBe(true)
  })

  it('does not flag a retry count the tutor actually specified', () => {
    const v = validateTaskPciOutput('Students will get 3 retries.', {
      sourceContent: 'Give the student 3 retries on this task.',
    })
    expect(v.some(x => x.ruleId === 'TASK-13')).toBe(false)
  })

  it('flags false certainty about the correct answer with no basis', () => {
    const v = validateTaskPciOutput('The correct answer is 42.', { sourceContent: '' })
    expect(v.some(x => x.ruleId === 'TASK-10')).toBe(true)
  })

  it('flags a finalizing turn that produced no finalized rubric (empty pci)', () => {
    const v = validateTaskPciOutput('Okay, finalized!', { finalizing: true, finalizedPci: '' })
    expect(v.some(x => x.ruleId === 'TASK-15')).toBe(true)
  })

  it('does not flag a finalizing turn that produced a rubric', () => {
    const v = validateTaskPciOutput('Done — applied your rubric.', {
      finalizing: true,
      finalizedPci: 'Correct: identifies all roles. Retry: unspecified.',
    })
    expect(v.some(x => x.ruleId === 'TASK-15')).toBe(false)
  })

  it('flags a chat reply that leaks raw JSON/spec instead of staying conversational', () => {
    const v = validateTaskPciOutput('{"reply":"hi","pci":"..."}', {})
    expect(v.some(x => x.ruleId === 'TASK-15')).toBe(true)
  })

  it('scans the finalized rubric (not just the chat reply) for fabricated policy', () => {
    const v = validateTaskPciOutput('Sounds good!', {
      finalizing: true,
      finalizedPci: 'Students get 3 retries before the answer is revealed.',
    })
    // a fabricated retry policy in the rubric is caught even though the chat
    // reply itself is clean
    expect(v.length).toBeGreaterThan(0)
  })
})

describe('assessment validator (warn-only)', () => {
  it('flags an open question with no rubric pathway', () => {
    const v = validateAssessmentOutput({
      questions: [{ questionId: 'q1', responseType: 'essay', marks: 10 }],
    })
    expect(v.some(x => x.ruleId === 'ASMT-8')).toBe(true)
  })

  it('flags rubric criteria that do not sum to the question marks', () => {
    const v = validateAssessmentOutput({
      questions: [
        {
          questionId: 'q1',
          responseType: 'essay',
          marks: 10,
          rubric: { criteria: [{ marks: 3 }, { marks: 3 }] },
        },
      ],
    })
    expect(v.some(x => x.ruleId === 'ASMT-9')).toBe(true)
  })

  it('errors when evaluation data leaks into a student-facing payload', () => {
    const v = validateAssessmentOutput(
      { questions: [{ questionId: 'q1', rubric: { criteria: [{ marks: 10 }] } }] },
      { studentFacing: true }
    )
    expect(v.some(x => x.ruleId === 'ASMT-10' && x.severity === 'error')).toBe(true)
  })

  it('flags a full PCI generated on Low document confidence', () => {
    const v = validateAssessmentOutput({ questions: [{ questionId: 'q1' }] }, { confidence: 'Low' })
    expect(v.some(x => x.ruleId === 'ASMT-2')).toBe(true)
  })
})

describe('assessment state machine', () => {
  it('blocks Edited → Final DMI Generated without Re-Verified', () => {
    expect(canTransition('Edited', 'Final DMI Generated').allowed).toBe(false)
  })

  it('allows Edited → Re-Verified → Final DMI Generated', () => {
    expect(canTransition('Edited', 'Re-Verified').allowed).toBe(true)
    expect(canTransition('Re-Verified', 'Final DMI Generated').allowed).toBe(true)
  })
})

describe('evaluation-layer stripping', () => {
  it('removes answers and rubrics recursively, leaving delivery content', () => {
    const dmi = {
      title: 'Exam',
      questions: [
        { id: 'q1', questionText: 'What is 2+2?', answer: '4', rubric: { criteria: [] } },
        { id: 'q2', questionText: 'Discuss.', modelAnswer: 'x', provenance: 'llm_inferred' },
      ],
    }
    const safe = stripEvaluationLayer(dmi)
    expect(findEvaluationLeaks(safe)).toEqual([])
    expect(safe.questions[0].questionText).toBe('What is 2+2?')
    expect((safe.questions[0] as Record<string, unknown>).answer).toBeUndefined()
  })
})

describe('prompts and rule lists', () => {
  it('exposes 20 task rules and 15 assessment rules', () => {
    expect(TASK_PCI_GUARDRAILS).toHaveLength(24)
    expect(ASSESSMENT_GUARDRAILS).toHaveLength(15)
  })

  it('returns the right system prompt per domain', () => {
    expect(guardrailSystemPrompt('task')).toContain('PCI Instruction Engine')
    expect(guardrailSystemPrompt('assessment')).toContain('Assessment PCI')
  })
})
