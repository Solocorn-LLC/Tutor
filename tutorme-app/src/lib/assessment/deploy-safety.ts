/**
 * Deploy-safety — the single guarantee point for every deploy path (task /
 * assessment / homework).
 *
 * The builder holds DMI items that carry the answer key (`answer`, `rubric`,
 * `acceptableVariants`, and the correct `pairs`/`regions` for matching/hotspot).
 * Two things must happen before a deploy reaches students:
 *   1. the student-facing `dmiItems` must be stripped of all of that
 *      (`toStudentDmiItem`), and
 *   2. the answer key must be carried separately as `answerKey` — sent to the
 *      server for grading, NEVER broadcast to students.
 * Sending raw items leaks answers; sending no answer key breaks auto-grading.
 * `buildStudentDeployPayload` does both and returns a leak backstop.
 */

import { toStudentDmiItem, type DeployableDmiItem, type StudentDmiItem } from './student-dmi'
import { findEvaluationLeaks } from '@/lib/ai/guardrails'

/** A DMI item as held in the builder — the answer-bearing (evaluation) shape. */
export type RawDeployDmiItem = DeployableDmiItem & {
  answer?: string
  acceptableVariants?: string[]
  rubric?: string
}

/** Per-question answer key sent to the server for grading (never to students). */
export interface DeployAnswerKeyEntry {
  id: string
  answer?: string
  acceptableVariants?: string[]
  marks?: number
}

export interface StudentDeployPayload {
  /** Answer-stripped items, safe to broadcast to students. */
  dmiItems: StudentDmiItem[]
  /** Server-only answer key for grading. */
  answerKey: DeployAnswerKeyEntry[]
  /** Residual evaluation-layer leaks found in `dmiItems` — MUST be empty; a
   *  non-empty result means the deploy should be blocked. */
  leaks: string[]
}

/**
 * Produce the student-safe payload from the tutor's raw DMI items. When the
 * caller already supplies an `answerKey` (e.g. a path that pre-stripped its
 * items), it is used as-is; otherwise the key is derived from the raw items.
 */
export function buildStudentDeployPayload(
  rawItems: ReadonlyArray<RawDeployDmiItem> | undefined,
  providedAnswerKey?: DeployAnswerKeyEntry[]
): StudentDeployPayload {
  const items = rawItems ?? []
  const dmiItems = items.map(it => toStudentDmiItem(it))
  const answerKey =
    providedAnswerKey ??
    items.map(it => ({
      id: it.id,
      answer: typeof it.answer === 'string' ? it.answer : undefined,
      acceptableVariants: Array.isArray(it.acceptableVariants) ? it.acceptableVariants : undefined,
      marks: typeof it.marks === 'number' ? it.marks : undefined,
    }))
  const leaks = findEvaluationLeaks(dmiItems)
  return { dmiItems, answerKey, leaks }
}
