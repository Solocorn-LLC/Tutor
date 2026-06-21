/**
 * AI Orchestrator
 * Manages AI providers with fallback chain:
 * 1. Kimi K2.5 (Moonshot AI) - PRIMARY
 *
 * Response caching for repeated prompts (5 min TTL)
 */

import { generateWithKimi, chatWithKimi } from '@/lib/ai/kimi'
import type { UsageContext } from '@/lib/ai/usage'
import { cache } from '@/lib/db'
import { adkGenerate, adkChat } from '@/lib/adk-client'
import { isGeminiActive } from '@/lib/ai/provider'

type AIProvider = 'kimi' | 'gemini'

/** Label results with the provider actually handling generation. */
function activeProviderLabel(): AIProvider {
  return isGeminiActive() ? 'gemini' : 'kimi'
}

interface AIOptions {
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  /** Skip response cache (default false for generate, true when cache not desired) */
  skipCache?: boolean
  /** Attribute token usage to a student/course/feature (recorded by the Kimi provider). */
  usageContext?: UsageContext
}

interface GenerationResult {
  content: string
  provider: AIProvider
  latencyMs: number
}

const AI_CACHE_TTL = 300 // 5 minutes for identical prompts
const AI_CACHE_PREFIX = 'ai:resp:'

function cacheKeyForPrompt(prompt: string): string {
  const crypto = require('crypto') as typeof import('crypto')
  return AI_CACHE_PREFIX + crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 32)
}

function cacheKeyForChat(messages: Array<{ role: string; content: string }>): string {
  const crypto = require('crypto') as typeof import('crypto')
  const payload = JSON.stringify(messages)
  return (
    AI_CACHE_PREFIX +
    'chat:' +
    crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32)
  )
}

/**
 * Generate text with automatic fallback
 * Priority: Kimi
 * Kimi is now PRIMARY provider
 */
export async function generateWithFallback(
  prompt: string,
  options: AIOptions = {}
): Promise<GenerationResult> {
  const startTime = Date.now()

  if (!options.skipCache) {
    const key = cacheKeyForPrompt(prompt)
    const cached = await cache.get<GenerationResult>(key)
    if (cached) return { ...cached, latencyMs: Date.now() - startTime }
  }

  // MOCK MODE (for verification/testing without keys)
  if (process.env.MOCK_AI === 'true') {
    return {
      content: `[MOCK AI RESPONSE] Processed prompt: ${prompt.substring(0, 200)}...`,
      provider: 'kimi',
      latencyMs: 10,
    }
  }

  // ADK path (skip when Gemini is the active provider — ADK itself only speaks Kimi)
  if (process.env.ADK_BASE_URL && !isGeminiActive()) {
    try {
      const content = await adkGenerate(prompt, { timeoutMs: options.timeoutMs, retries: 1 })
      const result = {
        content,
        provider: 'kimi' as AIProvider,
        latencyMs: Date.now() - startTime,
      }
      if (!options.skipCache) await cache.set(cacheKeyForPrompt(prompt), result, AI_CACHE_TTL)
      return result
    } catch (error) {
      console.log('ADK generate failed, trying direct providers:', error)
    }
  }

  // Direct provider (Gemini when active, otherwise Kimi). generateWithKimi delegates
  // to Gemini internally when GEMINI_API_KEY is configured.
  if (isGeminiActive() || process.env.KIMI_API_KEY) {
    try {
      const content = await generateWithKimi(prompt, { ...options })

      const result = {
        content,
        provider: activeProviderLabel(),
        latencyMs: Date.now() - startTime,
      }
      if (!options.skipCache) await cache.set(cacheKeyForPrompt(prompt), result, AI_CACHE_TTL)
      return result
    } catch (error) {
      console.log('Direct provider failed:', error)
    }
  }
  throw new Error('No AI providers configured. Please set GEMINI_API_KEY or KIMI_API_KEY.')
}

/**
 * Chat with automatic fallback
 * Priority: Kimi
 */
export async function chatWithFallback(
  messages: Array<{ role: string; content: string }>,
  options: AIOptions = {}
): Promise<GenerationResult> {
  const startTime = Date.now()

  if (!options.skipCache) {
    const key = cacheKeyForChat(messages)
    const cached = await cache.get<GenerationResult>(key)
    if (cached) return { ...cached, latencyMs: Date.now() - startTime }
  }

  // MOCK MODE
  if (process.env.MOCK_AI === 'true') {
    return {
      content: `[MOCK AI RESPONSE] Processed chat with ${messages.length} messages.`,
      provider: 'kimi',
      latencyMs: 10,
    }
  }

  // ADK path (skip when Gemini is the active provider — ADK itself only speaks Kimi)
  if (process.env.ADK_BASE_URL && !isGeminiActive()) {
    try {
      const content = await adkChat(messages, { timeoutMs: options.timeoutMs, retries: 1 })
      const result = {
        content,
        provider: 'kimi' as AIProvider,
        latencyMs: Date.now() - startTime,
      }
      if (!options.skipCache) await cache.set(cacheKeyForChat(messages), result, AI_CACHE_TTL)
      return result
    } catch (error) {
      console.log('ADK chat failed, trying direct providers:', error)
    }
  }

  // Direct provider (Gemini when active, otherwise Kimi).
  if (isGeminiActive() || process.env.KIMI_API_KEY) {
    try {
      const content = await chatWithKimi(messages, { ...options })

      const result = {
        content,
        provider: activeProviderLabel(),
        latencyMs: Date.now() - startTime,
      }
      if (!options.skipCache) await cache.set(cacheKeyForChat(messages), result, AI_CACHE_TTL)
      return result
    } catch (error) {
      console.log('Direct provider failed:', error)
    }
  }
  throw new Error('No AI providers configured. Please set GEMINI_API_KEY or KIMI_API_KEY.')
}

/**
 * Stream responses with fallback
 * Note: This doesn't support fallback mid-stream, it picks provider at start
 */
import { streamKimi } from '@/lib/ai/kimi'

export async function* streamWithFallback(
  messages: Array<{ role: string; content: string }>,
  options: AIOptions = {}
): AsyncGenerator<{ content: string; provider: AIProvider }, void, unknown> {
  const modelStr = process.env.KIMI_MODEL || 'moonshot-v1-auto'
  try {
    const stream = streamKimi(messages, {
      model: modelStr,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens,
    })

    for await (const chunk of stream) {
      yield { content: chunk, provider: 'kimi' as AIProvider }
    }
  } catch (error) {
    console.error('[AI Stream] Stream failed:', error)
    throw error
  }
}

/**
 * Get status of all AI providers
 */
export async function getAIProvidersStatus(): Promise<
  Array<{ name: AIProvider; available: boolean; latencyMs?: number }>
> {
  return [
    {
      name: 'gemini' as AIProvider,
      available: !!process.env.GEMINI_API_KEY,
    },
    {
      name: 'kimi' as AIProvider,
      available: !!process.env.KIMI_API_KEY,
    },
  ]
}

/**
 * Force specific provider (for testing or user preference)
 */
export async function generateWithProvider(
  provider: AIProvider,
  prompt: string,
  options: AIOptions = {}
): Promise<GenerationResult> {
  const startTime = Date.now()

  switch (provider) {
    case 'gemini':
    case 'kimi':
      // generateWithKimi delegates to Gemini when GEMINI_API_KEY is active.
      return {
        content: await generateWithKimi(prompt, { ...options }),
        provider: activeProviderLabel(),
        latencyMs: Date.now() - startTime,
      }
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}
