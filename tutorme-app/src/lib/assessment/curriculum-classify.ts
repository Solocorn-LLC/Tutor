/**
 * Lightweight AI classification of a document's exam board + subject, for the
 * curriculum-mismatch guardrail (layer 2). Deliberately isolated from the DMI
 * extraction prompt so that heavily-tuned prompt stays untouched.
 *
 * Best-effort and non-blocking: any failure (no API key, timeout, unparseable
 * response) returns null and the guardrail simply skips its subject layer.
 */

import { generateWithKimi } from '@/lib/ai/kimi'
import { parseLlmJson } from '@/lib/ai/llm-response'

export interface CurriculumClassification {
  /** Exam board the document appears to belong to, or null if unclear. */
  board: string | null
  /** Primary subject of the document, or null if unclear. */
  subject: string | null
  confidence: 'high' | 'medium' | 'low'
}

const SYSTEM_PROMPT =
  'You classify an academic document by its exam board and subject. Respond with ONLY a JSON ' +
  'object (no prose, no code fences) of shape ' +
  '{"board": string|null, "subject": string|null, "confidence": "high"|"medium"|"low"}. ' +
  'board is the exam board/curriculum the document belongs to if identifiable (e.g. "AP", ' +
  '"A Level", "IGCSE", "IB", or a national board), else null. subject is the primary subject ' +
  '(e.g. "Statistics", "Biology"), else null. confidence reflects how sure you are from the text. ' +
  'Judge only from the content; do not guess wildly — use null and lower confidence when unsure.'

/** How much of the document to send — the header/first questions are plenty to
 *  identify board + subject, and keeps the call fast and cheap. */
const EXCERPT_CHARS = 4000

/**
 * Classify the document's board/subject. Returns null on any failure so callers
 * can treat "no signal" and "call failed" identically (skip the subject layer).
 */
export async function classifyDocumentCurriculum(
  text: string | null | undefined
): Promise<CurriculumClassification | null> {
  const excerpt = (text ?? '').trim().slice(0, EXCERPT_CHARS)
  if (excerpt.length < 40) return null // too little to classify meaningfully

  try {
    const raw = await generateWithKimi(excerpt, {
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.2,
      maxTokens: 120,
      timeoutMs: 15000,
      retries: 0,
      usageContext: { feature: 'curriculum-classify' },
    })
    const parsed = parseLlmJson<Partial<CurriculumClassification>>(raw)
    if (!parsed) return null
    const confidence =
      parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'low'
    return {
      board: typeof parsed.board === 'string' && parsed.board.trim() ? parsed.board.trim() : null,
      subject:
        typeof parsed.subject === 'string' && parsed.subject.trim() ? parsed.subject.trim() : null,
      confidence,
    }
  } catch {
    return null
  }
}
