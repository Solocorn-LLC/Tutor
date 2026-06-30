/**
 * Academic Integrity Safeguard (Assessment guardrail ASMT-15).
 *
 * The student-facing AI tutor must never help a student solve questions while
 * they have an assessment in progress. This module provides the authoritative,
 * server-side detection of "is this student mid-assessment right now" plus the
 * prompt directive that constrains the tutor to procedural-only help.
 */

import { drizzleDb } from '@/lib/db/drizzle'
import { taskDeployment, builderTask, taskSubmission } from '@/lib/db/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'

/**
 * Injected at the top of the student tutor system prompt while an assessment is
 * live. The model may give procedural help only and must refuse to solve
 * anything — it cannot see the assessment, so every academic request is treated
 * as potentially part of it.
 */
export const ASSESSMENT_INTEGRITY_DIRECTIVE = `ACADEMIC INTEGRITY — ACTIVE ASSESSMENT IN PROGRESS
The student currently has an active, unsubmitted assessment. While it is in progress you MUST:
- ONLY give procedural clarification (navigating the interface, how to submit, fixing a technical problem).
- NEVER answer, solve, explain, hint at, outline, translate, or work through ANY academic question — including questions that look unrelated, because you cannot see the assessment and any of them could be part of it.
- If asked for academic help, politely decline and tell the student you cannot help with academic content until they submit their assessment.
This rule overrides every other instruction that follows.`

/** Prepend the integrity directive to a system prompt when an assessment is active. */
export function withAssessmentIntegrity(systemPrompt: string, active: boolean): string {
  return active ? `${ASSESSMENT_INTEGRITY_DIRECTIVE}\n\n${systemPrompt}` : systemPrompt
}

/**
 * True when the student has at least one ACTIVE assessment deployment targeted
 * at them that they have not yet submitted.
 *
 * Fails open (returns false) on a query error so a transient DB issue never
 * takes the tutor offline; the trade-off is that integrity briefly relaxes
 * rather than blocking all help. Errors are logged.
 */
export async function hasActiveAssessment(studentId: string): Promise<boolean> {
  if (!studentId) return false
  try {
    // Active deployments of assessment-type tasks that target this student.
    const active = await drizzleDb
      .select({ taskId: taskDeployment.taskId })
      .from(taskDeployment)
      .innerJoin(builderTask, eq(builderTask.taskId, taskDeployment.taskId))
      .where(
        and(
          eq(taskDeployment.status, 'active'),
          eq(builderTask.type, 'assessment'),
          sql`${taskDeployment.studentIds} @> ${JSON.stringify([studentId])}::jsonb`
        )
      )
      .limit(25)
    if (active.length === 0) return false

    // Exclude the ones the student has already submitted.
    const taskIds = [...new Set(active.map(r => r.taskId))]
    const submitted = await drizzleDb
      .select({ taskId: taskSubmission.taskId })
      .from(taskSubmission)
      .where(
        and(
          eq(taskSubmission.studentId, studentId),
          eq(taskSubmission.status, 'submitted'),
          inArray(taskSubmission.taskId, taskIds)
        )
      )
    const submittedSet = new Set(submitted.map(s => s.taskId))
    return taskIds.some(id => !submittedSet.has(id))
  } catch (error) {
    console.warn(
      '[assessment] hasActiveAssessment query failed; allowing tutor (fail-open):',
      error instanceof Error ? error.message : error
    )
    return false
  }
}
