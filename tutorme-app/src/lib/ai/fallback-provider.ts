/**
 * Secondary AI provider fallback.
 *
 * Kimi/Moonshot is the primary (and, from asia-southeast1 against a .cn
 * endpoint, a single point of failure). When it's unavailable, an optional
 * secondary provider turns a hard failure into a degraded-but-working response.
 *
 * Defaults to OpenAI, so activation only needs the API key:
 *
 *   FALLBACK_AI_API_KEY    the provider key (or reuses OPENAI_API_KEY)  ← required
 *   FALLBACK_AI_BASE_URL   default https://api.openai.com/v1            ← optional
 *   FALLBACK_AI_MODEL      default gpt-4o-mini                          ← optional
 *
 * Override base URL + model for any other OpenAI-compatible endpoint (Together,
 * Groq, DeepSeek, OpenRouter, a Moonshot global endpoint, …). With no key set,
 * behaviour is unchanged (Kimi-only).
 */

import { fetchWithTimeoutAndRetry } from './fetch-utils'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'

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

/**
 * The configured secondary provider, or null when it isn't set up. Only the API
 * key is required — base URL and model default to OpenAI.
 */
export function getFallbackProviderConfig(): FallbackProviderConfig | null {
  const apiKey = (process.env.FALLBACK_AI_API_KEY || process.env.OPENAI_API_KEY)?.trim()
  if (!apiKey) return null
  const baseUrl = (process.env.FALLBACK_AI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = process.env.FALLBACK_AI_MODEL?.trim() || DEFAULT_MODEL
  return { baseUrl, apiKey, model }
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
