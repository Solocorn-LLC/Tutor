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
import { normalizePciSpec, PCI_SPEC_FIELDS, type PciSpec } from '@/lib/assessment/pci-spec'
import { signalsPciFinalize } from '@/lib/assessment/pci-finalize'
import {
  guardrailSystemPrompt,
  runTaskGuardrails,
  GUARDRAILED_TEMPERATURE,
  type GuardrailViolation,
} from '@/lib/ai/guardrails'
import { PCI_MASTER_SYSTEM_PROMPT, pciMasterAgent } from '@/lib/ai/agent-kit/agents/pci-master'
import { runAgent } from '@/lib/ai/agent-kit/runner'
import { z } from 'zod'

/**
 * Flag-gated cutover: route the LOCAL text generation through the agent-kit
 * runner so guardrail selection + post-validation are owned by the kit uniformly.
 * Default OFF — prod behavior is unchanged until this is flipped after review.
 * The vision and ADK paths are unaffected. Read per-request (not at module load)
 * so it can be toggled by a revision's env without a code change, and is testable.
 */
function agentKitPciMasterEnabled(): boolean {
  return process.env.AGENT_KIT_PCI_MASTER === 'true'
}

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
  // Prior conversation turns, so the local/vision provider paths (which have no
  // server-side memory) can respond in context instead of restarting each turn.
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      })
    )
    .max(20)
    .optional(),
  context: z
    .object({
      type: z.enum(['task', 'assessment']).optional(),
      title: z.string().max(200).optional(),
      content: z.string().max(50000).optional(),
      pci: z.string().max(50000).optional(),
      // Tiered context for task PCI: full course, the containing lesson, and the
      // specific task content. Sent on the first turn only.
      courseContext: z.string().max(80000).optional(),
      lessonContext: z.string().max(60000).optional(),
      extensionName: z.string().max(200).optional(),
      sourceDocument: z
        .object({
          fileName: z.string().max(500).optional(),
          fileUrl: z.string().max(2000).optional(),
          mimeType: z.string().max(200).optional(),
          extractedText: z.string().max(100000).optional(),
        })
        .optional(),
      // The captured "policy so far" (incl. tutor inline corrections), sent back
      // so the model treats it as authoritative and carries it forward.
      capturedSoFar: z.record(z.string(), z.string()).optional(),
      // Assessment DMI digest (per-question marks + rubric, no answers) so the
      // marking policy is built with the real questions/marks/rubrics in view.
      markingScheme: z.string().max(16000).optional(),
      // The resolved PCI-chat variant (derived client-side). Selects per-type
      // steering appended to the domain prompt: assessments use `composition`
      // (from the DMI question mix) + `documentKind`; tasks use `documentKind`
      // only (`composition` is ignored for tasks).
      variant: z
        .object({
          composition: z.enum(['objective', 'free_response', 'mixed']).optional(),
          documentKind: z.enum(['question_paper', 'study_material']).optional(),
        })
        .optional(),
    })
    .optional(),
  // Rendered page images (data URLs) of an attached PDF, so the model can SEE the
  // document instead of being told only its title. Sent by the builder when a PDF
  // source document is attached.
  pdfPages: z.array(z.string().max(5_000_000)).max(5).optional(),
})

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
    const session =
      (await getSessionForRealm(request, 'tutor')) ?? (await getServerSession(authOptions, request))
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Tutor-only course-builder PCI chat.
    if (session.user.role !== 'TUTOR' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Rate-limit per authenticated user, not per IP, so co-located tutors behind
    // one NAT/proxy don't share a single AI quota.
    const { response: rateLimitResponse } = await withRateLimitPreset(
      request,
      'aiGenerate',
      `user:${session.user.id}`
    )
    if (rateLimitResponse) return rateLimitResponse

    const body = await request.json().catch(() => null)
    const parsed = PciMasterRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { message, sessionId, context, pdfPages, history } = parsed.data

    // Guardrail wiring: when the builder identifies a PCI domain (task or
    // assessment), swap in the canonical guardrail system prompt and lower the
    // sampling temperature for consistency (TASK-8). Otherwise keep the generic
    // Socratic prompt. Enforcement is warn-only — see the validator pass below.
    const guardrailDomain = context?.type
    const activeSystemPrompt = guardrailDomain
      ? guardrailSystemPrompt(guardrailDomain, context?.variant)
      : PCI_MASTER_SYSTEM_PROMPT
    const activeTemperature = guardrailDomain ? GUARDRAILED_TEMPERATURE : 0.7

    // Observability: record which per-type variant actually fired, so the
    // composition thresholds / addendum wording can be tuned from real usage.
    if (guardrailDomain) {
      console.log(
        `[pci-master] domain=${guardrailDomain} composition=${context?.variant?.composition ?? '-'} documentKind=${context?.variant?.documentKind ?? '-'}`
      )
    }

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
      context?.courseContext && `Course Context:\n${truncate(context.courseContext, 25000)}`,
      context?.lessonContext && `Lesson Context:\n${truncate(context.lessonContext, 20000)}`,
      context?.sourceDocument?.extractedText &&
        `Attached Document Extracted Text:\n${truncate(context.sourceDocument.extractedText, 40000)}`,
      context?.sourceDocument &&
        `Attached Document: ${context.sourceDocument.fileName} (${context.sourceDocument.mimeType})\nURL: ${context.sourceDocument.fileUrl}`,
      context?.content && `Task Content:\n${truncate(context.content, 12000)}`,
      context?.pci && `Current PCI:\n${truncate(context.pci, 12000)}`,
      context?.extensionName && `Extension Name: ${context.extensionName}`,
      context?.markingScheme &&
        `Marking scheme already set up (the DMI — the questions, sections, per-question marks, and any rubrics). Treat this as KNOWN: never ask the tutor what the questions/sections/types are or how many marks a question is worth. Use it to build a GENERAL marking policy for the whole assessment (not a per-question interview), and do NOT copy per-question rubric text into the policy:\n${truncate(
          context.markingScheme,
          12000
        )}`,
      context?.capturedSoFar &&
        Object.keys(context.capturedSoFar).length > 0 &&
        `Policy captured so far (the tutor may have corrected these — treat them as AUTHORITATIVE and carry these exact values forward in "specSoFar"; do not overwrite or re-capture a stale value):\n${JSON.stringify(
          context.capturedSoFar
        )}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    // Prior turns as a readable transcript so the model continues the
    // conversation instead of treating each message as a cold start (ADK keeps
    // its own memory by sessionId, so this only matters for the local/vision
    // paths; harmless there since it's the same history). The current message is
    // appended by the caller's thread, so `history` excludes it.
    const historyBlock =
      history && history.length > 0
        ? history
            .map(h => `${h.role === 'assistant' ? 'Assistant' : 'Tutor'}: ${h.content}`)
            .join('\n')
        : ''

    const userPrompt = [
      contextBlock && `Context:\n${contextBlock}`,
      historyBlock && `Conversation so far:\n${historyBlock}`,
      `User: ${safeMessage}`,
    ]
      .filter(Boolean)
      .join('\n\n')

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

    // Timeout + retry budget for the upstream model call. Moonshot/Kimi is the
    // sole provider, so a slow or 5xx/429 response has no second provider to fall
    // back to — bound each attempt and retry a couple of times before giving up.
    // Kept well under Cloud Run's 300s request timeout (worst case 2×45s = 90s)
    // so a slow turn returns a clean error instead of the connection dropping
    // and surfacing as "Load failed" in the chat.
    const GEN_TIMEOUT_MS = 45_000
    const GEN_RETRIES = 2
    const fallbackOptions = {
      temperature: activeTemperature,
      maxTokens: 4096,
      skipCache: true,
      timeoutMs: GEN_TIMEOUT_MS,
      retries: GEN_RETRIES,
    }

    // Local (text) generation — used by both the else branch and the ADK-failure
    // fallback. When the flag is ON it runs through the agent-kit runner, which
    // owns guardrail-prompt selection (per-request domain) + temperature; the
    // injected `generate` preserves skipCache/timeout/retries that the default
    // adapter doesn't carry. When OFF it's the original direct call, byte-for-byte.
    const generateLocal = async (): Promise<{
      response: string
      parsed?: { response?: string } | null
    }> => {
      if (agentKitPciMasterEnabled()) {
        const agentResult = await runAgent(
          pciMasterAgent,
          {
            message: userPrompt,
            context: { userId: session.user.id, guardrailDomain, variant: context?.variant },
          },
          {
            generate: async ({ system, user, temperature, maxTokens }) => {
              const prompt = system ? `${system}\n\n<user_input>\n${user}\n</user_input>` : user
              const r = await generateWithFallback(prompt, {
                temperature,
                maxTokens,
                skipCache: true,
                timeoutMs: GEN_TIMEOUT_MS,
                retries: GEN_RETRIES,
              })
              return { text: r.content }
            },
          }
        )
        return toCleanResponse(agentResult.text)
      }
      const fallback = await generateWithFallback(
        `System:\n${activeSystemPrompt}\n\n${userPrompt}`,
        fallbackOptions
      )
      return toCleanResponse(fallback.content)
    }

    try {
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
          timeoutMs: GEN_TIMEOUT_MS,
          retries: GEN_RETRIES,
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
          response = await generateLocal()
        }
      } else {
        response = await generateLocal()
      }
    } catch (providerError) {
      // The upstream model failed (timeout / 429 / 5xx) after retries. Surface a
      // retryable 503 with a friendly message instead of a generic 500 — the PCI
      // chat shows this text and the tutor can simply send again.
      console.error('PCI Master provider error:', providerError)
      return NextResponse.json(
        {
          error: 'The AI model is briefly unavailable. Please try again in a moment.',
          status: 'provider_unavailable',
          retryable: true,
        },
        { status: 503, headers: { 'Retry-After': '5' } }
      )
    }

    // Guardrail (task/assessment) output is a {"reply","pci"} envelope: `reply`
    // is the conversational chat text, `pci` is the finalized rubric (non-empty
    // only after the tutor approves finalizing). Extract both so the chat never
    // shows a raw spec and the builder can write a clean PCI to the field.
    // TASK-5 (Confirmation): only an explicit finalize request flags this — the
    // tutor's "Apply to PCI" click is the real gate. See signalsPciFinalize for
    // why generic agreement words are excluded (they collide with confirm-summary).
    const tutorSignaledFinalize = signalsPciFinalize(safeMessage)

    let pciDraft = ''
    let pciSpec: PciSpec | null = null
    // Partial structured policy captured SO FAR this turn (may be incomplete;
    // NOT a finalization). Drives the live "policy so far" panel in the chat.
    let pciSpecSoFar: PciSpec | null = null
    let pciUnconfirmed = false
    if (guardrailDomain) {
      const env = parseLlmJson<{
        reply?: string
        pci?: string
        spec?: unknown
        specSoFar?: unknown
      }>(response.response)
      if (env && (typeof env.reply === 'string' || typeof env.pci === 'string')) {
        if (typeof env.reply === 'string' && env.reply.trim()) {
          response.response = env.reply.trim()
        }
        if (typeof env.pci === 'string') pciDraft = env.pci.trim()
        // TASK-6: the structured mirror of the finalized rubric.
        pciSpec = normalizePciSpec(env.spec)
        // Running capture for the live "policy so far" panel. The model is
        // unreliable about the dedicated `specSoFar` key — it often puts captured
        // fields in the intuitive `spec` field instead, or omits `specSoFar`
        // entirely — which left the panel empty even though the tutor's answers
        // WERE captured. So read BOTH and merge (specSoFar wins on conflict); the
        // reducer then accumulates across turns. The panel now fills whenever the
        // model captured anything structured, not only on the exact key.
        const asObj = (v: unknown): Record<string, unknown> =>
          v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
        pciSpecSoFar = normalizePciSpec({ ...asObj(env.spec), ...asObj(env.specSoFar) })
      }
      // A rubric the model emitted without the tutor typing an explicit approval
      // this turn is still OFFERED (so the "Apply to PCI" button reliably appears
      // whenever there's something to apply) but flagged `pciUnconfirmed`. The
      // tutor's explicit Apply click is the TASK-5 confirmation — nothing is
      // applied without it, so this never silently finalizes.
      if ((pciDraft || pciSpec) && !tutorSignaledFinalize) {
        pciUnconfirmed = true
      }
    }

    // Guaranteed population (bulletproofing): if the model returned NOTHING
    // structured this turn but the tutor has been answering marking questions,
    // extract the captured policy from the conversation ourselves so the "policy
    // so far" panel still fills. Bounded — only on an empty result, only once
    // there's real back-and-forth, and only for a substantive tutor message.
    if (
      guardrailDomain &&
      !pciSpecSoFar &&
      (history?.length ?? 0) >= 2 &&
      safeMessage.length > 12
    ) {
      try {
        const convo = [
          ...(history ?? []).map(
            h => `${h.role === 'assistant' ? 'Assistant' : 'Tutor'}: ${h.content}`
          ),
          `Tutor: ${safeMessage}`,
        ]
          .join('\n')
          .slice(-8000)
        const keys = PCI_SPEC_FIELDS.map(f => f.key).join(', ')
        const extractPrompt = `From this conversation between an assistant and a tutor setting up a marking policy, extract ONLY what the TUTOR has actually stated about how answers should be marked. Return ONE JSON object using any of these optional keys (omit anything the tutor has not stated): ${keys}. Each value a short plain phrase in the tutor's own meaning. No prose, no code fences.\n\nConversation:\n${convo}`
        const extracted = await generateWithFallback(extractPrompt, {
          temperature: 0.1,
          maxTokens: 500,
          skipCache: true,
          timeoutMs: 20_000,
          retries: 1,
        })
        pciSpecSoFar = normalizePciSpec(parseLlmJson(extracted.content))
      } catch (err) {
        console.warn('[pci-master] specSoFar fallback extraction failed:', err)
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
      guardrailWarnings = runTaskGuardrails(response.response, {
        sourceContent: context?.content,
        finalizing: tutorSignaledFinalize,
        finalizedPci: pciDraft,
      }).violations
      if (guardrailWarnings.length > 0) {
        console.warn(
          `[guardrails] pci-master task violations (${guardrailWarnings.length}):`,
          guardrailWarnings.map(v => `${v.ruleId} ${v.severity}`).join(', ')
        )
      }
    } else if (guardrailDomain === 'assessment') {
      // Warn-only hygiene for the assessment marking-policy chat. The DMI's
      // STRUCTURAL guardrails (question-wording fidelity, rubric/marks totals,
      // evaluation-layer separation) run in generate-dmi, where the parsed
      // question structure exists. In this CONVERSATIONAL chat the relevant
      // checks are the domain-agnostic ones — fabricated evaluation policy
      // (marks/retries/penalties not in the source), false certainty, and
      // keeping the reply conversational. Reuse those and surface them under a
      // neutral PCI-* label so they aren't misattributed to a TASK-* rule.
      guardrailWarnings = runTaskGuardrails(response.response, {
        sourceContent: context?.content,
        finalizing: tutorSignaledFinalize,
        finalizedPci: pciDraft,
      }).violations.map(v => ({ ...v, ruleId: v.ruleId.replace(/^TASK-/, 'PCI-') }))
      if (guardrailWarnings.length > 0) {
        console.warn(
          `[guardrails] pci-master assessment violations (${guardrailWarnings.length}):`,
          guardrailWarnings.map(v => `${v.ruleId} ${v.severity}`).join(', ')
        )
      }
    }

    return NextResponse.json({
      response: response.response,
      pciDraft,
      // TASK-6: the finalized rubric in structured form (null until finalized).
      pciSpec,
      // Partial policy captured so far (may be incomplete; not a finalization).
      pciSpecSoFar,
      // True when the model proposed a finalized rubric but the tutor hasn't
      // signalled approval — the UI can prompt them to confirm before applying.
      pciUnconfirmed,
      conversationId: response.conversationId,
      parsed: response.parsed ?? null,
      guardrailWarnings,
    })
  } catch (error) {
    console.error('PCI Master error:', error)
    return handleApiError(error, 'Failed to get PCI Master response', 'api/ai/pci-master/route.ts')
  }
}
