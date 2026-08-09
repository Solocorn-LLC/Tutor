/**
 * One-off backfill: restore the original published category for published courses
 * whose `Course.categories` was changed after publishing.
 *
 * Why: a published course's category is part of its public identity and should not
 * change. PR #1440 locks the UI/API going forward; this script repairs any rows that
 * were already mutated before the lock was in place.
 *
 * The source of truth is the `CourseVariant` row created at publish time, whose
 * `category` column holds the category assigned to the published course.
 *
 * DRY RUN (default) — prints mismatches, writes nothing:
 *   npx tsx scripts/backfill-published-course-categories.ts
 *
 * APPLY — performs the update:
 *   npx tsx scripts/backfill-published-course-categories.ts --apply
 *
 * Runs against whatever the process env points at (DATABASE_URL / DIRECT_URL) —
 * use the DIRECT (non-pooled) prod URL when applying to prod.
 *
 * Idempotent + safe:
 * - only touches published courses whose current categories differ from the
 *   original variant category;
 * - resets the category to the single variant category (published courses have one
 *   variant row each), so re-running after completion is a no-op.
 */

import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'
import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '../src/lib/db/schema'

// Load environment variables from .env.local before .env so local overrides take precedence.
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })
dotenvConfig({ path: resolve(process.cwd(), '.env') })

const APPLY = process.argv.includes('--apply')

interface MismatchRow {
  courseId: string
  courseName: string | null
  currentCategories: string[] | null
  variantCategory: string
}

async function main() {
  // Dynamic import so drizzle.ts reads the env vars loaded above.
  const { drizzleDb } = await import('../src/lib/db/drizzle')
  const db = drizzleDb as NodePgDatabase<typeof schema>

  const mismatches = await db.execute(sql`
    SELECT
      c."id" AS "courseId",
      c."name" AS "courseName",
      c."categories" AS "currentCategories",
      cv."category" AS "variantCategory"
    FROM "Course" c
    JOIN "CourseVariant" cv ON cv."publishedCourseId" = c."id"
    WHERE c."isPublished" = true
      AND (c."categories" IS NULL OR c."categories" <> ARRAY[cv."category"])
    ORDER BY c."updatedAt" DESC
  `)

  const rows = mismatches.rows as unknown as MismatchRow[]

  console.log(`[backfill] ${rows.length} published course(s) have a category mismatch.`)
  for (const r of rows.slice(0, 25)) {
    console.log(
      `  - ${r.courseId} "${r.courseName ?? 'Untitled'}"  current=${JSON.stringify(r.currentCategories)}  variant=${r.variantCategory}`
    )
  }
  if (rows.length > 25) console.log(`  … and ${rows.length - 25} more`)

  if (rows.length === 0) {
    console.log('[backfill] Nothing to do — all published courses match their variant category.')
    return
  }

  if (!APPLY) {
    console.log('\n[dry-run] No changes written. Re-run with --apply to perform the update.')
    return
  }

  let updated = 0
  for (const r of rows) {
    const res = await db.execute(sql`
      UPDATE "Course"
      SET "categories" = ARRAY[${r.variantCategory}],
          "updatedAt" = NOW()
      WHERE "id" = ${r.courseId}
    `)
    updated += Number(res.rowCount ?? 0)
  }

  console.log(`[backfill] Updated ${updated} published course(s).`)
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[backfill] Failed:', err)
    process.exit(1)
  })
