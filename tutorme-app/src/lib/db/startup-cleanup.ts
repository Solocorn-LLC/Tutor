/**
 * One-time (idempotent) data cleanup run on server boot, alongside the schema
 * fixes. Kept separate from schema drift because it mutates DATA, not structure.
 *
 * Removes ORPHANED live sessions: rows left behind when a course was deleted
 * before the delete flow ended its sessions (the FK set their courseId to null
 * but left them 'scheduled', so they lingered on the calendar and blocked
 * scheduler slots forever).
 *
 * Precise + safe: an orphan is identified as courseId IS NULL + an open status +
 * NO CalendarEvent referencing it. Genuine course-less sessions (ad-hoc) always
 * have a CalendarEvent, so they are never touched. Re-running deletes nothing.
 */

import { drizzleDb } from './drizzle'
import { sql } from 'drizzle-orm'

const CLEANUP_SQL = sql.raw(`
DELETE FROM "LiveSession"
WHERE "courseId" IS NULL
  AND "status" IN ('scheduled', 'active', 'preparing', 'live', 'paused')
  AND NOT EXISTS (
    SELECT 1 FROM "CalendarEvent" ce WHERE ce."externalId" = "LiveSession"."id"
  );
`)

/**
 * Backfill CourseLesson.sourceLessonId for published-variant lessons that
 * predate the linkage (drizzle/0066). We use the historical correlation —
 * template↔published lessons at the same `order` — which is the best we have for
 * existing rows; newly copied lessons are stamped at publish time. Idempotent:
 * only touches rows whose sourceLessonId is still NULL.
 */
const BACKFILL_SOURCE_LESSON_SQL = sql.raw(`
UPDATE "CourseLesson" AS pub
SET "sourceLessonId" = tmpl."id"
FROM "CourseVariant" cv
JOIN "CourseLesson" tmpl
  ON tmpl."courseId" = cv."templateCourseId"
  AND tmpl."order" = pub."order"
  AND tmpl."deletedAt" IS NULL
WHERE pub."courseId" = cv."publishedCourseId"
  AND pub."sourceLessonId" IS NULL
  AND pub."deletedAt" IS NULL;
`)

export async function applyStartupDataCleanup(): Promise<void> {
  try {
    const result = await drizzleDb.execute(CLEANUP_SQL)
    const count = (result as { rowCount?: number })?.rowCount ?? 0
    if (count > 0) {
      console.log(`[Server] Data cleanup: removed ${count} orphaned live session(s).`)
    }
  } catch (err) {
    // Never block boot on a cleanup — log and move on.
    console.error(
      '⚠️ [Server] Orphaned-session cleanup skipped:',
      err instanceof Error ? err.message : err
    )
  }

  try {
    const result = await drizzleDb.execute(BACKFILL_SOURCE_LESSON_SQL)
    const count = (result as { rowCount?: number })?.rowCount ?? 0
    if (count > 0) {
      console.log(`[Server] Data cleanup: backfilled sourceLessonId on ${count} lesson(s).`)
    }
  } catch (err) {
    console.error(
      '⚠️ [Server] sourceLessonId backfill skipped:',
      err instanceof Error ? err.message : err
    )
  }
}
