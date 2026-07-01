/**
 * Secondary AI provider fallback.
 *
 * Kimi/Moonshot is the primary (and, from asia-southeast1 against a .cn
 * endpoint, a single point of failure). When it's unavailable, an optional
 * OpenAI-compatible secondary provider turns a hard failure into a
 * degraded-but-working response. It's configured entirely via env — when the
 * three vars aren't set, behaviour is unchanged (Kimi-only):
 *
 *   FALLBACK_AI_BASE_URL   e.g. https://api.openai.com/v1  (no trailing /chat)
 *   FALLBACK_AI_API_KEY    the provider key
 *   FALLBACK_AI_MODEL      e.g. gpt-4o-mini
 *
 * Any OpenAI-compatible chat/completions endpoint works (OpenAI, Together,
 * Groq, DeepSeek, OpenRouter, a Moonshot global endpoint, …).
 */

import { fetchWithTimeoutAndRetry } from './fetch-utils'

export interface FallbackProviderConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export interface FallbackGenOptions {
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  retries?: number
}

interface ChatMessage {
  role: string
  content: string
}

/** The configured secondary provider, or null when it isn't set up. */
export function getFallbackProviderConfig(): FallbackProviderConfig | null {
  const baseUrl = process.env.FALLBACK_AI_BASE_URL?.trim()
  const apiKey = process.env.FALLBACK_AI_API_KEY?.trim()
  const model = process.env.FALLBACK_AI_MODEL?.trim()
  if (!baseUrl || !apiKey || !model) return null
  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, model }
}

async function callChatCompletions(
  cfg: FallbackProviderConfig,
  messages: ChatMessage[],
  opts: FallbackGenOptions
): Promise<string> {
  const res = await fetchWithTimeoutAndRetry(
    `${cfg.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 2048,
      }),
    },
    { timeoutMs: opts.timeoutMs, retries: opts.retries }
  )
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Fallback provider error: ${res.status} - ${err}`)
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content || ''
}

/** Single-prompt generation via the secondary provider (OpenAI-compatible). */
export function generateWithFallbackProvider(
  prompt: string,
  cfg: FallbackProviderConfig,
  opts: FallbackGenOptions = {}
): Promise<string> {
  const messages: ChatMessage[] = []
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt })
  messages.push({ role: 'user', content: prompt })
  return callChatCompletions(cfg, messages, opts)
}

/** Multi-turn chat via the secondary provider (OpenAI-compatible). */
export function chatWithFallbackProvider(
  messages: ChatMessage[],
  cfg: FallbackProviderConfig,
  opts: FallbackGenOptions = {}
): Promise<string> {
  return callChatCompletions(cfg, messages, opts)
}
