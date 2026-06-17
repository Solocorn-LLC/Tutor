/**
 * Generate DMI (Digital Marking Interface) questions from content or PDF images
 * POST /api/ai/generate-dmi
 * Body: { type: 'task' | 'assessment', title?: string, content?: string, pdfPages?: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, getSessionForRealm, authOptions } from '@/lib/auth'
import { withRateLimitPreset, handleApiError } from '@/lib/api/middleware'
import { AISecurityManager } from '@/lib/security/ai-sanitization'
import { generateWithKimi, generateWithKimiVision } from '@/lib/ai/kimi'
import { stripCodeFences } from '@/lib/ai/llm-response'
import { z } from 'zod'

export const maxDuration = 60

const GenerateDmiRequestSchema = z.object({
  type: z.enum(['task', 'assessment']),
  title: z.string().max(200).optional(),
  content: z.string().max(50000).optional(),
  pdfPages: z.array(z.string().max(5_000_000)).max(5).optional(),
})

const SYSTEM_PROMPT = `You are an expert educational assessment designer.

Analyze the provided content and generate structured assessment questions.

For each question, output exactly in this format:
Q[number]: [question text]
A[number]: [suggested answer or key points]

Generate 5-10 questions that cover the main concepts, ranging from comprehension to application level.
Be concise and clear. Do not include any other text outside the Q/A pairs.`

function parseDmiResponse(
  text: string
): Array<{ questionNumber: number; questionText: string; answer: string }> {
  const questions: Array<{ questionNumber: number; questionText: string; answer: string }> = []
  const lines = text.split('\n')
  let currentQ: { questionNumber: number; questionText: string; answer: string } | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const qMatch = line.match(/^Q(\d+)[:.\)]\s*(.+)$/i)
    const aMatch = line.match(/^A(\d+)[:.\)]\s*(.+)$/i)

    if (qMatch) {
      if (currentQ) {
        questions.push(currentQ)
      }
      currentQ = {
        questionNumber: parseInt(qMatch[1], 10),
        questionText: qMatch[2].trim(),
        answer: '',
      }
    } else if (aMatch && currentQ) {
      currentQ.answer = aMatch[2].trim()
    } else if (currentQ && line.length > 0) {
      // Append to current question text or answer
      if (currentQ.answer) {
        currentQ.answer += ' ' + line
      } else {
        currentQ.questionText += ' ' + line
      }
    }
  }

  if (currentQ) {
    questions.push(currentQ)
  }

  return questions
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
    const parsed = GenerateDmiRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { type, title, content, pdfPages } = parsed.data

    if (!content?.trim() && (!pdfPages || pdfPages.length === 0)) {
      return NextResponse.json({ error: 'No content or PDF pages provided' }, { status: 400 })
    }

    let aiResponse: string

    if (pdfPages && pdfPages.length > 0) {
      const promptItems: Array<
        { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
      > = [
        {
          type: 'text',
          text: `Generate assessment questions from the following ${type}${title ? ` titled "${title}"` : ''}.`,
        },
        ...pdfPages.map(page => ({
          type: 'image_url' as const,
          image_url: { url: page },
        })),
      ]

      aiResponse = await generateWithKimiVision(promptItems, {
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0.7,
        maxTokens: 4096,
        timeoutMs: 60000,
      })
    } else {
      const prompt = `Generate assessment questions from the following ${type}${title ? ` titled "${title}"` : ''}:\n\n${content}`
      aiResponse = await generateWithKimi(prompt, {
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0.7,
        maxTokens: 4096,
        timeoutMs: 60000,
      })
    }

    const validation = await AISecurityManager.validateAiResponse(aiResponse)
    if (!validation.isValid && validation.severity === 'CRITICAL') {
      return handleApiError(
        new Error('AI response failed security validation'),
        'AI response failed security validation',
        'api/ai/generate-dmi/route.ts'
      )
    }

    const questions = parseDmiResponse(stripCodeFences(aiResponse))

    return NextResponse.json({
      response: aiResponse,
      questions,
    })
  } catch (error) {
    console.error('Generate DMI error:', error)
    return handleApiError(error, 'Failed to generate DMI questions', 'api/ai/generate-dmi/route.ts')
  }
}
