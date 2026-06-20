/**
 * Warn-only guardrail validators.
 *
 * These run AFTER an LLM produces task-PCI or assessment output and detect
 * likely guardrail violations. They never throw and never block — they return
 * a list of violations the caller logs and surfaces as `guardrailWarnings`.
 * To make a rule blocking later, gate the call site on `severity === 'error'`.
 */

import { ASSESSMENT_STATES, type AssessmentState } from './assessment'

export type GuardrailSeverity = 'info' | 'warning' | 'error'

export interface GuardrailViolation {
  ruleId: string
  severity: GuardrailSeverity
  message: string
}

/** Phrases that imply fabricated evaluation policy when the tutor never set it. */
const FABRICATED_POLICY_PATTERNS: { re: RegExp; ruleId: string; what: string }[] = [
  { re: /\b(\d+)\s+(?:retries|retry|attempts|tries)\b/i, ruleId: 'TASK-13', what: 'retry count' },
  { re: /\bunlimited\s+(?:retries|attempts)\b/i, ruleId: 'TASK-13', what: 'retry policy' },
  {
    re: /\b\d+\s*%\s*(?:weight|weighting|of the grade)\b/i,
    ruleId: 'TASK-3',
    what: 'grading weight',
  },
  { re: /\b(?:deduct|penalt(?:y|ies)|minus)\s+\d+/i, ruleId: 'TASK-3', what: 'penalty logic' },
  {
    re: /\breveal(?:s|ed|ing)?\s+the\s+answer\s+(?:immediately|after|on)\b/i,
    ruleId: 'TASK-13',
    what: 'answer-reveal timing',
  },
  {
    re: /\b(?:half|partial)\s+(?:marks?|credit)\s+(?:for|if|when)\b/i,
    ruleId: 'TASK-11',
    what: 'partial-credit policy',
  },
]

/** Phrases that signal false certainty about an evaluation basis the LLM can't know. */
const FALSE_CERTAINTY_PATTERNS = [
  /\bthe correct answer is\b/i,
  /\bthe official (?:rubric|mark scheme)\b/i,
  /\bthe grading (?:scheme|rubric) is\b/i,
]

export interface TaskValidationContext {
  /** The structured `parsed` object the route extracted, if any. */
  parsed?: unknown
  /** Tutor-supplied source content, used to tell "given" from "invented". */
  sourceContent?: string
  /** Whether this turn is meant to finalize the PCI (vs. summarize/confirm). */
  finalizing?: boolean
}

/**
 * Validate a task-PCI LLM response (warn-only).
 * `responseText` is the raw assistant text; `ctx` carries structured + source data.
 */
export function validateTaskPciOutput(
  responseText: string,
  ctx: TaskValidationContext = {}
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = []
  const text = responseText || ''
  const source = (ctx.sourceContent || '').toLowerCase()

  // TASK-3/11/13: fabricated evaluation policy not grounded in tutor source.
  for (const { re, ruleId, what } of FABRICATED_POLICY_PATTERNS) {
    const m = text.match(re)
    if (m && !source.includes(m[0].toLowerCase())) {
      violations.push({
        ruleId,
        severity: 'warning',
        message: `Response states a ${what} ("${m[0].trim()}") not found in tutor-provided content — may be fabricated. Confirm with the tutor or mark it "unspecified".`,
      })
    }
  }

  // TASK-10: false certainty about an answer/rubric the tutor never supplied.
  if (!source) {
    for (const re of FALSE_CERTAINTY_PATTERNS) {
      if (re.test(text)) {
        violations.push({
          ruleId: 'TASK-10',
          severity: 'warning',
          message:
            'Response asserts a definitive correct answer / rubric with no tutor-provided evaluation basis in context. Avoid false certainty; ask the tutor to define it.',
        })
        break
      }
    }
  }

  // TASK-15: when finalizing, the stable sections should be present.
  if (ctx.finalizing) {
    const hasSummary = /pci summary/i.test(text)
    const hasSpec = /final pci specification|pci specification/i.test(text)
    if (!hasSummary) {
      violations.push({
        ruleId: 'TASK-4',
        severity: 'warning',
        message:
          'No "PCI Summary" section detected before finalization (Transparency/Output Structure).',
      })
    }
    if (!hasSpec) {
      violations.push({
        ruleId: 'TASK-15',
        severity: 'warning',
        message:
          'No "Final PCI Specification" section detected in a finalizing turn (Output Structure).',
      })
    }
  }

  return violations
}

// ── Assessment ──────────────────────────────────────────────────────────────

interface AssessmentQuestionLike {
  question_id?: string
  questionId?: string
  question_text?: string
  questionText?: string
  question_type?: string
  questionType?: string
  response_type?: string
  responseType?: string
  marks?: number
  isOpenEnded?: boolean
  rubric?: { criteria?: { marks?: number; points?: number }[] } | null
  answerProvenance?: string
  provenance?: string
}

export interface AssessmentValidationContext {
  /** The source document text, to check wording fidelity (ASMT-4). */
  sourceContent?: string
  /** Document confidence, if scored (ASMT-2). */
  confidence?: 'High' | 'Medium' | 'Low'
  /** Current/target state for transition reporting (ASMT-14). */
  state?: AssessmentState
  /** True when producing a student-facing (final) DMI — answers/rubrics must be gone. */
  studentFacing?: boolean
}

const OPEN_RESPONSE_TYPES =
  /(essay|paragraph|analytical|interpretation|case|short[\s_-]?written|open|long[\s_-]?answer)/i

/** Validate parsed assessment PCI/DMI output (warn-only). */
export function validateAssessmentOutput(
  parsed: { questions?: AssessmentQuestionLike[]; title?: string } | null | undefined,
  ctx: AssessmentValidationContext = {}
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = []
  const questions = parsed?.questions ?? []

  // ASMT-2: Low confidence should pause, not produce a full PCI.
  if (ctx.confidence === 'Low' && questions.length > 0) {
    violations.push({
      ruleId: 'ASMT-2',
      severity: 'warning',
      message:
        'Document confidence is Low but a full PCI was generated. Guardrail says pause and request tutor clarification on Low confidence.',
    })
  }

  for (const q of questions) {
    const id = q.question_id ?? q.questionId ?? '?'
    const qType = (q.question_type ?? q.questionType ?? '').toString()
    const rType = (q.response_type ?? q.responseType ?? '').toString()
    const text = q.question_text ?? q.questionText ?? ''
    const isOpen = q.isOpenEnded ?? OPEN_RESPONSE_TYPES.test(`${qType} ${rType}`)

    // ASMT-4: question wording must appear in the source (fidelity check).
    if (ctx.sourceContent && text && text.length > 12) {
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
      if (!norm(ctx.sourceContent).includes(norm(text).slice(0, Math.min(60, norm(text).length)))) {
        violations.push({
          ruleId: 'ASMT-4',
          severity: 'warning',
          message: `Question ${id} wording may not match the source document verbatim (possible paraphrase). Preserve question wording exactly.`,
        })
      }
    }

    // ASMT-5: answer provenance must be recorded.
    const prov = q.answerProvenance ?? q.provenance
    if (
      prov &&
      !['tutor_provided', 'answer_sheet_extracted', 'llm_inferred', 'tutor_edited'].includes(prov)
    ) {
      violations.push({
        ruleId: 'ASMT-5',
        severity: 'warning',
        message: `Question ${id} has an unrecognized answer provenance "${prov}".`,
      })
    }

    // ASMT-8: open questions need a rubric pathway before confirmation.
    if (isOpen && !q.rubric) {
      violations.push({
        ruleId: 'ASMT-8',
        severity: 'warning',
        message: `Open-ended question ${id} has no rubric pathway. Every open question needs one before confirmation.`,
      })
    }

    // ASMT-9: rubric criteria must sum to the question's marks.
    if (q.rubric?.criteria && typeof q.marks === 'number') {
      const sum = q.rubric.criteria.reduce((acc, c) => acc + (c.marks ?? c.points ?? 0), 0)
      if (sum > 0 && Math.abs(sum - q.marks) > 0.001) {
        violations.push({
          ruleId: 'ASMT-9',
          severity: 'warning',
          message: `Question ${id} rubric criteria sum to ${sum} but the question is worth ${q.marks} marks. Criteria must total the question marks.`,
        })
      }
    }
  }

  // ASMT-10/13: student-facing output must not carry answers or rubrics.
  if (ctx.studentFacing) {
    const leaked = questions.filter(q => q.rubric || q.answerProvenance || q.provenance)
    if (leaked.length > 0) {
      violations.push({
        ruleId: 'ASMT-10',
        severity: 'error',
        message: `Student-facing assessment still carries evaluation data on ${leaked.length} question(s) (rubric/answer/provenance). The evaluation layer must never be student-visible — strip it before delivery.`,
      })
    }
  }

  return violations
}

/** True if the named state is a recognized assessment state. */
export function isAssessmentState(s: string): s is AssessmentState {
  return (ASSESSMENT_STATES as readonly string[]).includes(s)
}
