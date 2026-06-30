/**
 * AI Chat API with Subject Context
 * Chat with the AI tutor using Socratic method and subject-specific knowledge
 *
 * POST /api/ai/chat
 * Body: { message: string, subject?: string, context?: {...} }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { withRateLimitPreset, handleApiError } from '@/lib/api/middleware'
import { z } from 'zod'
import { AISecurityManager } from '@/lib/security/ai-sanitization'
import { runTutorChat } from '@/lib/agents/tutor-chat-service'
import { hasActiveAssessment } from '@/lib/assessment/active-assessment'

const AIChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  subject: z.string().max(80).default('general'),
  context: z.record(z.string(), z.unknown()).default({}),
  conversationId: z.string().max(128).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const { response: rateLimitResponse } = await withRateLimitPreset(request, 'aiGenerate')
    if (rateLimitResponse) return rateLimitResponse

    const session = await getServerSession(authOptions, request)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => null)
    const parsed = AIChatRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const { message, subject, context: _context, conversationId } = parsed.data

    const safeMessage = AISecurityManager.sanitizeAiInput(message)
    if (!safeMessage) {
      return NextResponse.json(
        { error: 'Invalid or empty message after sanitization' },
        { status: 400 }
      )
    }

    const convoKey = conversationId || `${session.user.id}:${subject}`

    const previousMessages =
      typeof _context === 'object' &&
      _context &&
      'previousMessages' in _context &&
      Array.isArray((_context as any).previousMessages)
        ? (_context as any).previousMessages
        : []

    // ASMT-15: refuse to solve assessment questions while one is in progress.
    const assessmentActive = await hasActiveAssessment(session.user.id)

    const response = await runTutorChat({
      userId: session.user.id,
      message: safeMessage,
      subject,
      chatHistory: previousMessages,
      assessmentActive,
    })

    // Validate AI response before returning
    const validation = await AISecurityManager.validateAiResponse(response.response)
    if (!validation.isValid && validation.severity === 'CRITICAL') {
      return handleApiError(
        new Error('AI response failed security validation'),
        'AI response failed security validation',
        'api/ai/chat/route.ts'
      )
    }

    return NextResponse.json({
      response: response.response,
      conversationId: convoKey,
      provider: response.provider,
      latencyMs: response.latencyMs,
      hintType: response.hintType,
      relevantConcepts: response.relevantConcepts,
      suggestedNextSteps: response.suggestedNextSteps,
    })
  } catch (error) {
    console.error('AI chat error:', error)
    return handleApiError(error, 'Failed to get AI response', 'api/ai/chat/route.ts')
  }
}

// Get available subjects
export async function GET() {
  const { getAvailableSubjects } = await import('@/lib/ai/subjects')

  return NextResponse.json({
    subjects: getAvailableSubjects(),
  })
}
