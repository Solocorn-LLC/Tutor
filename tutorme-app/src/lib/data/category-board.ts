/**
 * Best-effort exam board for a course category, derived from the static category
 * datasets (AP / IB / A Level / IGCSE / Global / Languages / Professional /
 * Universities). Used to show the Board alongside the category in the builder
 * header. Returns null for national exams or custom categories that have no
 * fixed board.
 */

import {
  GLOBAL_EXAMS_CATEGORIES,
  AP_CATEGORIES,
  A_LEVEL_CATEGORIES,
  IB_CATEGORIES,
  IGCSE_CATEGORIES,
  LANGUAGE_CATEGORIES,
  PROFESSIONAL_CATEGORIES,
  UNIVERSITY_CATEGORIES,
  type ExamCategory,
} from './tutor-categories'

const CATEGORY_BOARD_MAP = new Map<string, string>()
;(
  [
    [GLOBAL_EXAMS_CATEGORIES, 'Global'],
    [AP_CATEGORIES, 'AP'],
    [A_LEVEL_CATEGORIES, 'A Level'],
    [IB_CATEGORIES, 'IB'],
    [IGCSE_CATEGORIES, 'IGCSE'],
    [LANGUAGE_CATEGORIES, 'Languages'],
    [PROFESSIONAL_CATEGORIES, 'Professional'],
    [UNIVERSITY_CATEGORIES, 'Universities'],
  ] as [ExamCategory[], string][]
).forEach(([cats, board]) =>
  cats.forEach(c => c.exams.forEach(e => CATEGORY_BOARD_MAP.set(e, board)))
)

export function getCategoryBoard(category: string): string | null {
  return CATEGORY_BOARD_MAP.get(category) ?? null
}
