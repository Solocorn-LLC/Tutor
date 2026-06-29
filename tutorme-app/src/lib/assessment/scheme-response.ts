/**
 * Server-side parsers for the marking-scheme model response. Kept out of the
 * client-imported marking-scheme.ts (so the browser bundle stays lean) and
 * unit-tested here rather than inside the API route.
 */

import { stripCodeFences } from '@/lib/ai/llm-response'
import { refKey, isPlausibleRef, MAX_EXTRA_QUESTIONS } from './marking-scheme'

export interface SchemeMatch {
  ref: string
  answer: string
  variants?: string[]
  marks?: number
  rubric?: string
  /** True when this reference is NOT among the DMI's questions — a candidate new
   *  row the tutor can add. */
  extra?: boolean
}

/** Best-effort board/subject the model detected from the scheme itself. */
export function parseDetection(raw: string): { examBody?: string; subject?: string } {
  try {
    const text = stripCodeFences(raw).trim()
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) return {}
    const obj = JSON.parse(text.slice(start, end + 1)) as { examBody?: unknown; subject?: unknown }
    const examBody = String(obj.examBody ?? '')
      .trim()
      .slice(0, 60)
    const subject = String(obj.subject ?? '')
      .trim()
      .slice(0, 120)
    return { examBody: examBody || undefined, subject: subject || undefined }
  } catch {
    return {}
  }
}

/**
 * Parse the model's `{ matches: [...] }` into validated scheme matches. Matches
 * whose reference is in `validRefs` echo the DMI's canonical reference; matches
 * for references NOT in the DMI become `extra` candidates (only if they look like
 * real question references, capped at MAX_EXTRA_QUESTIONS). Drops empties,
 * de-dupes by reference, and strips variants that just echo the canonical answer.
 */
export function parseMatches(raw: string, validRefs: Map<string, string>): SchemeMatch[] {
  try {
    const text = stripCodeFences(raw).trim()
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) return []
    const obj = JSON.parse(text.slice(start, end + 1)) as {
      matches?: Array<{
        ref?: unknown
        number?: unknown
        answer?: unknown
        variants?: unknown
        marks?: unknown
        rubric?: unknown
      }>
    }
    if (!Array.isArray(obj.matches)) return []
    const out: SchemeMatch[] = []
    const seen = new Set<string>()
    let extraCount = 0
    for (const m of obj.matches) {
      // Accept `ref`; tolerate a model that still emits `number`.
      const rawRef = String(m?.ref ?? m?.number ?? '').trim()
      const key = refKey(rawRef)
      const answer = String(m?.answer ?? '').trim()
      if (!key || seen.has(key) || !answer) continue
      // Known reference → echo the DMI's canonical form. Unknown → an extra row,
      // but only if it looks like a genuine question reference.
      const canonical = validRefs.get(key)
      const isExtra = !canonical
      if (isExtra) {
        if (!isPlausibleRef(rawRef) || extraCount >= MAX_EXTRA_QUESTIONS) continue
        extraCount += 1
      }
      seen.add(key)
      const rubric = String(m?.rubric ?? '').trim()
      // De-duplicate variants and drop any that just echo the canonical answer.
      const variants = Array.isArray(m?.variants)
        ? Array.from(
            new Set(
              m.variants
                .map(v => String(v ?? '').trim())
                .filter(v => v && v.toLowerCase() !== answer.toLowerCase())
            )
          )
        : []
      const marksNum = Number(m?.marks)
      const marks = Number.isFinite(marksNum) && marksNum > 0 ? marksNum : undefined
      out.push({
        ref: canonical ?? rawRef,
        answer,
        variants: variants.length > 0 ? variants : undefined,
        marks,
        rubric: rubric || undefined,
        ...(isExtra ? { extra: true } : {}),
      })
    }
    return out
  } catch {
    return []
  }
}
