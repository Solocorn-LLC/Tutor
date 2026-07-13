/**
 * Default model adapter — wraps the existing `generateWithFallback` provider
 * (Kimi primary -> OpenAI fallback) so the runner depends only on `GenerateFn`.
 *
 * It also introduces proper system/user separation: `generateWithFallback` takes
 * a single prompt string, so we fence the user input in <user_input> tags after
 * the system prompt. This is a small hardening the review called out (structured
 * roles resist prompt injection better than a raw concatenated blob).
 */
import { generateWithFallback } from '@/lib/agents'
import type { GenerateFn } from './types'

export const defaultGenerate: GenerateFn = async ({ system, user, temperature, maxTokens }) => {
  const prompt = system ? `${system}\n\n<user_input>\n${user}\n</user_input>` : user
  const result = await generateWithFallback(prompt, { temperature, maxTokens })
  return { text: result.content }
}
