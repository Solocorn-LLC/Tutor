/**
 * AI provider selection.
 *
 * The app historically used Kimi (Moonshot) as its only provider. Gemini support
 * was added so the platform can run on a working key. Selection logic:
 *   - If AI_PROVIDER is explicitly set to 'gemini' or 'kimi', honor it.
 *   - Otherwise prefer Gemini when GEMINI_API_KEY is present, else fall back to Kimi.
 *
 * All exported Kimi helpers (generateWithKimi, chatWithKimi, streamKimi, …) consult
 * isGeminiActive() and transparently delegate to the Gemini implementation, so call
 * sites do not need to change.
 */

export type AIProviderName = 'gemini' | 'kimi'

export function getActiveProvider(): AIProviderName {
  const explicit = process.env.AI_PROVIDER?.toLowerCase()
  if (explicit === 'gemini' || explicit === 'kimi') return explicit
  if (process.env.GEMINI_API_KEY) return 'gemini'
  return 'kimi'
}

/** True when Gemini should handle generation (active provider + key present). */
export function isGeminiActive(): boolean {
  return getActiveProvider() === 'gemini' && !!process.env.GEMINI_API_KEY
}
