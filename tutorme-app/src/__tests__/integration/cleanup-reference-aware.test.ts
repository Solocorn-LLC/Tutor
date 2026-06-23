/**
 * Integration test: the upload-cleanup endpoint is reference-aware.
 *
 * Guards the data-loss bug where deleting a task/lesson deleted a document's GCS
 * object even though the same document was still referenced by the tutor's asset
 * library (or another lesson) — later failing with "Document not found in
 * storage" until re-uploaded. collectReferencedKeys must surface every key still
 * in use so the route skips deleting them.
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import crypto from 'crypto'
import { eq, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, course, courseLesson, tutorAsset } from '@/lib/db/schema'
import { collectReferencedKeys } from '@/lib/storage/referenced-keys'

const stamp = Date.now()
const tutorId = crypto.randomUUID()
const otherTutorId = crypto.randomUUID()
const courseId = `c_clean_${stamp}`
const lessonId = `l_clean_${stamp}`

const assetKey = `documents/${tutorId}/library-doc.pdf`
const lessonKey = `documents/${tutorId}/lesson-page-1.pdf`
const otherTutorKey = `documents/${otherTutorId}/their-doc.pdf`

describe('cleanup reference-awareness', () => {
  beforeAll(async () => {
    const now = new Date()
    await drizzleDb.insert(user).values([
      {
        userId: tutorId,
        email: `claude-clean-${stamp}@example.com`,
        role: 'TUTOR',
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: otherTutorId,
        email: `claude-clean-other-${stamp}@example.com`,
        role: 'TUTOR',
        createdAt: now,
        updatedAt: now,
      },
    ])
    await drizzleDb.insert(course).values({ courseId, name: 'Clean Course', creatorId: tutorId })
    // A lesson whose builderData references a doc via a nested sourceDocument.fileKey.
    await drizzleDb.insert(courseLesson).values({
      lessonId,
      courseId,
      title: 'Lesson',
      order: 0,
      builderData: {
        tasks: [{ id: 't1', sourceDocument: { fileKey: lessonKey } }],
      },
    })
    // Asset library entry referencing another doc by fileKey.
    await drizzleDb.insert(tutorAsset).values({
      assetId: `a_${stamp}`,
      tutorId,
      name: 'Library Doc',
      fileKey: assetKey,
    })
  })

  afterAll(async () => {
    const t = async (fn: () => Promise<unknown>) => {
      try {
        await fn()
      } catch {}
    }
    await t(() => drizzleDb.delete(tutorAsset).where(eq(tutorAsset.tutorId, tutorId)))
    await t(() => drizzleDb.delete(courseLesson).where(eq(courseLesson.courseId, courseId)))
    await t(() => drizzleDb.delete(course).where(eq(course.courseId, courseId)))
    await t(() => drizzleDb.delete(user).where(inArray(user.userId, [tutorId, otherTutorId])))
  })

  it('surfaces keys referenced by the asset library and by lesson builderData', async () => {
    const referenced = await collectReferencedKeys(tutorId)
    // Both the asset-library doc and the lesson-referenced doc are protected.
    expect(referenced.has(assetKey)).toBe(true)
    expect(referenced.has(lessonKey)).toBe(true)
    // A truly-orphaned key is NOT protected (so it can still be cleaned up).
    expect(referenced.has(`documents/${tutorId}/orphan.pdf`)).toBe(false)
    // Another tutor's referenced key does not leak into this tutor's set.
    expect(referenced.has(otherTutorKey)).toBe(false)
  })
})
