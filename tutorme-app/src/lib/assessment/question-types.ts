/**
 * DMI (Digital Marking Interface) question/answer-field taxonomy.
 *
 * A DMI item is an *answer input field* the student fills in — the question
 * itself is read from the deployed document (a question paper) or from the
 * generated questions (when the source was study material). `questionType`
 * decides which input control the student sees and how their answer is stored.
 *
 * Phase 1 renders the text/choice types natively; the richer interactive types
 * (matching, ordering, hotspot, drag_drop) are part of the model now but render
 * as a labelled free-text field until their dedicated components land.
 */

export const DMI_QUESTION_TYPES = [
  'short', // single-line short answer
  'long', // multi-line / essay
  'mcq', // multiple choice — exactly one option
  'true_false', // true / false
  'multiple_response', // multiple choice — one or more options
  'fill_blank', // fill in the blank / cloze
  'matching', // match items in two columns
  'ordering', // order / rank items
  'hotspot', // click a region on an image
  'drag_drop', // drag items into targets
] as const

export type DmiQuestionType = (typeof DMI_QUESTION_TYPES)[number]

/**
 * A correct left↔right correspondence for a `matching` item. `left` items are
 * shown to the student as prompts; the `right` values form the (shuffled) bank
 * the student picks from. The pairing itself is the answer key.
 */
export interface DmiMatchPair {
  left: string
  right: string
}

/**
 * A correct clickable region for a `hotspot` item. Coordinates are fractions of
 * the image (0–1) so they're resolution-independent: x/y is the top-left corner,
 * w/h the size. The student's click is correct if it lands inside any region.
 * Regions are the answer key — never shown to the student.
 */
export interface DmiHotspotRegion {
  x: number
  y: number
  w: number
  h: number
  label?: string
}

/** The default when an item has no explicit type (back-compat with old DMIs). */
export const DEFAULT_DMI_QUESTION_TYPE: DmiQuestionType = 'long'

/** Human-readable labels for tutor UI / prompts. */
export const DMI_QUESTION_TYPE_LABELS: Record<DmiQuestionType, string> = {
  short: 'Short answer',
  long: 'Long answer',
  mcq: 'Multiple choice',
  true_false: 'True / False',
  multiple_response: 'Multiple response',
  fill_blank: 'Fill in the blank',
  matching: 'Matching',
  ordering: 'Ordering / Ranking',
  hotspot: 'Hotspot',
  drag_drop: 'Drag and drop',
}

/** Choice types carry an `options` list the student picks from. */
export const CHOICE_DMI_TYPES: ReadonlySet<DmiQuestionType> = new Set([
  'mcq',
  'true_false',
  'multiple_response',
])

/**
 * Types that still degrade to a free-text input in some cases. All ten now have
 * dedicated renderers; `hotspot` only falls back when its item has no image.
 */
export const FALLBACK_DMI_TYPES: ReadonlySet<DmiQuestionType> = new Set([])

export function isDmiQuestionType(value: unknown): value is DmiQuestionType {
  return typeof value === 'string' && (DMI_QUESTION_TYPES as readonly string[]).includes(value)
}

/** Normalize an arbitrary value to a known type, defaulting safely. */
export function normalizeDmiQuestionType(value: unknown): DmiQuestionType {
  return isDmiQuestionType(value) ? value : DEFAULT_DMI_QUESTION_TYPE
}
