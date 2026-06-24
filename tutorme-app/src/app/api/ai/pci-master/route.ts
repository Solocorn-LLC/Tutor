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
import { generateWithKimiVision } from '@/lib/ai/kimi'
import { parseLlmJson, stripCodeFences } from '@/lib/ai/llm-response'
import {
  guardrailSystemPrompt,
  runTaskGuardrails,
  GUARDRAILED_TEMPERATURE,
  type GuardrailViolation,
} from '@/lib/ai/guardrails'
import { z } from 'zod'

/**
 * Normalize a raw LLM response into clean assistant text + parsed structure.
 * Gemini wraps JSON in code fences, so parse it and surface the `.response` field.
 */
function toCleanResponse(content: string): {
  response: string
  parsed: { response?: string } | null
} {
  const parsedJson = parseLlmJson<{ response?: string }>(content)
  return {
    response:
      parsedJson && typeof parsedJson.response === 'string'
        ? parsedJson.response
        : stripCodeFences(content),
    parsed: parsedJson ?? null,
  }
}

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
  // Rendered page images (data URLs) of an attached PDF, so the model can SEE the
  // document instead of being told only its title. Sent by the builder when a PDF
  // source document is attached.
  pdfPages: z.array(z.string().max(5_000_000)).max(5).optional(),
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

    const { message, sessionId, context, pdfPages } = parsed.data

    // Guardrail wiring: when the builder identifies a PCI domain (task or
    // assessment), swap in the canonical guardrail system prompt and lower the
    // sampling temperature for consistency (TASK-8). Otherwise keep the generic
    // Socratic prompt. Enforcement is warn-only — see the validator pass below.
    const guardrailDomain = context?.type
    const activeSystemPrompt = guardrailDomain
      ? guardrailSystemPrompt(guardrailDomain)
      : SYSTEM_PROMPT
    const activeTemperature = guardrailDomain ? GUARDRAILED_TEMPERATURE : 0.7

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

    const useVision = !!(pdfPages && pdfPages.length > 0)
    if (adkBaseUrl && !useVision) {
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

    if (pdfPages && pdfPages.length > 0) {
      // Vision path: let the model actually SEE the attached document pages so it can
      // summarize/critique real content instead of guessing from the title. Bypasses
      // ADK (text-only) and goes straight to the vision-capable provider (Gemini).
      const promptItems: Array<
        { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
      > = [
        { type: 'text', text: `${activeSystemPrompt}\n\n${userPrompt}` },
        ...pdfPages.map(url => ({ type: 'image_url' as const, image_url: { url } })),
      ]
      const visionText = await generateWithKimiVision(promptItems, {
        temperature: activeTemperature,
        maxTokens: 4096,
        timeoutMs: 60000,
      })
      response = toCleanResponse(visionText)
    } else if (adkBaseUrl) {
      try {
        // Guardrail enforcement on the ADK path. The ADK agent's instructions
        // live in a separate service we can't edit from here, so we (a) pass the
        // canonical guardrail prompt as a `systemPrompt` field for a future
        // guardrail-aware ADK, and (b) — to enforce TODAY regardless of whether
        // the remote service reads that field — prepend the prompt to the
        // message the agent actually consumes. The warn-only validator below
        // still runs on whatever ADK returns.
        const adkMessage = guardrailDomain
          ? `${activeSystemPrompt}\n\n---\nTutor message:\n${safeMessage}`
          : safeMessage
        response = await adkPciMasterChat({
          userId: session.user.id,
          sessionId,
          message: adkMessage,
          systemPrompt: guardrailDomain ? activeSystemPrompt : undefined,
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
        const fallback = await generateWithFallback(
          `System:\n${activeSystemPrompt}\n\n${userPrompt}`,
          {
            temperature: activeTemperature,
            maxTokens: 4096,
            skipCache: true,
          }
        )
        response = toCleanResponse(fallback.content)
      }
    } else {
      const fallback = await generateWithFallback(
        `System:\n${activeSystemPrompt}\n\n${userPrompt}`,
        {
          temperature: activeTemperature,
          maxTokens: 4096,
          skipCache: true,
        }
      )
      response = toCleanResponse(fallback.content)
    }

    // Guardrail (task/assessment) output is a {"reply","pci"} envelope: `reply`
    // is the conversational chat text, `pci` is the finalized rubric (non-empty
    // only after the tutor approves finalizing). Extract both so the chat never
    // shows a raw spec and the builder can write a clean PCI to the field.
    let pciDraft = ''
    if (guardrailDomain) {
      const env = parseLlmJson<{ reply?: string; pci?: string }>(response.response)
      if (env && (typeof env.reply === 'string' || typeof env.pci === 'string')) {
        if (typeof env.reply === 'string' && env.reply.trim()) {
          response.response = env.reply.trim()
        }
        if (typeof env.pci === 'string') pciDraft = env.pci.trim()
      }
    }

    const validation = await AISecurityManager.validateAiResponse(response.response)
    if (!validation.isValid && validation.severity === 'CRITICAL') {
      return handleApiError(
        new Error('AI response failed security validation'),
        'AI response failed security validation',
        'api/ai/pci-master/route.ts'
      )
    }

    // Warn-only guardrail validation. We never block here — violations are
    // logged server-side and returned as `guardrailWarnings` so the builder can
    // surface them to the tutor. Flip to blocking later by gating on severity.
    let guardrailWarnings: GuardrailViolation[] = []
    if (guardrailDomain === 'task') {
      const finalizing = /\b(confirm|finali[sz]e|approve|looks good|go ahead|activate)\b/i.test(
        safeMessage
      )
      guardrailWarnings = runTaskGuardrails(response.response, {
        sourceContent: context?.content,
        finalizing,
        finalizedPci: pciDraft,
      }).violations
      if (guardrailWarnings.length > 0) {
        console.warn(
          `[guardrails] pci-master task violations (${guardrailWarnings.length}):`,
          guardrailWarnings.map(v => `${v.ruleId} ${v.severity}`).join(', ')
        )
      }
    }

    return NextResponse.json({
      response: response.response,
      pciDraft,
      conversationId: response.conversationId,
      parsed: response.parsed ?? null,
      guardrailWarnings,
    })
  } catch (error) {
    console.error('PCI Master error:', error)
    return handleApiError(error, 'Failed to get PCI Master response', 'api/ai/pci-master/route.ts')
  }
}
