/**
 * Lesson usage lookup for the delete guard.
 *
 * A lesson can be deleted freely until material has been *deployed* from it in
 * a live class. The guard checks the exact lesson ids being deleted in the
 * course currently open in the builder. Published-variant deployments do not
 * block deletion of a template lesson, and vice versa, because each course
 * keeps its own `courseLesson` rows.
 */

import { inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { deployedMaterial } from '@/lib/db/schema'

export interface LessonUsage {
  lessonId: string
  /** Number of DeployedMaterial rows tied directly to this lesson id. */
  deployedCount: number
  /** True when this exact lesson has ever had material deployed. */
  hasDeployments: boolean
}

/**
 * Pure core of the usage computation: count how many deployments reference
 * each target lesson id directly.
 */
export function computeLessonUsage(
  targetLessonIds: string[],
  deployedLessonIds: Array<string | null | undefined>
): Record<string, LessonUsage> {
  const uniqueIds = Array.from(new Set(targetLessonIds.filter(Boolean)))
  if (uniqueIds.length === 0) return {}

  const counts = new Map<string, number>()
  for (const lessonId of deployedLessonIds) {
    if (!lessonId || !uniqueIds.includes(lessonId)) continue
    counts.set(lessonId, (counts.get(lessonId) ?? 0) + 1)
  }

  const result: Record<string, LessonUsage> = {}
  for (const id of uniqueIds) {
    const deployedCount = counts.get(id) ?? 0
    result[id] = { lessonId: id, deployedCount, hasDeployments: deployedCount > 0 }
  }
  return result
}

/**
 * Count deployed material directly tied to each requested lesson id.
 *
 * `courseId` is kept in the signature for backwards compatibility with the
 * existing API, but the guard is now exact-id based and does not resolve the
 * whole course family.
 */
export async function getLessonUsage(
  _courseId: string,
  lessonIds: string[]
): Promise<Record<string, LessonUsage>> {
  const uniqueIds = Array.from(new Set(lessonIds.filter(Boolean)))
  if (uniqueIds.length === 0) return {}

  const deployRows = await drizzleDb
    .select({ lessonId: deployedMaterial.lessonId })
    .from(deployedMaterial)
    .where(inArray(deployedMaterial.lessonId, uniqueIds))

  return computeLessonUsage(
    uniqueIds,
    deployRows.map(r => r.lessonId)
  )
}
