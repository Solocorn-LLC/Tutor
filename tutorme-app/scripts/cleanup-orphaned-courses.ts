/**
 * Clean up orphaned rows left by hard-deleted Courses (see
 * `scripts/audit-orphaned-courses.ts`). Deletes the orphaned parent rows —
 * LiveSession / CourseLesson / CalendarEvent / CourseEnrollment / BuilderTask /
 * OneOnOneBookingRequest / GroupSession — whose `courseId` points at a Course
 * that no longer exists, so the missing `courseId` FKs can eventually be enforced.
 *
 * SAFETY, by design:
 * - PROTECTS student work: any missing-course that still has `TaskSubmission`s is
 *   SKIPPED entirely (reported for manual handling). Nothing with submissions is
 *   touched.
 * - Verified against the prod FK graph: every enforced FK to these parents is
 *   CASCADE or SET NULL (no RESTRICT), so deleting a parent auto-removes its
 *   enforced children (DeployedMaterial, SessionRescheduleProposal,
 *   GroupSessionParticipant, OneOnOneReview) and never blocks. A couple of
 *   high-volume UNENFORCED children (BuilderTaskDmi, SessionParticipant) are
 *   deleted explicitly so the purge doesn't just move the orphan around.
 * - Runs inside ONE transaction: any error rolls the whole thing back.
 *
 * DRY RUN (default) — reports exactly what would be deleted; writes NOTHING:
 *   npm run cleanup:orphaned-courses
 * APPLY — performs the deletion (against the DIRECT prod URL, ideally after a snapshot):
 *   npm run cleanup:orphaned-courses -- --apply
 *
 * Does NOT add the FKs — that's a deliberate follow-up, only possible once the
 * protected (submission-bearing) courses are also resolved.
 */

import { sql } from 'drizzle-orm'
import { drizzleDb } from '../src/lib/db/drizzle'

const APPLY = process.argv.includes('--apply')

// Orphan predicate for a table's courseId column.
const orphanCids = (table: string, extra = '') =>
  sql.raw(`
  SELECT DISTINCT t."courseId" AS cid FROM "${table}" t
  WHERE t."courseId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Course" c WHERE c."id" = t."courseId")
    ${extra}
`)

async function rows<T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T[]> {
  const res = await drizzleDb.execute(q)
  return res.rows as T[]
}

const PARENTS = [
  'LiveSession',
  'CourseLesson',
  'CalendarEvent',
  'CourseEnrollment',
  'BuilderTask',
  'OneOnOneBookingRequest',
  'GroupSession',
]

async function main() {
  console.log(`=== Orphaned-course cleanup (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`)

  // 1) All missing-course ids (union across the parent tables).
  const allCids = new Set<string>()
  for (const t of PARENTS)
    for (const r of await rows<{ cid: string }>(orphanCids(t))) allCids.add(r.cid)

  // 2) Protected = any missing-course whose tasks still have student submissions.
  const protectedRows = await rows<{ cid: string; n: number }>(sql`
    SELECT bt."courseId" AS cid, count(*)::int AS n
    FROM "TaskSubmission" s JOIN "BuilderTask" bt ON bt."id" = s."taskId"
    WHERE bt."courseId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "Course" c WHERE c."id" = bt."courseId")
    GROUP BY bt."courseId"
  `)
  const protectedIds = new Set(protectedRows.map(r => r.cid))
  const safe = [...allCids].filter(cid => !protectedIds.has(cid))

  console.log(`Missing courses total:        ${allCids.size}`)
  console.log(
    `Protected (has submissions):  ${protectedIds.size}  → SKIPPED (student work preserved)`
  )
  console.log(`Safe to purge:                ${safe.length}\n`)
  if (protectedIds.size > 0) {
    console.log('  Protected course ids (handle separately — export/keep or recreate a Course):')
    for (const r of protectedRows)
      console.log(`   · ${r.cid}  (${r.n} submission${r.n === 1 ? '' : 's'})`)
    console.log('')
  }
  if (safe.length === 0) {
    console.log('Nothing safe to purge.')
    return
  }

  const safeArr = sql`ARRAY[${sql.join(
    safe.map(s => sql`${s}`),
    sql`, `
  )}]::text[]`

  // 3) Count what would be deleted (parents + the two explicit unenforced children).
  console.log('— Rows that will be deleted (safe courses only) —')
  for (const t of PARENTS) {
    const tIdent = sql.raw(`"${t}"`)
    const [{ n }] = await rows<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM ${tIdent} WHERE "courseId" = ANY(${safeArr})`
    )
    console.log(`  ${t}: ${n}`)
  }
  const [{ n: dmiN }] = await rows<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM "BuilderTaskDmi" d
    WHERE d."taskId" IN (SELECT "id" FROM "BuilderTask" WHERE "courseId" = ANY(${safeArr}))`)
  const [{ n: spN }] = await rows<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM "SessionParticipant" p
    WHERE p."sessionId" IN (SELECT "id" FROM "LiveSession" WHERE "courseId" = ANY(${safeArr}))`)
  console.log(`  BuilderTaskDmi (via task): ${dmiN}`)
  console.log(`  SessionParticipant (via session): ${spN}`)
  console.log(
    '  (+ enforced-CASCADE children auto-removed: DeployedMaterial, SessionRescheduleProposal,\n' +
      '   GroupSessionParticipant, OneOnOneReview.)'
  )

  if (!APPLY) {
    console.log(
      '\n[dry-run] Nothing written. Re-run with --apply (against the DIRECT url) to purge.'
    )
    return
  }

  // 4) APPLY — one transaction; rolls back entirely on any error.
  await drizzleDb.transaction(async tx => {
    const del = (q: ReturnType<typeof sql>) => tx.execute(q)
    // explicit unenforced-FK children first
    await del(
      sql`DELETE FROM "BuilderTaskDmi" WHERE "taskId" IN (SELECT "id" FROM "BuilderTask" WHERE "courseId" = ANY(${safeArr}))`
    )
    await del(
      sql`DELETE FROM "SessionParticipant" WHERE "sessionId" IN (SELECT "id" FROM "LiveSession" WHERE "courseId" = ANY(${safeArr}))`
    )
    // parents (enforced children cascade / set-null automatically)
    for (const t of PARENTS) {
      const tIdent = sql.raw(`"${t}"`)
      await del(sql`DELETE FROM ${tIdent} WHERE "courseId" = ANY(${safeArr})`)
    }
  })
  console.log('\n[applied] Purge complete (single transaction).')
  console.log(
    'Next: resolve the protected courses above, then add the missing courseId FKs via startup-schema-fix.'
  )
}

main()
  .catch(err => {
    console.error('[cleanup] failed (nothing committed):', err)
    process.exit(1)
  })
  .finally(() => process.exit(0))
