/**
 * Student-safe projection of a DMI item (ASMT-10 / ASMT-13 — Delivery vs
 * Evaluation layer separation).
 *
 * The matching/drag_drop `pairs` and hotspot `regions` ARE the answer key (the
 * correct correspondence / correct clickable areas). Broadcasting them to
 * students leaks the answers even though the UI only shows a shuffled bank. This
 * is the single choke point every student-facing DMI payload must go through:
 * it keeps the prompts + option bank a learner needs to answer, but never the
 * correct correspondence, and strips all other evaluation fields.
 */

import type { DmiMatchPair, DmiHotspotRegion, DmiQuestionType } from './question-types'

/** A tutor-side DMI item as built in the assessment / task builder. */
export interface DeployableDmiItem {
  id: string
  questionNumber: number
  questionLabel?: string
  questionText: string
  marks?: number
  questionType?: DmiQuestionType
  options?: string[]
  /** Correct left↔right pairing for matching/drag_drop — answer key. */
  pairs?: DmiMatchPair[]
  hotspotImageUrl?: string
  /** Correct clickable regions for hotspot — answer key. */
  regions?: DmiHotspotRegion[]
  /** Paper section heading (delivery-layer — safe to show students). */
  section?: string
}

/** The student-safe DMI item broadcast to learners — carries no answer key. */
export interface StudentDmiItem {
  id: string
  questionNumber: number
  questionLabel?: string
  questionText: string
  marks?: number
  questionType?: DmiQuestionType
  options?: string[]
  hotspotImageUrl?: string
  /** Prompts (left items / drag items) for matching & drag_drop, in order. */
  matchPrompts?: string[]
  /**
   * The option bank (unique right values), SORTED so its order reveals nothing
   * about the correct pairing. Never includes the correspondence itself.
   */
  matchBank?: string[]
  /** Paper section heading (delivery-layer — the student sees the structure). */
  section?: string
}

/**
 * Project a tutor DMI item to its student-safe form. Drops every evaluation
 * field — answers, rubrics, and crucially `pairs`/`regions`. For matching and
 * drag_drop the student still gets the prompts and a sorted option bank, but
 * never which prompt maps to which option.
 */
export function toStudentDmiItem(item: DeployableDmiItem): StudentDmiItem {
  const safe: StudentDmiItem = {
    id: item.id,
    questionNumber: item.questionNumber,
    questionLabel: item.questionLabel,
    questionText: item.questionText,
    marks: item.marks,
    questionType: item.questionType,
    options: item.options,
    hotspotImageUrl: item.hotspotImageUrl,
    section: item.section,
  }
  if (
    (item.questionType === 'matching' || item.questionType === 'drag_drop') &&
    item.pairs &&
    item.pairs.length > 0
  ) {
    safe.matchPrompts = item.pairs.map(p => p.left)
    // Unique rights, sorted: the bank a student picks from, with the correct
    // correspondence (and any left-order correlation) destroyed.
    safe.matchBank = [...new Set(item.pairs.map(p => p.right))].sort((a, b) => a.localeCompare(b))
  }
  return safe
}
