/**
 * One-time (idempotent) data cleanup run on server boot, alongside the schema
 * fixes. Kept separate from schema drift because it mutates DATA, not structure.
 *
 * Removes ORPHANED live sessions: rows left behind when a course was deleted
 * before the delete flow ended its sessions (the FK set their courseId to null
 * but left them 'scheduled', so they lingered on the calendar and blocked
 * scheduler slots forever).
 *
 * Only past sessions are removed, so a future scheduled session that temporarily
 * lacks a courseId (e.g. during publish) is never deleted on boot.
 *
 * Precise + safe: an orphan is identified as courseId IS NULL + an open status +
 * scheduledAt in the past + NO CalendarEvent referencing it. Genuine course-less
 * sessions (ad-hoc) always have a CalendarEvent, so they are never touched.
 * Re-running deletes nothing.
 */

import { drizzleDb } from './drizzle'
import { sql } from 'drizzle-orm'
import { expireOverdueOneOnOneBookings } from '@/lib/one-on-one/expire'
import { completeFinishedOneOnOneSessions } from '@/lib/one-on-one/complete'
import { expireStaleGroupSeats } from '@/lib/group-session/expire-seats'
import { completeFinishedGroupSessions } from '@/lib/group-session/complete'

const CLEANUP_SQL = sql.raw(`
DELETE FROM "LiveSession"
WHERE "courseId" IS NULL
  AND "status" IN ('scheduled', 'active', 'preparing', 'live', 'paused')
  AND "sessionType" <> 'GO_LIVE_DEMO'
  AND "scheduledAt" < NOW()
  AND NOT EXISTS (
    SELECT 1 FROM "CalendarEvent" ce WHERE ce."externalId" = "LiveSession"."id"
  );
`)

/**
 * Backfill published-course categories that were mutated after publish.
 * PR #1440 locks the UI/API going forward; this repair already-changed rows.
 * Source of truth is the CourseVariant row created at publish time. Idempotent:
 * only touches rows whose current categories differ from the variant category.
 */
const BACKFILL_PUBLISHED_COURSE_CATEGORY_SQL = sql.raw(`
UPDATE "Course" c
SET "categories" = ARRAY[cv."category"],
    "updatedAt" = NOW()
FROM "CourseVariant" cv
WHERE cv."publishedCourseId" = c."id"
  AND c."isPublished" = true
  AND (c."categories" IS NULL OR c."categories" <> ARRAY[cv."category"]);
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

  try {
    const result = await drizzleDb.execute(BACKFILL_PUBLISHED_COURSE_CATEGORY_SQL)
    const count = (result as { rowCount?: number })?.rowCount ?? 0
    if (count > 0) {
      console.log(
        `[Server] Data cleanup: restored original category on ${count} published course(s).`
      )
    }
  } catch (err) {
    console.error(
      '⚠️ [Server] Published-course category backfill skipped:',
      err instanceof Error ? err.message : err
    )
  }

  try {
    const count = await expireOverdueOneOnOneBookings()
    if (count > 0) {
      console.log(`[Server] Data cleanup: expired ${count} overdue unpaid 1-on-1 booking(s).`)
    }
  } catch (err) {
    console.error(
      '⚠️ [Server] 1-on-1 expiry sweep skipped:',
      err instanceof Error ? err.message : err
    )
  }

  try {
    const count = await completeFinishedOneOnOneSessions()
    if (count > 0) {
      console.log(`[Server] Data cleanup: completed ${count} finished 1-on-1 session(s).`)
    }
  } catch (err) {
    console.error(
      '⚠️ [Server] 1-on-1 completion sweep skipped:',
      err instanceof Error ? err.message : err
    )
  }

  try {
    const released = await expireStaleGroupSeats()
    if (released > 0) {
      console.log(`[Server] Data cleanup: released ${released} stale group seat reservation(s).`)
    }
    const completed = await completeFinishedGroupSessions()
    if (completed > 0) {
      console.log(`[Server] Data cleanup: completed ${completed} finished group session(s).`)
    }
  } catch (err) {
    console.error(
      '⚠️ [Server] group-session sweep skipped:',
      err instanceof Error ? err.message : err
    )
  }
}
