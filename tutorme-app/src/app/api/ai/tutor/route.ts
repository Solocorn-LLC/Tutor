/**
 * Modular AI Tutor API
 * Supports teaching modes and subject-specific prompts
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTeachingModes } from '@/lib/ai/teaching-prompts'
import { withRateLimitPreset, handleApiError } from '@/lib/api/middleware'
import { z } from 'zod'
import { runTutorChat } from '@/lib/agents/tutor-chat-service'
import { hasActiveAssessment } from '@/lib/assessment/active-assessment'
import { getServerSession, authOptions } from '@/lib/auth'

type TutorMode = 'socratic' | 'direct' | 'lesson' | 'practice'

const TutorRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  subject: z.string().min(1).max(80),
  topic: z.string().max(120).nullable().optional(),
  mode: z.enum(['socratic', 'direct', 'hint']).default('socratic'),
  teachingAge: z.number().int().min(5).max(100).default(15),
  voiceGender: z.enum(['female', 'male']).default('female'),
  voiceAccent: z.string().max(32).default('US'),
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
    const parsed = TutorRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const {
      message,
      subject,
      topic = null,
      mode,
      teachingAge,
      voiceGender,
      voiceAccent,
      conversationId,
    } = parsed.data

    const teachingMode: TutorMode = mode === 'hint' ? 'socratic' : mode

    // ASMT-15: refuse to solve assessment questions while one is in progress.
    const assessmentActive = await hasActiveAssessment(session.user.id)

    const response = await runTutorChat({
      userId: session.user.id,
      message,
      subject,
      topic,
      teachingMode,
      teachingAge,
      voiceGender,
      voiceAccent,
      chatHistory: [],
      assessmentActive,
    })

    return NextResponse.json({
      success: true,
      response: response.response,
      mode,
      isSocratic: teachingMode === 'socratic',
      whiteboardItems: response.whiteboardItems,
      conversationId: conversationId || `tutor-${subject}-${Date.now()}`,
    })
  } catch (error) {
    return handleApiError(error, 'Failed to get AI response', 'api/ai/tutor/route.ts')
  }
}

export async function GET() {
  // Return available teaching modes
  const modes = getTeachingModes()

  return NextResponse.json({
    modes,
    defaultMode: 'socratic',
  })
}
