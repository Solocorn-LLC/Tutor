/**
 * Lesson usage lookup for the delete guard.
 *
 * A lesson can be deleted freely until material has been *deployed* from it in
 * a live class that belongs to the course being edited. Deployments from demo
 * classes (GO_LIVE_DEMO) never block template edits, and deployments from
 * published variants never block the source template because each course keeps
 * its own `courseLesson` rows.
 */

import { and, eq, inArray, not } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { deployedMaterial, liveSession } from '@/lib/db/schema'

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
 * Count deployed material directly tied to each requested lesson id, scoped to
 * the course being edited and excluding ephemeral demo/teaching sessions.
 *
 * Only deployments whose `LiveSession` row belongs to `courseId` and whose
 * session type is not `GO_LIVE_DEMO` are counted. This guarantees that a
 * template lesson is never blocked by deployments from a demo class or from a
 * published variant's own course/lesson rows.
 */
export async function getLessonUsage(
  courseId: string,
  lessonIds: string[]
): Promise<Record<string, LessonUsage>> {
  const uniqueIds = Array.from(new Set(lessonIds.filter(Boolean)))
  if (uniqueIds.length === 0) return {}

  const deployRows = await drizzleDb
    .select({ lessonId: deployedMaterial.lessonId })
    .from(deployedMaterial)
    .innerJoin(liveSession, eq(liveSession.sessionId, deployedMaterial.sessionId))
    .where(
      and(
        inArray(deployedMaterial.lessonId, uniqueIds),
        eq(liveSession.courseId, courseId),
        not(eq(liveSession.sessionType, 'GO_LIVE_DEMO'))
      )
    )

  return computeLessonUsage(
    uniqueIds,
    deployRows.map(r => r.lessonId)
  )
}
