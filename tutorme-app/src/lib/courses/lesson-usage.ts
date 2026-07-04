/**
 * Lesson usage lookup for the delete guard.
 *
 * A lesson can be deleted freely until something has been *deployed* from it in
 * a live class. The wrinkle: the course builder edits the **template** course,
 * but deployments stamp `DeployedMaterial.lessonId` with the **published**
 * lesson id — a fresh id created at publish time. Publish copies lessons
 * preserving their `order`, so `order` is the only stable correlation between a
 * template lesson and its published copies.
 *
 * Given a (courseId, lessonId) as seen in the builder — where courseId may be
 * either the template or a published variant — this resolves the whole course
 * family (template + every published variant), finds every lesson that shares
 * the target lesson's `order`, and counts deployed material against that set.
 */

import { and, eq, inArray, isNull } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { courseLesson, courseVariant, deployedMaterial } from '@/lib/db/schema'

export interface LessonUsage {
  lessonId: string
  /** Number of DeployedMaterial rows tied to this lesson (or its published copies). */
  deployedCount: number
  /** True when the lesson has ever had material deployed and so must not be deleted. */
  hasDeployments: boolean
}

/**
 * Resolve the family of course ids (template + all published variants) that the
 * given course id belongs to, regardless of whether the id is the template or a
 * published variant.
 */
async function resolveCourseFamily(courseId: string): Promise<string[]> {
  // Is this a published variant? If so, hop to its template.
  const [asVariant] = await drizzleDb
    .select({ templateCourseId: courseVariant.templateCourseId })
    .from(courseVariant)
    .where(eq(courseVariant.publishedCourseId, courseId))
    .limit(1)

  const templateId = asVariant?.templateCourseId ?? courseId

  const variants = await drizzleDb
    .select({ publishedCourseId: courseVariant.publishedCourseId })
    .from(courseVariant)
    .where(eq(courseVariant.templateCourseId, templateId))

  return Array.from(new Set([templateId, ...variants.map(v => v.publishedCourseId)]))
}

/**
 * Count deployed material for each of the given lessons, following the
 * template→published `order` correlation described above.
 */
export async function getLessonUsage(
  courseId: string,
  lessonIds: string[]
): Promise<Record<string, LessonUsage>> {
  const uniqueIds = Array.from(new Set(lessonIds.filter(Boolean)))
  if (uniqueIds.length === 0) return {}

  const familyIds = await resolveCourseFamily(courseId)

  // All lessons across the family, so we can (a) read each target lesson's order
  // and (b) find every lesson sharing that order.
  const familyLessons = await drizzleDb
    .select({
      lessonId: courseLesson.lessonId,
      order: courseLesson.order,
    })
    .from(courseLesson)
    .where(and(inArray(courseLesson.courseId, familyIds), isNull(courseLesson.deletedAt)))

  const orderByLessonId = new Map(familyLessons.map(l => [l.lessonId, l.order]))
  const lessonIdsByOrder = new Map<number, string[]>()
  for (const l of familyLessons) {
    const list = lessonIdsByOrder.get(l.order) ?? []
    list.push(l.lessonId)
    lessonIdsByOrder.set(l.order, list)
  }

  // For each target lesson, the correlated id set = every family lesson at the
  // same order, plus the target id itself (covers a not-yet-persisted lesson).
  const correlatedByTarget = new Map<string, string[]>()
  const allCorrelated = new Set<string>()
  for (const id of uniqueIds) {
    const order = orderByLessonId.get(id)
    const correlated = new Set<string>([id])
    if (order !== undefined) {
      for (const cid of lessonIdsByOrder.get(order) ?? []) correlated.add(cid)
    }
    correlatedByTarget.set(id, Array.from(correlated))
    correlated.forEach(cid => allCorrelated.add(cid))
  }

  // One query for every potentially-referenced lesson id.
  const deployRows =
    allCorrelated.size === 0
      ? []
      : await drizzleDb
          .select({ lessonId: deployedMaterial.lessonId })
          .from(deployedMaterial)
          .where(inArray(deployedMaterial.lessonId, Array.from(allCorrelated)))

  const deployCountByLessonId = new Map<string, number>()
  for (const row of deployRows) {
    if (!row.lessonId) continue
    deployCountByLessonId.set(row.lessonId, (deployCountByLessonId.get(row.lessonId) ?? 0) + 1)
  }

  const result: Record<string, LessonUsage> = {}
  for (const id of uniqueIds) {
    const correlated = correlatedByTarget.get(id) ?? [id]
    const deployedCount = correlated.reduce(
      (sum, cid) => sum + (deployCountByLessonId.get(cid) ?? 0),
      0
    )
    result[id] = { lessonId: id, deployedCount, hasDeployments: deployedCount > 0 }
  }
  return result
}
