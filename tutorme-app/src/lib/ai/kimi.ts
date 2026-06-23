/**
 * Kimi K2.5 AI Provider
 * Moonshot AI's latest model for complex reasoning and long-context tasks
 * Docs: https://platform.moonshot.cn/docs
 */

import { fetchWithTimeoutAndRetry } from '@/lib/ai/fetch-utils'
import { isGeminiActive } from '@/lib/ai/provider'
import { recordLlmUsage, type UsageContext } from '@/lib/ai/usage'
import {
  generateWithGemini,
  chatWithGemini,
  streamGemini,
  generateWithGeminiVision,
} from '@/lib/ai/gemini'

interface KimiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface KimiResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

const KIMI_BASE_URL = 'https://api.moonshot.cn/v1'
const DEFAULT_MODEL = 'kimi-k2.5'

/**
 * Generate text using Kimi K2.5
 */
export async function generateWithKimi(
  prompt: string,
  options: {
    model?: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
    timeoutMs?: number
    retries?: number
    usageContext?: UsageContext
    /** Force a specific provider, bypassing the AI_PROVIDER default (used for fallback). */
    forceProvider?: 'kimi' | 'gemini'
  } = {}
): Promise<string> {
  const useGemini = options.forceProvider ? options.forceProvider === 'gemini' : isGeminiActive()
  if (useGemini) {
    return generateWithGemini(prompt, options)
  }

  const apiKey = process.env.KIMI_API_KEY

  if (!apiKey) {
    throw new Error('KIMI_API_KEY not configured in environment variables')
  }

  const messages: KimiMessage[] = []

  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt })
  }

  messages.push({ role: 'user', content: prompt })

  try {
    const response = await fetchWithTimeoutAndRetry(
      `${KIMI_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || DEFAULT_MODEL,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2048,
        }),
      },
      { timeoutMs: options.timeoutMs, retries: options.retries }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Kimi API error: ${response.status} - ${error}`)
    }

    const data: KimiResponse = await response.json()
    void recordLlmUsage({
      provider: 'kimi',
      model: options.model || DEFAULT_MODEL,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
      context: options.usageContext,
    })
    return data.choices[0]?.message?.content || ''
  } catch (error) {
    console.error('Kimi generation error:', error)
    throw error
  }
}

/**
 * Chat with Kimi K2.5 (multi-turn conversation)
 */
export async function chatWithKimi(
  messages: Array<{ role: string; content: string }>,
  options: {
    model?: string
    temperature?: number
    maxTokens?: number
    timeoutMs?: number
    retries?: number
    usageContext?: UsageContext
    /** Force a specific provider, bypassing the AI_PROVIDER default (used for fallback). */
    forceProvider?: 'kimi' | 'gemini'
  } = {}
): Promise<string> {
  const useGemini = options.forceProvider ? options.forceProvider === 'gemini' : isGeminiActive()
  if (useGemini) {
    return chatWithGemini(messages, options)
  }

  const apiKey = process.env.KIMI_API_KEY

  if (!apiKey) {
    throw new Error('KIMI_API_KEY not configured in environment variables')
  }

  try {
    const response = await fetchWithTimeoutAndRetry(
      `${KIMI_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || DEFAULT_MODEL,
          messages: messages.map(m => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
          })),
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2048,
        }),
      },
      { timeoutMs: options.timeoutMs, retries: options.retries }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Kimi API error: ${response.status} - ${error}`)
    }

    const data: KimiResponse = await response.json()
    void recordLlmUsage({
      provider: 'kimi',
      model: options.model || DEFAULT_MODEL,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
      context: options.usageContext,
    })
    return data.choices[0]?.message?.content || ''
  } catch (error) {
    console.error('Kimi chat error:', error)
    throw error
  }
}

/**
 * Stream responses from Kimi K2.5
 * Useful for real-time chat responses
 */
export async function* streamKimi(
  messages: Array<{ role: string; content: string }>,
  options: {
    model?: string
    temperature?: number
    maxTokens?: number
    timeoutMs?: number
  } = {}
): AsyncGenerator<string, void, unknown> {
  if (isGeminiActive()) {
    yield* streamGemini(messages, options)
    return
  }

  const apiKey = process.env.KIMI_API_KEY

  if (!apiKey) {
    throw new Error('KIMI_API_KEY not configured in environment variables')
  }

  const response = await fetchWithTimeoutAndRetry(
    `${KIMI_BASE_URL}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || DEFAULT_MODEL,
        messages: messages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        stream: true,
      }),
    },
    { timeoutMs: options.timeoutMs, retries: 0 }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Kimi API error: ${response.status} - ${error}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') return

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              yield content
            }
          } catch {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Generate text using Kimi K2.5 with vision (images + text)
 * Supports OpenAI-compatible vision format:
 *   { type: 'text', text: '...' }
 *   { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }
 */
export async function generateWithKimiVision(
  promptItems: Array<
    { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
  >,
  options: {
    model?: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
    timeoutMs?: number
    retries?: number
    usageContext?: UsageContext
  } = {}
): Promise<string> {
  if (isGeminiActive()) {
    return generateWithGeminiVision(promptItems, options)
  }

  const apiKey = process.env.KIMI_API_KEY

  if (!apiKey) {
    throw new Error('KIMI_API_KEY not configured in environment variables')
  }

  const messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content:
      | string
      | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
  }> = []

  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt })
  }

  messages.push({ role: 'user', content: promptItems })

  try {
    const response = await fetchWithTimeoutAndRetry(
      `${KIMI_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || 'moonshot-v1-8k-vision-preview',
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2048,
        }),
      },
      { timeoutMs: options.timeoutMs, retries: options.retries }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Kimi API error: ${response.status} - ${error}`)
    }

    const data: KimiResponse = await response.json()
    void recordLlmUsage({
      provider: 'kimi',
      model: options.model || DEFAULT_MODEL,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
      context: options.usageContext,
    })
    return data.choices[0]?.message?.content || ''
  } catch (error) {
    console.error('Kimi vision generation error:', error)
    throw error
  }
}

/**
 * Get available Kimi models
 */
export function getKimiModels(): Array<{ id: string; name: string; description: string }> {
  return [
    {
      id: 'kimi-k2.5',
      name: 'Kimi K2.5',
      description: 'Latest model with 256K context, best for complex reasoning and long documents',
    },
    {
      id: 'kimi-latest',
      name: 'Kimi Latest',
      description: 'Always points to the latest Kimi model',
    },
  ]
}
