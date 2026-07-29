/**
 * POST /api/tutor/auto-grade-preview
 *
 * Stateless deterministic preview of how DMI answers are graded in a live session.
 * Runs the same `autoGradeDmi` engine used by the socket `task:complete` handler
 * so the tutor's Test tab matches live behavior. Never writes to the database.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession, authOptions } from '@/lib/auth'
import { handleApiError, requireCsrf, withRateLimitPreset } from '@/lib/api/middleware'
import { autoGradeDmi, type DmiAnswerItem } from '@/lib/grading/auto-grade'

const RequestSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      answer: z.string().optional(),
      acceptableVariants: z.array(z.string()).optional(),
      questionText: z.string().optional(),
      marks: z.number().optional(),
    })
  ),
  answers: z.record(z.string(), z.string()).default({}),
})

export async function POST(request: NextRequest) {
  try {
    const { response: rateLimitResponse } = await withRateLimitPreset(request, 'aiGenerate')
    if (rateLimitResponse) return rateLimitResponse

    const session = await getServerSession(authOptions, request)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user.role !== 'TUTOR' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const body = await request.json().catch(() => null)
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { items, answers } = parsed.data
    const result = autoGradeDmi(items as DmiAnswerItem[], answers)

    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(
      error,
      'Failed to preview auto-grade',
      'api/tutor/auto-grade-preview/route.ts'
    )
  }
}
