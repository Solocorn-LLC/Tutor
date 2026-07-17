/**
 * Session Tutor AI endpoint — advisor-only assistant for tutors in Test/Live mode.
 *
 * Security:
 *  - Tutor-authenticated + CSRF protected.
 *  - Rate-limited under the aiGenerate preset.
 *  - PCI is loaded from the request (and optionally from BuilderTask as a fallback).
 *  - Input guardrails block auto-send/auto-grade instructions before they reach the LLM.
 *  - Output guardrails catch any remaining "sent to students" claims.
 *  - Every interaction is logged to AdminAuditLog for visibility.
 */

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { withAuth, withCsrf, withRateLimitPreset, handleApiError } from '@/lib/api/middleware'
import { chatWithFallback } from '@/lib/agents/orchestrator-llm'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, adminAuditLog } from '@/lib/db/schema'
import { getClientIp } from '@/lib/security/admin-ip'
import { normalizePciSpec, PCI_SPEC_FIELDS } from '@/lib/assessment/pci-spec'
import {
  buildSessionTutorSystemPrompt,
  type SessionTutorContext,
} from '@/lib/ai/session-tutor-prompts'
import {
  SessionTutorRequestSchema,
  sanitizeSessionTutorMessage,
  checkSessionTutorInputGuardrails,
  applySessionTutorOutputGuardrails,
  type SessionTutorHistoryMessage,
} from '@/lib/ai/session-tutor-guardrails'

async function logSessionTutorInteraction(params: {
  userId: string
  message: string
  response: string
  context: SessionTutorContext
  violations: Array<{ ruleId: string; message: string; severity: 'warning' | 'error' }>
  req: NextRequest
}) {
  try {
    await drizzleDb.insert(adminAuditLog).values({
      auditLogId: nanoid(),
      adminId: params.userId,
      action: 'SESSION_TUTOR_CHAT',
      resourceType: 'BuilderTask',
      resourceId: params.context.taskId ?? null,
      newState: {
        message: params.message,
        response: params.response,
        taskName: params.context.taskName,
        courseName: params.context.courseName,
        extensionName: params.context.extensionName,
      },
      metadata: {
        guardrailViolations: params.violations,
      },
      ipAddress: getClientIp(params.req as unknown as Request),
      userAgent: params.req.headers.get('user-agent') ?? null,
    })
  } catch (err) {
    // Logging is best-effort; never fail the tutor's request because of it.
    console.warn('[session-tutor] audit log failed (non-critical):', err)
  }
}

async function enrichContextFromTask(context: SessionTutorContext): Promise<SessionTutorContext> {
  if (!context.taskId || (context.taskPci && context.taskPciSpec)) {
    return context
  }

  try {
    const [row] = await drizzleDb
      .select({
        title: builderTask.title,
        pci: builderTask.pci,
        pciSpec: builderTask.pciSpec,
      })
      .from(builderTask)
      .where(eq(builderTask.taskId, context.taskId))
      .limit(1)

    if (!row) return context

    const next: SessionTutorContext = { ...context }
    if (!next.taskName && row.title) next.taskName = row.title
    if (!next.taskPci && typeof row.pci === 'string') next.taskPci = row.pci
    if (!next.taskPciSpec && row.pciSpec) {
      const spec = normalizePciSpec(row.pciSpec)
      if (spec) {
        next.taskPciSpec = Object.fromEntries(
          PCI_SPEC_FIELDS.map(f => [f.key, spec[f.key]]).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )
      }
    }
    return next
  } catch (err) {
    console.warn('[session-tutor] task PCI load failed (non-critical):', err)
    return context
  }
}

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
      try {
        const { response: rateLimitResponse } = await withRateLimitPreset(
          req,
          'aiGenerate',
          session.user.id
        )
        if (rateLimitResponse) return rateLimitResponse

        const body = await req.json().catch(() => null)
        const parsed = SessionTutorRequestSchema.safeParse(body)
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'Invalid request body', details: parsed.error.flatten() },
            { status: 400 }
          )
        }

        const { message, context, history } = parsed.data
        const userMessage = sanitizeSessionTutorMessage(message)
        if (!userMessage) {
          return NextResponse.json({ error: 'Message is empty' }, { status: 400 })
        }

        // Input guardrails — block auto-send / auto-grade / harmful instructions.
        const inputCheck = checkSessionTutorInputGuardrails(userMessage, context)
        if (inputCheck.blocked) {
          await logSessionTutorInteraction({
            userId: session.user.id,
            message: userMessage,
            response: inputCheck.response,
            context,
            violations: [
              {
                ruleId: inputCheck.rule ?? 'INPUT_REFUSAL',
                message: 'Request blocked by input guardrail',
                severity: 'error',
              },
            ],
            req,
          })
          return NextResponse.json({ response: inputCheck.response, guardrail: inputCheck.rule })
        }

        const enrichedContext = await enrichContextFromTask(context)
        const systemPrompt = buildSessionTutorSystemPrompt(enrichedContext)

        const messages = [
          { role: 'system', content: systemPrompt },
          ...(history ?? []).map((m: SessionTutorHistoryMessage) => ({
            role: m.role === 'ai' ? 'assistant' : 'user',
            content: m.content,
          })),
          { role: 'user', content: userMessage },
        ]

        const aiResult = await chatWithFallback(
          messages as Array<{ role: string; content: string }>,
          {
            temperature: 0.6,
            maxTokens: 800,
            skipCache: true,
            usageContext: { feature: 'session-tutor' },
          }
        )

        const output = applySessionTutorOutputGuardrails(aiResult.content, enrichedContext)

        await logSessionTutorInteraction({
          userId: session.user.id,
          message: userMessage,
          response: output.reply,
          context: enrichedContext,
          violations: output.violations,
          req,
        })

        return NextResponse.json({
          response: output.reply,
          guardrailWarnings: output.violations,
          provider: aiResult.provider,
        })
      } catch (error) {
        return handleApiError(error, 'Failed to get AI response', 'api/ai/session-tutor')
      }
    },
    { role: 'TUTOR' }
  )
)
