/**
 * LLM token-usage ledger helpers.
 *
 * `recordLlmUsage` persists one row of token consumption (best-effort; never
 * throws into the caller). Pass a `context` with studentId/courseId/feature to
 * attribute the usage — this is what the paid-course unregister refund reads to
 * deduct token cost. `sumLlmUsageForStudentCourse` aggregates that attribution.
 */

import crypto from 'crypto'
import { and, eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { llmTokenUsage } from '@/lib/db/schema'

export interface UsageContext {
  studentId?: string | null
  courseId?: string | null
  feature?: string
}

// Rough blended USD cost per 1K tokens (override via env). Exact tokens are
// stored regardless; this only drives the costUsd estimate.
const USD_PER_1K_TOKENS = Number(process.env.LLM_USD_PER_1K_TOKENS || '0.002')

export async function recordLlmUsage(params: {
  provider: string
  model?: string | null
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  context?: UsageContext
}): Promise<void> {
  try {
    const prompt = params.promptTokens ?? 0
    const completion = params.completionTokens ?? 0
    const total = params.totalTokens ?? prompt + completion
    if (total <= 0 && prompt <= 0 && completion <= 0) return // nothing to record

    await drizzleDb.insert(llmTokenUsage).values({
      usageId: crypto.randomUUID(),
      studentId: params.context?.studentId ?? null,
      courseId: params.context?.courseId ?? null,
      provider: params.provider,
      model: params.model ?? null,
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: total,
      costUsd: (total / 1000) * USD_PER_1K_TOKENS,
      feature: params.context?.feature ?? null,
      createdAt: new Date(),
    })
  } catch (err) {
    console.warn('[llm-usage] failed to record token usage (non-critical):', err)
  }
}

export async function sumLlmUsageForStudentCourse(
  studentId: string,
  courseId: string
): Promise<{ totalTokens: number; costUsd: number }> {
  const rows = await drizzleDb
    .select({ totalTokens: llmTokenUsage.totalTokens, costUsd: llmTokenUsage.costUsd })
    .from(llmTokenUsage)
    .where(and(eq(llmTokenUsage.studentId, studentId), eq(llmTokenUsage.courseId, courseId)))
  return rows.reduce(
    (acc, r) => ({
      totalTokens: acc.totalTokens + (r.totalTokens || 0),
      costUsd: acc.costUsd + (r.costUsd || 0),
    }),
    { totalTokens: 0, costUsd: 0 }
  )
}
