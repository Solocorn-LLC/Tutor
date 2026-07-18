/**
 * Recreate a minimal placeholder Course row for every course that was hard-deleted
 * but still has rows pointing at it (after `cleanup-orphaned-courses.ts` runs, these
 * are exactly the submission-bearing courses it protected). This restores a valid FK
 * parent for that orphaned student work so the missing `courseId` foreign keys can
 * finally be enforced — without resurrecting the courses in the UI.
 *
 * The placeholders are created SOFT-DELETED (deletedAt set) so course listings (which
 * filter `deletedAt IS NULL`) don't show them; they exist only for referential
 * integrity. `creatorId` is recovered from the orphaned rows' tutorId (nullable if
 * none is found). Idempotent — onConflictDoNothing, so re-running is a no-op.
 *
 * DRY RUN (default) — reports what it would create; writes NOTHING:
 *   npm run recover:protected-courses
 * APPLY — creates the placeholders (against the DIRECT url):
 *   npm run recover:protected-courses -- --apply
 */

import { sql } from 'drizzle-orm'
import { drizzleDb } from '../src/lib/db/drizzle'
import { course } from '../src/lib/db/schema'

const APPLY = process.argv.includes('--apply')

// Parent tables whose courseId can point at a (now-missing) Course.
const PARENTS = [
  'LiveSession',
  'CourseLesson',
  'CalendarEvent',
  'CourseEnrollment',
  'BuilderTask',
  'OneOnOneBookingRequest',
  'GroupSession',
]

async function rows<T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T[]> {
  const res = await drizzleDb.execute(q)
  return res.rows as T[]
}

async function main() {
  console.log(`=== Recover protected courses (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`)

  // Every courseId referenced by a parent table that has no Course row.
  const missing = new Set<string>()
  for (const t of PARENTS) {
    const found = await rows<{ cid: string }>(
      sql.raw(`
      SELECT DISTINCT t."courseId" AS cid FROM "${t}" t
      WHERE t."courseId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "Course" c WHERE c."id" = t."courseId")
    `)
    )
    for (const r of found) missing.add(r.cid)
  }

  if (missing.size === 0) {
    console.log('No orphaned courseIds — nothing to recover.')
    return
  }

  // Recover a creatorId (tutorId) for each, from its orphaned rows.
  const now = new Date()
  const toInsert: { courseId: string; creatorId: string | null; nTutor: string | null }[] = []
  for (const cid of missing) {
    const [t] = await rows<{ tutorId: string | null }>(sql`
      SELECT "tutorId" FROM "BuilderTask" WHERE "courseId" = ${cid} AND "tutorId" IS NOT NULL
      UNION
      SELECT "tutorId" FROM "LiveSession" WHERE "courseId" = ${cid} AND "tutorId" IS NOT NULL
      LIMIT 1
    `)
    // Only use the tutor if the User still exists (creatorId FK).
    let creatorId: string | null = null
    if (t?.tutorId) {
      const u = await rows(sql`SELECT 1 FROM "User" WHERE "id" = ${t.tutorId} LIMIT 1`)
      if (u.length > 0) creatorId = t.tutorId
    }
    toInsert.push({ courseId: cid, creatorId, nTutor: t?.tutorId ?? null })
  }

  console.log(`Orphaned courseIds to recover: ${toInsert.length}\n`)
  for (const r of toInsert) {
    console.log(
      `  · ${r.courseId}  creatorId=${r.creatorId ? r.creatorId.slice(0, 10) + '…' : 'NULL'}`
    )
  }

  if (!APPLY) {
    console.log(
      '\n[dry-run] Nothing written. Re-run with --apply (against the DIRECT url) to recover.'
    )
    return
  }

  await drizzleDb
    .insert(course)
    .values(
      toInsert.map(r => ({
        courseId: r.courseId,
        name: 'Recovered course (archived)',
        creatorId: r.creatorId,
        isPublished: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: now, // soft-deleted: satisfies the FK, hidden from course lists
      }))
    )
    .onConflictDoNothing({ target: course.courseId })

  console.log('\n[applied] Placeholder courses created (soft-deleted).')
  console.log('Next: verify 0 orphans, then enforce the courseId FKs via startup-schema-fix.')
}

main()
  .catch(err => {
    console.error('[recover] failed (nothing committed):', err)
    process.exit(1)
  })
  .finally(() => process.exit(0))
