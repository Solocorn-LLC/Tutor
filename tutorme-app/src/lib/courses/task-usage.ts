/**
 * Builder-item usage lookup for the edit guard.
 *
 * A task, assessment, homework, quiz, or worksheet can be edited freely until
 * it has been *deployed* in a live class that belongs to a *published* course.
 * Deployments from demo/live-teaching sessions (GO_LIVE_DEMO) never lock an item,
 * matching the behavior of the lesson delete guard.
 *
 * Item ids are global: a template course and all of its published variants share
 * the same builderData JSON, so a deployment under a published variant's courseId
 * locks the same item id in the template.
 */

import { and, eq, inArray, not, sql } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, deployedMaterial, liveSession } from '@/lib/db/schema'

export interface TaskUsage {
  itemId: string
  /** Total number of DeployedMaterial rows for this item id in published courses. */
  deployedCount: number
  /** True when this exact item has ever been deployed in a published course. */
  hasDeployments: boolean
  /** courseIds of the published courses where this item is deployed. */
  lockedCourseIds: string[]
}

/**
 * Pure core of the usage computation: sum published deployment counts per item id.
 */
export function computeTaskUsage(
  targetItemIds: string[],
  deploymentRows: Array<{ itemId: string | null; courseId: string | null; count: number }>
): Record<string, TaskUsage> {
  const uniqueIds = Array.from(new Set(targetItemIds.filter(Boolean)))
  if (uniqueIds.length === 0) return {}

  const counts = new Map<string, number>()
  const courseIds = new Map<string, Set<string>>()

  for (const row of deploymentRows) {
    if (!row.itemId || !uniqueIds.includes(row.itemId)) continue
    counts.set(row.itemId, (counts.get(row.itemId) ?? 0) + (row.count ?? 1))
    const set = courseIds.get(row.itemId) ?? new Set<string>()
    if (row.courseId) set.add(row.courseId)
    courseIds.set(row.itemId, set)
  }

  const result: Record<string, TaskUsage> = {}
  for (const id of uniqueIds) {
    const deployedCount = counts.get(id) ?? 0
    result[id] = {
      itemId: id,
      deployedCount,
      hasDeployments: deployedCount > 0,
      lockedCourseIds: Array.from(courseIds.get(id) ?? []),
    }
  }
  return result
}

/**
 * Count published deployments for each requested builder item id.
 *
 * Only deployments whose `Course` row has `isPublished = true` and whose
 * `LiveSession` is not a demo/teaching session are counted.
 */
export async function getTaskUsage(itemIds: string[]): Promise<Record<string, TaskUsage>> {
  const uniqueIds = Array.from(new Set(itemIds.filter(Boolean)))
  if (uniqueIds.length === 0) return {}

  const rows = await drizzleDb
    .select({
      itemId: deployedMaterial.itemId,
      courseId: deployedMaterial.courseId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(deployedMaterial)
    .innerJoin(course, eq(course.courseId, deployedMaterial.courseId))
    .innerJoin(liveSession, eq(liveSession.sessionId, deployedMaterial.sessionId))
    .where(
      and(
        inArray(deployedMaterial.itemId, uniqueIds),
        eq(course.isPublished, true),
        not(eq(liveSession.sessionType, 'GO_LIVE_DEMO'))
      )
    )
    .groupBy(deployedMaterial.itemId, deployedMaterial.courseId)

  return computeTaskUsage(
    uniqueIds,
    rows.map(r => ({ itemId: r.itemId, courseId: r.courseId, count: r.count }))
  )
}
