/**
 * POST /api/tutor/support/ai-assistant
 *
 * Tutor-facing endpoint for the support AI Assistant in the Help page.
 * Accepts a conversation history and returns a platform-support reply.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, handleApiError, withRateLimitPreset } from '@/lib/api/middleware'
import { runTutorSupportAssistant, type SupportMessage } from '@/lib/ai/tutor-support-assistant'

export const dynamic = 'force-dynamic'

function isValidMessages(value: unknown): value is SupportMessage[] {
  if (!Array.isArray(value)) return false
  return value.every(
    m =>
      m &&
      typeof m === 'object' &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string'
  )
}

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest) => {
      const { response: rateLimited } = await withRateLimitPreset(req, 'aiGenerate')
      if (rateLimited) return rateLimited

      let body: unknown
      try {
        body = await req.json()
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
      }

      if (!body || typeof body !== 'object') {
        return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 })
      }

      const { messages } = body as Record<string, unknown>

      if (!isValidMessages(messages)) {
        return NextResponse.json(
          { error: 'messages must be an array of {role, content} objects' },
          { status: 400 }
        )
      }

      try {
        const result = await runTutorSupportAssistant(messages)
        return NextResponse.json({
          reply: result.reply,
          guardrailWarnings: result.guardrailWarnings,
        })
      } catch (err: unknown) {
        return handleApiError(
          err,
          'Could not generate support response right now.',
          'tutor-support-assistant'
        )
      }
    },
    { role: 'TUTOR' }
  )
)
