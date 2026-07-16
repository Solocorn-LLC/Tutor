/**
 * One-off backfill: copy `GroupSession.courseId` onto its `LiveSession.courseId`
 * for group sessions created before the course-linkage feature (#1070/#1076),
 * whose `LiveSession.courseId` is still NULL.
 *
 * Why: the in-call classroom reads the linked course from `LiveSession.courseId`
 * (Edit-course button, deploy scoping, and the course chip added in #1154). New
 * group sessions set it at create time via `createSession`; older ones only have
 * it on the `GroupSession` row (which is what the session CARD shows), so they
 * look course-less once live. This copies it across.
 *
 * DRY RUN (default) — prints how many rows would change + a sample, writes nothing:
 *   npx tsx scripts/backfill-group-session-course.ts
 *
 * APPLY — performs the update:
 *   npx tsx scripts/backfill-group-session-course.ts --apply
 *
 * Runs against whatever the process env points at (DATABASE_URL / DIRECT_URL) —
 * use the DIRECT (non-pooled) prod URL when applying to prod.
 *
 * Idempotent + safe:
 * - only touches `LiveSession` rows where `courseId IS NULL` and the linked
 *   `GroupSession.courseId IS NOT NULL`, so re-running after completion is a no-op;
 * - the `LiveSession.courseId` FK is `onDelete: set null`, so a non-null
 *   `GroupSession.courseId` always references an existing course row — no FK risk.
 */

import { sql } from 'drizzle-orm'
import { drizzleDb } from '../src/lib/db/drizzle'

const APPLY = process.argv.includes('--apply')

interface PreviewRow {
  liveSessionId: string
  groupSessionId: string
  courseId: string
  title: string | null
}

async function main() {
  // Everything that would change — for review before (and verification after).
  const preview = await drizzleDb.execute(sql`
    SELECT ls."id" AS "liveSessionId",
           gs."id" AS "groupSessionId",
           gs."courseId" AS "courseId",
           gs."title" AS "title"
    FROM "LiveSession" ls
    JOIN "GroupSession" gs ON gs."liveSessionId" = ls."id"
    WHERE gs."courseId" IS NOT NULL
      AND ls."courseId" IS NULL
    ORDER BY gs."createdAt" DESC
  `)
  const rows = preview.rows as unknown as PreviewRow[]

  console.log(
    `[backfill] ${rows.length} group session(s) have a course but a NULL LiveSession.courseId.`
  )
  for (const r of rows.slice(0, 25)) {
    console.log(
      `  - liveSession ${r.liveSessionId}  ←  course ${r.courseId}  ("${r.title ?? 'Untitled'}")`
    )
  }
  if (rows.length > 25) console.log(`  … and ${rows.length - 25} more`)

  if (rows.length === 0) {
    console.log('[backfill] Nothing to do — all group sessions already have LiveSession.courseId.')
    return
  }

  if (!APPLY) {
    console.log('\n[dry-run] No changes written. Re-run with --apply to perform the update.')
    return
  }

  const res = await drizzleDb.execute(sql`
    UPDATE "LiveSession" ls
    SET "courseId" = gs."courseId"
    FROM "GroupSession" gs
    WHERE gs."liveSessionId" = ls."id"
      AND gs."courseId" IS NOT NULL
      AND ls."courseId" IS NULL
  `)
  console.log(`\n[applied] Updated ${res.rowCount ?? '(unknown)'} LiveSession row(s).`)
}

main()
  .catch(err => {
    console.error('[backfill] failed:', err)
    process.exit(1)
  })
  .finally(() => process.exit(0))
