/**
 * READ-ONLY audit for the deploy answer-key leak fixed in #874.
 *
 * Before the fix, deploying a task/assessment stored the raw DMI items (with
 * `answer`/`rubric`/`acceptableVariants`/matching `pairs`/hotspot `regions`) in
 * `deployedMaterial.content` — the student-facing snapshot. This scans every
 * deployedMaterial row with `findEvaluationLeaks` and reports which sessions,
 * courses, and items exposed answer data, so the exposure can be assessed.
 *
 * Makes NO writes (pure SELECT). Run against the target database:
 *   DATABASE_URL=... npx tsx src/scripts/audit-deployed-answer-leaks.ts
 */

import { drizzleDb } from '@/lib/db/drizzle'
import { deployedMaterial } from '@/lib/db/schema'
import { findEvaluationLeaks } from '@/lib/ai/guardrails'

export interface DeployLeakRow {
  id: string
  sessionId: string
  courseId: string
  type: string
  itemId: string
  title: string
  deployedAt: Date | null
  leaks: string[]
}

/** Returns the deployed-material rows whose stored content still carries answer
 *  data. Empty array = clean. */
export async function auditDeployedAnswerLeaks(): Promise<DeployLeakRow[]> {
  const rows = await drizzleDb.select().from(deployedMaterial)
  const affected: DeployLeakRow[] = []
  for (const row of rows) {
    if (!row.content) continue
    const leaks = findEvaluationLeaks(row.content)
    if (leaks.length > 0) {
      affected.push({
        id: row.id,
        sessionId: row.sessionId,
        courseId: row.courseId,
        type: row.type,
        itemId: row.itemId,
        title: row.title,
        deployedAt: row.deployedAt ?? null,
        leaks,
      })
    }
  }
  return affected
}

if (require.main === module) {
  auditDeployedAnswerLeaks()
    .then(affected => {
      if (affected.length === 0) {
        console.log('✓ No answer-key leaks found in any deployed material.')
        return process.exit(0)
      }
      console.log(`⚠️  ${affected.length} deployed material(s) contain leaked answer data:\n`)
      const leakedFields = new Set<string>()
      for (const r of affected) {
        r.leaks.forEach(path => leakedFields.add(path.split('.').pop() || path))
        console.log(
          `- ${r.deployedAt?.toISOString() ?? '?'} | course=${r.courseId} session=${r.sessionId} | ` +
            `${r.type} "${r.title}" (item=${r.itemId}) — ${r.leaks.length} leak field(s)`
        )
      }
      console.log(`\nLeaked field types: ${[...leakedFields].sort().join(', ')}`)
      console.log(
        '\nThese were deployed before the #874 fix and exposed answer data in the student ' +
          'snapshot. New deploys are stripped; consider whether these historical rows need ' +
          'redaction.'
      )
      return process.exit(0)
    })
    .catch(err => {
      console.error('audit failed:', err)
      process.exit(1)
    })
}
