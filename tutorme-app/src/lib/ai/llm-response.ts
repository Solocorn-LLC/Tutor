/**
 * Helpers for handling raw LLM text output.
 *
 * Gemini (and other models) frequently wrap structured output in Markdown code
 * fences (```json ... ```), and sometimes add prose around it. The app was originally
 * built for providers that returned bare content, so consumers that JSON.parse or
 * pattern-match the response break on fenced output. These helpers normalize that.
 */

/**
 * Strip a surrounding Markdown code fence (```json / ``` / ~~~) from an LLM response.
 * If the whole string isn't a single fenced block, returns it trimmed unchanged.
 */
export function stripCodeFences(text: string): string {
  if (!text) return text
  const s = text.trim()
  const fence = s.match(/^(?:```|~~~)[^\n]*\n([\s\S]*?)\n?(?:```|~~~)\s*$/)
  return fence ? fence[1].trim() : s
}

/**
 * Best-effort parse of a JSON object from an LLM response. Handles code fences and a
 * leading/trailing prose by falling back to the first {...} or [...] block. Returns
 * null if nothing parseable is found.
 */
export function parseLlmJson<T = unknown>(text: string): T | null {
  if (!text) return null
  const candidates: string[] = []
  const stripped = stripCodeFences(text)
  candidates.push(stripped)
  // Fallback: first balanced-looking object/array slice.
  const objMatch = stripped.match(/[{[][\s\S]*[}\]]/)
  if (objMatch) candidates.push(objMatch[0])

  for (const c of candidates) {
    try {
      return JSON.parse(c) as T
    } catch {
      // try next candidate
    }
  }
  return null
}
