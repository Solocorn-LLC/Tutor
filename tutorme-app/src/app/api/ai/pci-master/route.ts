/**
 * PCI Master API
 * POST /api/ai/pci-master
 * Body: { message: string, sessionId?: string, context?: {...} }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, getSessionForRealm, authOptions } from '@/lib/auth'
import { withRateLimitPreset, handleApiError } from '@/lib/api/middleware'
import { AISecurityManager } from '@/lib/security/ai-sanitization'
import { adkPciMasterChat } from '@/lib/adk-client'
import { generateWithFallback } from '@/lib/agents'
import { parseLlmJson, stripCodeFences } from '@/lib/ai/llm-response'
import { z } from 'zod'

const PciMasterRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().max(160).optional(),
  context: z
    .object({
      type: z.enum(['task', 'assessment']).optional(),
      title: z.string().max(200).optional(),
      content: z.string().max(50000).optional(),
      pci: z.string().max(50000).optional(),
      extensionName: z.string().max(200).optional(),
      sourceDocument: z
        .object({
          fileName: z.string().max(500).optional(),
          fileUrl: z.string().max(2000).optional(),
          mimeType: z.string().max(200).optional(),
        })
        .optional(),
    })
    .optional(),
})

const SYSTEM_PROMPT = `You are a PCI (Pedagogically Correct Instruction) Master - an expert educational AI that crafts and refines Socratic-style instructions.

Your role:
1. Help students discover answers through guided questioning (never give direct answers)
2. Adapt your approach based on the content type (task, assessment, or concept)
3. Use the conversation history to maintain context
4. Provide clear, encouraging, and thought-provoking guidance

Respond in JSON format with this structure:
{
  "response": "your Socratic response here",
  "followUpQuestions": ["question 1", "question 2"],
  "suggestedResources": ["resource 1", "resource 2"],
  "difficulty": "easy|medium|hard",
  "confidence": 0.8
}`

function truncate(value: string | undefined, max: number): string | undefined {
  if (!value) return value
  if (value.length <= max) return value
  return `${value.slice(0, max)}\n...[TRUNCATED]`
}

function buildAdkHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = process.env.ADK_AUTH_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function probeAdk(baseUrl: string): Promise<{
  ok: boolean
  status: 'ok' | 'unreachable' | 'auth_failed' | 'auth_missing' | 'error'
  httpStatus?: number
}> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 3000)
  const url = `${baseUrl.replace(/\/$/, '')}/v1/status`
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: buildAdkHeaders(),
      signal: controller.signal,
    })
    if (res.ok) return { ok: true, status: 'ok' }
    if (res.status === 401 || res.status === 403)
      return { ok: false, status: 'auth_failed', httpStatus: res.status }
    if (res.status === 503) return { ok: false, status: 'auth_missing', httpStatus: res.status }
    return { ok: false, status: 'error', httpStatus: res.status }
  } catch {
    return { ok: false, status: 'unreachable' }
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { response: rateLimitResponse } = await withRateLimitPreset(request, 'aiGenerate')
    if (rateLimitResponse) return rateLimitResponse

    const session =
      (await getSessionForRealm(request, 'tutor')) ?? (await getServerSession(authOptions, request))
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const parsed = PciMasterRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { message, sessionId, context } = parsed.data
    const safeMessage = AISecurityManager.sanitizeAiInput(message)
    if (!safeMessage) {
      return NextResponse.json(
        { error: 'Invalid or empty message after sanitization' },
        { status: 400 }
      )
    }

    const contextBlock = [
      context?.type && `Type: ${context.type}`,
      context?.title && `Title: ${context.title}`,
      context?.content && `Content:\n${truncate(context.content, 12000)}`,
      context?.pci && `Current PCI:\n${truncate(context.pci, 12000)}`,
      context?.extensionName && `Extension Name: ${context.extensionName}`,
      context?.sourceDocument &&
        `Attached Document: ${context.sourceDocument.fileName} (${context.sourceDocument.mimeType})\nURL: ${context.sourceDocument.fileUrl}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    const userPrompt = contextBlock
      ? `Context:\n${contextBlock}\n\nUser: ${safeMessage}`
      : `User: ${safeMessage}`

    const adkBaseUrl = process.env.ADK_BASE_URL?.trim()
    const hasLocalProvider = !!process.env.KIMI_API_KEY || process.env.MOCK_AI === 'true'
    let response: {
      response: string
      conversationId?: string
      parsed?: { response?: string } | null
    }

    if (adkBaseUrl) {
      const probe = await probeAdk(adkBaseUrl)
      if (!probe.ok) {
        if (!hasLocalProvider) {
          const message =
            probe.status === 'unreachable'
              ? 'ADK unreachable'
              : probe.status === 'auth_failed'
                ? 'ADK auth failed'
                : probe.status === 'auth_missing'
                  ? 'ADK auth not configured'
                  : 'ADK error'
          return NextResponse.json(
            { error: message, status: `adk_${probe.status}` },
            { status: 503 }
          )
        }
        console.warn('ADK probe failed; using local provider fallback:', probe)
      }
    } else if (!hasLocalProvider) {
      return NextResponse.json(
        { error: 'No AI providers configured', status: 'no_providers' },
        { status: 503 }
      )
    }

    if (adkBaseUrl) {
      try {
        response = await adkPciMasterChat({
          userId: session.user.id,
          sessionId,
          message: safeMessage,
          context,
        })
      } catch (error) {
        if (!hasLocalProvider) {
          return NextResponse.json(
            { error: 'ADK provider error', status: 'adk_error' },
            { status: 502 }
          )
        }
        console.warn('ADK PCI master failed, falling back to local providers:', error)
        const fallback = await generateWithFallback(`System:\n${SYSTEM_PROMPT}\n\n${userPrompt}`, {
          temperature: 0.7,
          maxTokens: 2048,
          skipCache: true,
        })
        {
          // Gemini wraps JSON in code fences; parse it so we return clean text
          // (and the structured fields) instead of the raw fenced JSON.
          const parsedJson = parseLlmJson<{ response?: string }>(fallback.content)
          response = {
            response:
              parsedJson && typeof parsedJson.response === 'string'
                ? parsedJson.response
                : stripCodeFences(fallback.content),
            parsed: parsedJson ?? null,
          }
        }
      }
    } else {
      const fallback = await generateWithFallback(`System:\n${SYSTEM_PROMPT}\n\n${userPrompt}`, {
        temperature: 0.7,
        maxTokens: 2048,
        skipCache: true,
      })
      response = { response: fallback.content }
    }

    const validation = await AISecurityManager.validateAiResponse(response.response)
    if (!validation.isValid && validation.severity === 'CRITICAL') {
      return handleApiError(
        new Error('AI response failed security validation'),
        'AI response failed security validation',
        'api/ai/pci-master/route.ts'
      )
    }

    return NextResponse.json({
      response: response.response,
      conversationId: response.conversationId,
      parsed: response.parsed ?? null,
    })
  } catch (error) {
    console.error('PCI Master error:', error)
    return handleApiError(error, 'Failed to get PCI Master response', 'api/ai/pci-master/route.ts')
  }
}
