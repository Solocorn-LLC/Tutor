/**
 * AI Provider clients for Solocorn Chat
 * Supports Kimi (primary)
 */

import { SOLOCORN_SYSTEM_PROMPT } from './system-prompt'
import { isGeminiActive } from '@/lib/ai/provider'
import { streamGemini } from '@/lib/ai/gemini'

// Configuration
const KIMI_API_KEY = process.env.KIMI_API_KEY
const KIMI_BASE_URL = 'https://api.moonshot.cn/v1'
const KIMI_MODEL = 'kimi-k2.5'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamResponse {
  content: string
  done: boolean
}

/**
 * Stream chat completion from Kimi API
 */
export async function* streamKimiResponse(
  messages: ChatMessage[],
  abortSignal?: AbortSignal
): AsyncGenerator<StreamResponse> {
  if (isGeminiActive()) {
    for await (const chunk of streamGemini(messages)) {
      yield { content: chunk, done: false }
    }
    yield { content: '', done: true }
    return
  }

  if (!KIMI_API_KEY) {
    throw new Error('KIMI_API_KEY not configured')
  }

  const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KIMI_API_KEY}`,
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      messages,
      temperature: 0.8,
      max_tokens: 2048,
      stream: true,
    }),
    signal: abortSignal,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Kimi API error: ${response.status} ${error}`)
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
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') {
          yield { content: '', done: true }
          return
        }

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content || ''
          if (content) {
            yield { content, done: false }
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  yield { content: '', done: true }
}

/**
 * Stream from Kimi
 */
export async function* streamAIResponse(
  messages: ChatMessage[],
  abortSignal?: AbortSignal
): AsyncGenerator<StreamResponse> {
  if (!isGeminiActive() && !KIMI_API_KEY) {
    throw new Error('No AI provider configured (set GEMINI_API_KEY or KIMI_API_KEY)')
  }
  yield* streamKimiResponse(messages, abortSignal)
}

/**
 * Build messages array with system prompt
 */
export function buildMessages(
  userMessage: string,
  conversationHistory: ChatMessage[],
  language: string
): ChatMessage[] {
  const languageInstruction = language !== 'en' ? `\n\nRespond in ${language}.` : ''

  return [
    { role: 'system', content: SOLOCORN_SYSTEM_PROMPT + languageInstruction },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ]
}
