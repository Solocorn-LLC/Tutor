/**
 * Temporary diagnostic: verify the assessment-generation pipeline (document ->
 * AI -> parsed Q/A) works end-to-end with the active provider (Gemini).
 *
 * Mirrors the generation + parsing in /api/ai/generate-dmi but is reachable without
 * a tutor session, gated behind ALLOW_PUBLIC_TEST_ENDPOINTS=true (404 otherwise).
 *
 * GET /api/public/assessment-test
 */

import { NextResponse } from 'next/server'
import { generateWithFallback } from '@/lib/agents/orchestrator-llm'

const SYSTEM_PROMPT = `You are an expert educational assessment designer.
Analyze the provided content and generate structured assessment questions.
For each question, output exactly in this format:
Q[number]: [question text]
A[number]: [suggested answer or key points]
Generate 5-10 questions. Do not include any other text outside the Q/A pairs.`

const SAMPLE_CONTENT =
  'Photosynthesis is the process by which green plants use sunlight, water, and carbon dioxide ' +
  'to produce glucose and oxygen. It occurs in the chloroplasts, primarily in the leaves. The ' +
  'light-dependent reactions occur in the thylakoid membranes, while the Calvin cycle occurs in the stroma.'

function parseDmiResponse(text: string): Array<{ q: string; a: string }> {
  const out: Array<{ q: string; a: string }> = []
  let cur: { q: string; a: string } | null = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const qm = line.match(/^Q(\d+)[:.\)]\s*(.+)$/i)
    const am = line.match(/^A(\d+)[:.\)]\s*(.+)$/i)
    if (qm) {
      if (cur) out.push(cur)
      cur = { q: qm[2].trim(), a: '' }
    } else if (am && cur) {
      cur.a = am[2].trim()
    }
  }
  if (cur) out.push(cur)
  return out
}

export async function GET() {
  const isProd = process.env.NODE_ENV === 'production'
  if (isProd && process.env.ALLOW_PUBLIC_TEST_ENDPOINTS !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const started = Date.now()
    const result = await generateWithFallback(
      `${SYSTEM_PROMPT}\n\nContent (lesson titled "Photosynthesis Basics"):\n${SAMPLE_CONTENT}`,
      { maxTokens: 1024, timeoutMs: 40000, skipCache: true }
    )
    const questions = parseDmiResponse(result.content)
    return NextResponse.json({
      status: questions.length > 0 ? 'ok' : 'no_questions_parsed',
      provider: result.provider,
      latencyMs: Date.now() - started,
      questionCount: questions.length,
      sampleQuestions: questions.slice(0, 3),
      rawPreview: result.content.slice(0, 200),
    })
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
