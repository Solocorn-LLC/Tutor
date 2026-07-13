/**
 * Course-variant family expansion.
 *
 * A course is split into a TEMPLATE course (`isPublished = false`) and one or
 * more PUBLISHED variant courses (per category × nationality), linked via
 * `courseVariant` (templateCourseId ↔ publishedCourseId). Students enroll in the
 * PUBLISHED variant, but a tutor's sessions / schedules / lessons / tasks /
 * deployed materials can be stored under the TEMPLATE id (or a published id)
 * depending on which course view created them.
 *
 * Any read that scopes content by a student's enrolled course id therefore has
 * to match the whole family, or the student silently sees nothing (or is wrongly
 * blocked). Use `expandToCourseFamily` on the enrolled ids (or on a single
 * course id) before filtering `... .courseId IN (ids)`.
 */

import { or, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { courseVariant } from '@/lib/db/schema'

/**
 * Expand the given course ids to include, for each one, the OTHER id in its
 * template↔published pair (whichever direction it was given). A published id maps
 * to its template; a template id maps to its published variant(s). Ids that
 * aren't part of any variant are returned unchanged. Order/uniqueness preserved
 * via a Set. Single round-trip; a no-op for an empty list.
 */
export async function expandToCourseFamily(ids: readonly string[]): Promise<string[]> {
  const input = ids.filter(Boolean)
  if (input.length === 0) return [...input]
  const rows = await drizzleDb
    .select({
      templateCourseId: courseVariant.templateCourseId,
      publishedCourseId: courseVariant.publishedCourseId,
    })
    .from(courseVariant)
    .where(
      or(
        inArray(courseVariant.publishedCourseId, input),
        inArray(courseVariant.templateCourseId, input)
      )
    )
  return Array.from(
    new Set([...input, ...rows.flatMap(r => [r.templateCourseId, r.publishedCourseId])])
  )
}
