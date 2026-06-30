/**
 * Pre-deploy gates for assessments (Assessment guardrails).
 *
 * These are pure, testable checks the deploy path runs to BLOCK (not just warn)
 * when a spec invariant is violated. ASMT-8: every open-response question must
 * have a rubric pathway defined before the assessment can be confirmed/deployed.
 */

import { isOpenDmiType } from './question-types'
import { hasPartialSectioning } from './sections'

export interface RubricGateItem {
  questionType?: string | null
  questionLabel?: string | null
  questionNumber?: number | null
  /** Marking guidance / rubric pathway (free text, or a "manual marking" note). */
  rubric?: string | null
}

/**
 * ASMT-8: returns the labels of open-response questions that have NO rubric
 * pathway (empty/whitespace `rubric`). An empty result means the gate passes.
 *
 * Only genuinely open types (`short`/`long`) are gated — closed and auto-graded
 * types don't need a rubric, and untyped legacy items are not blocked.
 */
export function findOpenItemsMissingRubric(items: RubricGateItem[]): string[] {
  const missing: string[] = []
  for (const it of items) {
    if (!isOpenDmiType(it.questionType)) continue
    if (!it.rubric || !it.rubric.trim()) {
      missing.push(
        (it.questionLabel && it.questionLabel.trim()) ||
          (it.questionNumber != null ? `Q${it.questionNumber}` : '?')
      )
    }
  }
  return missing
}

/** Closed text types that are auto-graded against an `answer` string. */
const CLOSED_TEXT_TYPES = new Set(['mcq', 'true_false', 'multiple_response', 'fill_blank'])

export interface ReverifyItem extends RubricGateItem {
  answer?: string | null
  acceptableVariants?: string[] | null
  pairs?: unknown[] | null
  regions?: unknown[] | null
  section?: string | null
  id?: string
}

export interface ReverifyIssue {
  kind: 'numbering' | 'rubric' | 'answer-mapping' | 'section'
  label: string
  message: string
}

function reverifyLabel(it: ReverifyItem): string {
  return (
    (it.questionLabel && it.questionLabel.trim()) ||
    (it.questionNumber != null ? `Q${it.questionNumber}` : '?')
  )
}

/** Normalized question reference for numbering-integrity (e.g. "1(a)" == "1a"). */
function reverifyRef(it: ReverifyItem): string {
  const raw =
    it.questionLabel?.trim() || (it.questionNumber != null ? String(it.questionNumber) : '')
  return raw.toLowerCase().replace(/[\s()._-]/g, '')
}

/**
 * ASMT-12: re-verify an assessment is internally consistent and fully gradable
 * before the final/deployed DMI is generated. Returns the blocking issues found
 * (empty = passes):
 *  - numbering integrity: question references must be unique
 *  - rubric completeness: open (short/long) questions need a marking pathway
 *  - answer mapping: auto-graded types need their answer key (closed → answer,
 *    matching/drag_drop → pairs, hotspot → regions)
 *
 * Untyped legacy items are left lenient (skipped) so old assessments don't
 * suddenly fail to deploy. Section-structure and mark-validity checks are
 * deferred until the section data model lands (P2).
 */
export function reverifyAssessment(items: ReverifyItem[]): ReverifyIssue[] {
  const issues: ReverifyIssue[] = []

  // Numbering integrity — duplicate references break answer/grade mapping.
  const counts = new Map<string, number>()
  for (const it of items) {
    const ref = reverifyRef(it)
    if (ref) counts.set(ref, (counts.get(ref) ?? 0) + 1)
  }
  for (const [ref, n] of counts) {
    if (n > 1) {
      issues.push({
        kind: 'numbering',
        label: ref,
        message: `Question reference "${ref}" is used ${n} times — references must be unique.`,
      })
    }
  }

  for (const it of items) {
    const type = (it.questionType ?? '').toString()
    const label = reverifyLabel(it)

    if (isOpenDmiType(type)) {
      if (!it.rubric || !it.rubric.trim()) {
        issues.push({
          kind: 'rubric',
          label,
          message: `Open question ${label} has no marking guidance (add one, or mark it for manual grading).`,
        })
      }
      continue // open items grade by rubric, not an answer key
    }

    const hasAnswer =
      !!(it.answer && it.answer.trim()) ||
      (Array.isArray(it.acceptableVariants) && it.acceptableVariants.length > 0)

    if (CLOSED_TEXT_TYPES.has(type)) {
      if (!hasAnswer) {
        issues.push({
          kind: 'answer-mapping',
          label,
          message: `Question ${label} has no answer key — set one or upload a marking scheme.`,
        })
      }
    } else if (type === 'matching' || type === 'drag_drop') {
      if (!(Array.isArray(it.pairs) && it.pairs.length > 0)) {
        issues.push({
          kind: 'answer-mapping',
          label,
          message: `Question ${label} has no correct pairs defined.`,
        })
      }
    } else if (type === 'hotspot') {
      if (!(Array.isArray(it.regions) && it.regions.length > 0)) {
        issues.push({
          kind: 'answer-mapping',
          label,
          message: `Question ${label} has no correct regions defined.`,
        })
      }
    }
  }

  // ASMT-4: section-structure consistency — a paper should be fully sectioned or
  // not at all; partial sectioning means a section heading was missed.
  if (hasPartialSectioning(items.map(it => ({ id: it.id ?? '', section: it.section })))) {
    issues.push({
      kind: 'section',
      label: 'sections',
      message:
        'Some questions are assigned to a section and others are not — assign every question to its section, or remove the section headings.',
    })
  }

  return issues
}
