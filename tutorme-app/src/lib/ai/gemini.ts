/**
 * Gemini AI Provider (Google Generative Language REST API)
 *
 * Implemented with plain fetch (no SDK dependency) against
 * https://generativelanguage.googleapis.com/v1beta. Exposes the same shapes the
 * Kimi helpers use so the rest of the app can delegate transparently.
 *
 * Env: GEMINI_API_KEY (required), GEMINI_MODEL (optional, default gemini-2.5-flash).
 */

import { fetchWithTimeoutAndRetry } from '@/lib/ai/fetch-utils'

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL = 'gemini-2.5-flash'

type GenOptions = {
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  timeoutMs?: number
  retries?: number
}

interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
}

/**
 * Resolve which Gemini model to use. Kimi model ids (e.g. "kimi-k2.5") passed by
 * legacy callers are ignored in favor of a Gemini model.
 */
function resolveModel(requested?: string): string {
  if (requested && requested.startsWith('gemini')) return requested
  return process.env.GEMINI_MODEL || DEFAULT_MODEL
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not configured in environment variables')
  return key
}

function extractText(data: GeminiResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? []
  return parts
    .map(p => p.text || '')
    .join('')
    .trim()
}

/** Convert a data: URL (data:image/png;base64,XXXX) into a Gemini inline_data part. */
function dataUrlToInlinePart(url: string): GeminiPart | null {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(url)
  if (!match) return null
  return { inline_data: { mime_type: match[1], data: match[2] } }
}

/**
 * Map an OpenAI/Kimi-style message list to Gemini contents + systemInstruction.
 * system messages are merged into systemInstruction; assistant -> model.
 */
function toGeminiContents(messages: Array<{ role: string; content: string }>): {
  contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }>
  systemInstruction?: { parts: GeminiPart[] }
} {
  const systemTexts: string[] = []
  const contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }> = []
  for (const m of messages) {
    if (m.role === 'system') {
      systemTexts.push(m.content)
      continue
    }
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })
  }
  return {
    contents,
    systemInstruction: systemTexts.length
      ? { parts: [{ text: systemTexts.join('\n\n') }] }
      : undefined,
  }
}

async function callGemini(
  body: Record<string, unknown>,
  model: string,
  opts: { timeoutMs?: number; retries?: number }
): Promise<string> {
  const res = await fetchWithTimeoutAndRetry(
    `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${apiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { timeoutMs: opts.timeoutMs, retries: opts.retries }
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Gemini API error: ${res.status} - ${error}`)
  }

  const data: GeminiResponse = await res.json()
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the prompt: ${data.promptFeedback.blockReason}`)
  }
  return extractText(data)
}

function generationConfig(o: GenOptions): Record<string, unknown> {
  const cfg: Record<string, unknown> = {
    temperature: o.temperature ?? 0.7,
    maxOutputTokens: o.maxTokens ?? 2048,
  }
  // Disable "thinking" on 2.5 models by default: it adds multi-second latency and
  // consumes the maxOutputTokens budget (risking empty/truncated answers). Set
  // GEMINI_THINKING_BUDGET to a positive number to re-enable for the whole app.
  const thinkingBudget = Number(process.env.GEMINI_THINKING_BUDGET ?? 0)
  cfg.thinkingConfig = { thinkingBudget: Number.isFinite(thinkingBudget) ? thinkingBudget : 0 }
  return cfg
}

/** Single-prompt generation. */
export async function generateWithGemini(
  prompt: string,
  options: GenOptions = {}
): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: generationConfig(options),
  }
  if (options.systemPrompt) {
    body.systemInstruction = { parts: [{ text: options.systemPrompt }] }
  }
  try {
    return await callGemini(body, resolveModel(options.model), options)
  } catch (error) {
    console.error('Gemini generation error:', error)
    throw error
  }
}

/** Multi-turn chat. */
export async function chatWithGemini(
  messages: Array<{ role: string; content: string }>,
  options: GenOptions = {}
): Promise<string> {
  const { contents, systemInstruction } = toGeminiContents(messages)
  const body: Record<string, unknown> = { contents, generationConfig: generationConfig(options) }
  if (systemInstruction) body.systemInstruction = systemInstruction
  try {
    return await callGemini(body, resolveModel(options.model), options)
  } catch (error) {
    console.error('Gemini chat error:', error)
    throw error
  }
}

/** Vision: text + image (data URL) parts in a single user turn. */
export async function generateWithGeminiVision(
  promptItems: Array<
    { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
  >,
  options: GenOptions = {}
): Promise<string> {
  const parts: GeminiPart[] = []
  for (const item of promptItems) {
    if (item.type === 'text') {
      parts.push({ text: item.text })
    } else {
      const inline = dataUrlToInlinePart(item.image_url.url)
      if (inline) parts.push(inline)
    }
  }
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: generationConfig(options),
  }
  if (options.systemPrompt) body.systemInstruction = { parts: [{ text: options.systemPrompt }] }
  try {
    return await callGemini(body, resolveModel(options.model), options)
  } catch (error) {
    console.error('Gemini vision generation error:', error)
    throw error
  }
}

/** Streaming generation (SSE). Yields text deltas. */
export async function* streamGemini(
  messages: Array<{ role: string; content: string }>,
  options: GenOptions = {}
): AsyncGenerator<string, void, unknown> {
  const { contents, systemInstruction } = toGeminiContents(messages)
  const body: Record<string, unknown> = { contents, generationConfig: generationConfig(options) }
  if (systemInstruction) body.systemInstruction = systemInstruction

  const res = await fetchWithTimeoutAndRetry(
    `${GEMINI_BASE_URL}/models/${resolveModel(options.model)}:streamGenerateContent?alt=sse&key=${apiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { timeoutMs: options.timeoutMs, retries: 0 }
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Gemini API error: ${res.status} - ${error}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')
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
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data) as GeminiResponse
          const text = parsed.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || ''
          if (text) yield text
        } catch {
          // ignore partial/non-JSON keepalive chunks
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
