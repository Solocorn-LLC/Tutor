/**
 * AI provider — Kimi (Moonshot) only.
 *
 * Gemini support was removed; the app uses Kimi exclusively. These helpers are
 * retained (always reporting Kimi) so existing call sites keep compiling without
 * needing to know the provider went away.
 */

export type AIProviderName = 'kimi'

export function getActiveProvider(): AIProviderName {
  return 'kimi'
}

/** Retained for compatibility — always false now that Gemini is removed. */
export function isGeminiActive(): boolean {
  return false
}
