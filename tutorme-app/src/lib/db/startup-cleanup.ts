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
}
