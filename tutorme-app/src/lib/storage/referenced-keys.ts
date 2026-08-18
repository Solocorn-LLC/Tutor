/**
 * Reference-aware storage cleanup helper.
 *
 * A document uploaded once is often shared — it lives in the tutor's asset
 * library AND may be referenced by one or more tasks/lessons. Before deleting a
 * storage object (e.g. when a task/lesson is removed) we must confirm it isn't
 * still referenced somewhere, otherwise the file vanishes while the reference
 * remains and re-loading it later fails with "Document not found in storage".
 */

import { eq, and, isNull } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { tutorAsset, course, courseLesson } from '@/lib/db/schema'
import { extractGcsKeyFromPublicUrl } from '@/lib/storage/gcs'
import { collectFileKeys } from '@/lib/services/course-builder.service'

/**
 * Walk an object and collect every storage key referenced by any document field.
 * In addition to explicit `fileKey` values, this also extracts keys from:
 *  - `parentFileKey` on split-PDF pages (the original document must survive)
 *  - `fileUrl` / `url` strings that point to a GCS object
 *
 * This protects both modern fileKey-based references and legacy URL-only refs.
 */
function collectAllStorageKeys(obj: unknown): Set<string> {
  const keys = new Set<string>()

  function maybeAdd(value: unknown) {
    if (typeof value !== 'string' || value.length === 0) return
    const extracted = extractGcsKeyFromPublicUrl(value)
    if (extracted) {
      keys.add(extracted)
    }
  }

  function walk(value: unknown) {
    if (typeof value === 'string') {
      maybeAdd(value)
      return
    }
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        // Explicit fileKey / parentFileKey always win (even if the value is not
        // a GCS URL).
        if ((k === 'fileKey' || k === 'parentFileKey') && typeof v === 'string' && v.length > 0) {
          keys.add(v)
        } else {
          walk(v)
        }
      }
    }
  }

  walk(obj)
  return keys
}

/**
 * Collect every storage key still referenced by this tutor — their asset library
 * and the builder data of all their courses' lessons. A key in this set must not
 * be deleted, even if a single task that also used it is being removed.
 */
export async function collectReferencedKeys(tutorId: string): Promise<Set<string>> {
  const referenced = new Set<string>()

  // 1) Asset library (the case behind the reported bug). Soft-deleted assets are
  // intentionally excluded: they are pending cleanup and should not keep storage
  // objects alive once no course references them.
  const assets = await drizzleDb
    .select({ fileKey: tutorAsset.fileKey, url: tutorAsset.url })
    .from(tutorAsset)
    .where(and(eq(tutorAsset.tutorId, tutorId), isNull(tutorAsset.deletedAt)))
  for (const a of assets) {
    if (a.fileKey) referenced.add(a.fileKey)
    if (a.url) {
      const k = extractGcsKeyFromPublicUrl(a.url)
      if (k) referenced.add(k)
    }
  }

  // 2) Every storage key referenced in this tutor's live course lessons.
  const lessons = await drizzleDb
    .select({ builderData: courseLesson.builderData })
    .from(courseLesson)
    .innerJoin(course, eq(courseLesson.courseId, course.courseId))
    .where(and(eq(course.creatorId, tutorId), isNull(courseLesson.deletedAt)))
  for (const lesson of lessons) {
    for (const k of collectAllStorageKeys(lesson.builderData)) referenced.add(k)
  }

  return referenced
}

/**
 * Same as collectReferencedKeys, but returns a map from each key to the course
 * names that reference it. Used when deleting an asset to explain why it is
 * blocked.
 */
export async function collectReferencedKeysWithSources(
  tutorId: string
): Promise<Map<string, Set<string>>> {
  const keyToSources = new Map<string, Set<string>>()

  function add(key: string | null | undefined, source: string) {
    if (!key) return
    if (!keyToSources.has(key)) keyToSources.set(key, new Set())
    keyToSources.get(key)!.add(source)
  }

  // 1) Asset library (excluding soft-deleted rows).
  const assets = await drizzleDb
    .select({ fileKey: tutorAsset.fileKey, url: tutorAsset.url, name: tutorAsset.name })
    .from(tutorAsset)
    .where(and(eq(tutorAsset.tutorId, tutorId), isNull(tutorAsset.deletedAt)))
  for (const a of assets) {
    const source = `Asset library: ${a.name || 'unnamed'}`
    add(a.fileKey, source)
    if (a.url) add(extractGcsKeyFromPublicUrl(a.url), source)
  }

  // 2) Course lesson builderData.
  const rows = await drizzleDb
    .select({ builderData: courseLesson.builderData, courseName: course.name })
    .from(courseLesson)
    .innerJoin(course, eq(courseLesson.courseId, course.courseId))
    .where(and(eq(course.creatorId, tutorId), isNull(courseLesson.deletedAt)))
  for (const row of rows) {
    const source = row.courseName || 'Unnamed course'
    for (const k of collectAllStorageKeys(row.builderData)) {
      add(k, source)
    }
  }

  return keyToSources
}
