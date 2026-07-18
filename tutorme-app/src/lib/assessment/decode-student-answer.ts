import { normalizeDmiQuestionType } from '@/lib/assessment/question-types'
import type { StudentDmiItem } from '@/lib/assessment/student-dmi'

/**
 * Turn a stored student answer back into something human-readable, matching how the
 * answer field encoded it: an mcq stores the chosen letter, a multiple_response a
 * JSON array of option texts, everything else the raw text.
 *
 * `answers` is a jsonb column the submit route persists verbatim, so a value can be
 * a non-string (number, array, object) at runtime — those are normalised first so an
 * unexpected shape never throws while rendering a submission.
 */
export function decodeStudentAnswer(item: StudentDmiItem, value: unknown): string {
  if (value == null) return '—'
  if (typeof value !== 'string') {
    if (Array.isArray(value))
      return value.map(v => (typeof v === 'string' ? v : JSON.stringify(v))).join(', ') || '—'
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch {
        return '—'
      }
    }
    return String(value)
  }
  if (value.trim().length === 0) return '—'
  const type = normalizeDmiQuestionType(item.questionType)
  if (type === 'mcq' && item.options && item.options.length > 0) {
    const idx = value.charCodeAt(0) - 65
    const opt = idx >= 0 && idx < item.options.length ? item.options[idx] : null
    return opt ? `${value}. ${opt}` : value
  }
  if (type === 'multiple_response') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.filter(v => typeof v === 'string').join(', ') || '—'
    } catch {
      // fall through to raw
    }
  }
  return value
}
