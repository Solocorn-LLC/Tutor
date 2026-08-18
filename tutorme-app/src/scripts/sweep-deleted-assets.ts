/**
 * Sweep soft-deleted TutorAsset rows and remove their storage objects once they
 * are no longer referenced by any live course lesson.
 *
 * This is the cleanup companion to the asset-library soft-delete change: instead
 * of removing files the moment a tutor deletes an asset, we mark the row deleted
 * and let this job reap truly orphaned objects after a grace period.
 *
 * Run locally:
 *   npx tsx src/scripts/sweep-deleted-assets.ts --dry-run
 *   npx tsx src/scripts/sweep-deleted-assets.ts --apply
 *
 * In production the script is intended to run as a Cloud Run job / cron via
 *   npm run sweep:deleted-assets
 */

import { drizzleDb } from '@/lib/db/drizzle'
import { tutorAsset, courseLesson, course } from '@/lib/db/schema'
import { eq, and, isNotNull, isNull, lt } from 'drizzle-orm'
import { removeFile } from '@/lib/storage/service'
import { extractGcsKeyFromPublicUrl } from '@/lib/storage/gcs'
import { collectFileKeys } from '@/lib/services/course-builder.service'

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const apply = args.includes('--apply')

  if (!dryRun && !apply) {
    console.log('Usage: npx tsx src/scripts/sweep-deleted-assets.ts [--dry-run | --apply]')
    process.exit(1)
  }

  const cutoff = new Date(Date.now() - GRACE_PERIOD_MS)
  console.log(`[sweep-deleted-assets] cutoff=${cutoff.toISOString()} dryRun=${dryRun}`)

  // Load all soft-deleted asset rows past the grace period.
  const rows = await drizzleDb
    .select({
      assetId: tutorAsset.assetId,
      tutorId: tutorAsset.tutorId,
      fileKey: tutorAsset.fileKey,
      url: tutorAsset.url,
      deletedAt: tutorAsset.deletedAt,
    })
    .from(tutorAsset)
    .where(and(isNotNull(tutorAsset.deletedAt), lt(tutorAsset.deletedAt, cutoff)))

  console.log(`[sweep-deleted-assets] found ${rows.length} soft-deleted asset row(s)`)

  // Build the set of every storage key still referenced by a live course lesson
  // or by a live (non-deleted) asset-library row. Soft-deleted assets themselves
  // are intentionally excluded so they can be reaped, but if another live asset
  // or course still uses the same key we must preserve it.
  const protectedKeys = new Set<string>()

  const lessons = await drizzleDb
    .select({ builderData: courseLesson.builderData })
    .from(courseLesson)
    .innerJoin(course, eq(courseLesson.courseId, course.courseId))
    .where(isNull(courseLesson.deletedAt)) // live lessons only
  for (const k of collectFileKeys(lessons.map(l => l.builderData))) protectedKeys.add(k)

  const liveAssets = await drizzleDb
    .select({ fileKey: tutorAsset.fileKey, url: tutorAsset.url })
    .from(tutorAsset)
    .where(isNull(tutorAsset.deletedAt))
  for (const a of liveAssets) {
    if (a.fileKey) protectedKeys.add(a.fileKey)
    const extracted = a.url ? extractGcsKeyFromPublicUrl(a.url) : null
    if (extracted) protectedKeys.add(extracted)
  }

  let removedRows = 0
  let removedFiles = 0
  let skipped = 0
  const processedKeys = new Set<string>()

  for (const row of rows) {
    const key = row.fileKey || null
    if (!key) {
      // No storage key on record — just remove the row.
      if (!dryRun) {
        await drizzleDb
          .delete(tutorAsset)
          .where(and(eq(tutorAsset.assetId, row.assetId), eq(tutorAsset.tutorId, row.tutorId)))
      }
      removedRows++
      console.log(
        `[sweep-deleted-assets] ${dryRun ? 'would remove' : 'removed'} row ${row.assetId} (no key)`
      )
      continue
    }

    if (protectedKeys.has(key)) {
      skipped++
      console.log(
        `[sweep-deleted-assets] skipping ${row.assetId}: key still referenced by a course lesson`
      )
      continue
    }

    if (!dryRun) {
      if (!processedKeys.has(key)) {
        try {
          await removeFile(key)
          processedKeys.add(key)
          removedFiles++
          console.log(`[sweep-deleted-assets] removed storage object: ${key}`)
        } catch (err: any) {
          console.warn(`[sweep-deleted-assets] failed to remove ${key}:`, err?.message)
          // Continue to row deletion anyway; the row is soft-deleted and the
          // object may already be gone.
        }
      }
      await drizzleDb
        .delete(tutorAsset)
        .where(and(eq(tutorAsset.assetId, row.assetId), eq(tutorAsset.tutorId, row.tutorId)))
    } else {
      if (!processedKeys.has(key)) {
        processedKeys.add(key)
        removedFiles++
      }
    }
    removedRows++
    console.log(
      `[sweep-deleted-assets] ${dryRun ? 'would remove' : 'removed'} row ${row.assetId} and object ${key}`
    )
  }

  console.log(
    `[sweep-deleted-assets] done. rows=${removedRows} files=${removedFiles} skipped=${skipped}`
  )
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[sweep-deleted-assets] fatal error:', err)
    process.exit(1)
  })
