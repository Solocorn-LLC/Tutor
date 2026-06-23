/**
 * Reference-aware storage cleanup helper.
 *
 * A document uploaded once is often shared — it lives in the tutor's asset
 * library AND may be referenced by one or more tasks/lessons. Before deleting a
 * storage object (e.g. when a task/lesson is removed) we must confirm it isn't
 * still referenced somewhere, otherwise the file vanishes while the reference
 * remains and re-loading it later fails with "Document not found in storage".
 */

import { eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { tutorAsset, course, courseLesson } from '@/lib/db/schema'
import { extractGcsKeyFromPublicUrl } from '@/lib/storage/gcs'
import { collectFileKeys } from '@/lib/services/course-builder.service'

/**
 * Collect every storage key still referenced by this tutor — their asset library
 * and the builder data of all their courses' lessons. A key in this set must not
 * be deleted, even if a single task that also used it is being removed.
 */
export async function collectReferencedKeys(tutorId: string): Promise<Set<string>> {
  const referenced = new Set<string>()

  // 1) Asset library (the case behind the reported bug).
  const assets = await drizzleDb
    .select({ fileKey: tutorAsset.fileKey, url: tutorAsset.url })
    .from(tutorAsset)
    .where(eq(tutorAsset.tutorId, tutorId))
  for (const a of assets) {
    if (a.fileKey) referenced.add(a.fileKey)
    if (a.url) {
      const k = extractGcsKeyFromPublicUrl(a.url)
      if (k) referenced.add(k)
    }
  }

  // 2) Every fileKey persisted in this tutor's course lessons.
  const lessons = await drizzleDb
    .select({ builderData: courseLesson.builderData })
    .from(courseLesson)
    .innerJoin(course, eq(courseLesson.courseId, course.courseId))
    .where(eq(course.creatorId, tutorId))
  for (const k of collectFileKeys(lessons.map(l => l.builderData))) referenced.add(k)

  return referenced
}
