/**
 * Materialize a course's weekly schedule into real LiveSession + CalendarEvent
 * rows so it shows on the tutor/student calendars.
 *
 * The full publish flow (`/api/tutor/courses/[id]/publish`) does this inline with
 * availability/conflict checks. The lighter "add a schedule" entry points (the
 * dashboard ScheduleViewModal → `POST /api/tutor/courses/[id]/schedules`) only
 * persisted the CourseSchedule pattern and never created sessions, so the schedule
 * never reached the calendar. This shared helper closes that gap.
 */

import { and, eq, gt, inArray, isNotNull, isNull } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, calendarEvent } from '@/lib/db/schema'
import { zonedWallClockToUtc, zonedWeekday, zonedDateParts } from '@/lib/time/tz'
import { createSession } from './create-session'
import { findConflicts } from '@/lib/schedule/conflicts'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/lib/db/schema'

const DAY_MAP: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

/**
 * Markers written into liveSession.description when a future session is
 * deliberately ended without being a real past session:
 * - `[cancelled]` — a single occurrence the tutor cancelled via
 *   PATCH /api/tutor/sessions/[id].
 * - `[rescheduled-away]` — the tombstone left at the OLD instant when a
 *   consent-reschedule moves an occurrence to a new time.
 *
 * Plain ended rows (no marker) are retirements from schedule edits or
 * cleanup sweeps: an explicit pattern re-affirm (schedule re-save / re-publish)
 * may legitimately resurrect those. Marked rows must never be resurrected.
 */
export const LIVE_SESSION_CANCELLED_MARKER = '[cancelled]'
export const LIVE_SESSION_RESCHEDULED_AWAY_MARKER = '[rescheduled-away]'

export function isDeliberateTombstone(description: string | null | undefined): boolean {
  if (!description) return false
  return (
    description.includes(LIVE_SESSION_CANCELLED_MARKER) ||
    description.includes(LIVE_SESSION_RESCHEDULED_AWAY_MARKER)
  )
}

/**
 * Clamp a user-supplied weeksToSchedule to a sane integer in [1, 52] so a
 * malformed payload can never materialize decades of sessions.
 * Missing / NaN / non-numeric input falls back to 8 (the historical default).
 */
export function clampWeeksToSchedule(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 8
  return Math.min(52, Math.max(1, Math.round(n)))
}

export interface ScheduleSlotInput {
  dayOfWeek: string
  startTime: string
  durationMinutes?: number
  /** Expanded slots carry a concrete `YYYY-MM-DD`; pure weekly patterns don't. */
  date?: string
}

/**
 * Generate the future session instants for a schedule, in the tutor's timezone.
 * Mirrors the publish route's generateSessionDates: honours per-slot dates when
 * present, otherwise repeats the weekday for `weeksAhead` weeks, and skips any
 * instant within the next hour.
 */
export function generateScheduleSessionDates(
  schedule: ScheduleSlotInput[],
  weeksAhead = 8,
  timeZone = 'UTC',
  skipPast = true,
  now?: Date
): Array<{ scheduledAt: Date; durationMinutes: number }> {
  const sessions: Array<{ scheduledAt: Date; durationMinutes: number }> = []
  // Skip sessions that are already in the past (with a 1-minute buffer) so we
  // don't create sessions that have already started. We no longer skip future
  // sessions within the next hour — a schedule published shortly before a slot
  // should still include that slot.
  const referenceNow = now ?? new Date()
  const cutoffMs = skipPast ? referenceNow.getTime() - 60 * 1000 : 0

  const addDays = (year: number, month: number, day: number, n: number) => {
    const t = new Date(Date.UTC(year, month - 1, day + n))
    return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }
  }

  for (const slot of schedule) {
    const targetDay = DAY_MAP[slot.dayOfWeek]
    if (targetDay === undefined) continue

    const timeParts = (slot.startTime ?? '').split(':')
    if (timeParts.length !== 2) continue
    const hours = parseInt(timeParts[0], 10)
    const minutes = parseInt(timeParts[1], 10)
    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    )
      continue

    const durationMinutes = slot.durationMinutes || 60

    if (slot.date) {
      const [year, month, day] = slot.date.split('-').map(Number)
      if (!year || !month || !day) continue
      const sessionDate = zonedWallClockToUtc(year, month, day, hours, minutes, timeZone)
      if (isNaN(sessionDate.getTime())) continue
      if (sessionDate.getTime() < cutoffMs) continue
      sessions.push({ scheduledAt: sessionDate, durationMinutes })
      continue
    }

    // Next occurrence of this weekday in the tutor's timezone.
    const todayZ = zonedDateParts(referenceNow, timeZone)
    const todayWeekday = zonedWeekday(referenceNow, timeZone)
    const daysUntil = (targetDay - todayWeekday + 7) % 7
    let occ = addDays(todayZ.year, todayZ.month, todayZ.day, daysUntil)
    let first = zonedWallClockToUtc(occ.year, occ.month, occ.day, hours, minutes, timeZone)
    if (first.getTime() < cutoffMs) {
      occ = addDays(occ.year, occ.month, occ.day, 7)
      first = zonedWallClockToUtc(occ.year, occ.month, occ.day, hours, minutes, timeZone)
    }

    for (let w = 0; w < weeksAhead; w++) {
      const wk = addDays(occ.year, occ.month, occ.day, w * 7)
      const sessionDate = zonedWallClockToUtc(wk.year, wk.month, wk.day, hours, minutes, timeZone)
      if (isNaN(sessionDate.getTime())) continue
      sessions.push({ scheduledAt: sessionDate, durationMinutes })
    }
  }

  sessions.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  return sessions
}

export interface MaterializeScheduleOptions {
  tutorId: string
  courseId: string
  scheduleId: string
  slots: ScheduleSlotInput[]
  weeksToSchedule?: number
  /** Tutor's timezone (from calendarAvailability); defaults to UTC. */
  timezone?: string
  /** Reference clock for slot generation (rolling re-materialization, tests);
   *  defaults to the real clock so existing callers are unaffected. */
  now?: Date
  maxStudents?: number | null
  title: string
  category: string
  description?: string | null
  /** Precomputed slot instants (see generateScheduleSessionDates). When omitted
   *  they are derived from `slots` — pass them when the caller already generated
   *  the same list so slot-keeping logic compares against identical instants. */
  dates?: Array<{ scheduledAt: Date; durationMinutes: number }>
  /**
   * Hard cap on materialization: occurrences strictly after this instant are
   * dropped before any duplicate/conflict checks (counted in
   * `result.beyondHorizon` and logged). Used by the rolling re-materialization
   * job to enforce each schedule's own horizon; omit for uncapped flows
   * (publish, schedule edit).
   */
  horizonEnd?: Date
  /**
   * How to treat an EXISTING but ENDED session at a generated instant.
   * Default (false): the ended row is honoured as a deliberate cancellation —
   * nothing is created, so unattended backfill runs (the rolling job) never
   * resurrect sessions a tutor cancelled or a cleanup retired. Pass true only
   * when the caller is an explicit tutor action that re-affirms the whole
   * pattern (schedule re-save), where a retired slot the pattern still
   * generates should come back. Ended rows marked as deliberate tombstones
   * (`[cancelled]` / `[rescheduled-away]`, see isDeliberateTombstone) are
   * NEVER recreated — they represent a slot the tutor intentionally removed,
   * not a stale retirement from a previous edit.
   */
  recreateRetiredSlots?: boolean
}

export interface SkippedScheduleSlot {
  scheduledAt: Date
  durationMinutes: number
  reason: string
}

export interface MaterializeScheduleResult {
  /** Sessions created during this run. */
  created: number
  /** Slots already represented by an existing row (live, or retired and left retired). */
  kept: number
  /** Slots that could NOT be materialized (e.g. tutor conflict) — surfaced so
   *  callers can warn the tutor instead of silently dropping the slot. */
  skippedSlots: SkippedScheduleSlot[]
  /** Occurrences dropped because they fell after `horizonEnd` (0 when no cap). */
  beyondHorizon: number
}

/** Desired display/capacity attributes for a kept session. */
export interface KeptSessionAttributes {
  title: string
  category: string
  description?: string | null
  /** Effective cap — callers resolve their own default (e.g. `?? 50`). */
  maxStudents: number
}

/**
 * Propagate course/schedule attribute changes onto a KEPT (already-existing)
 * session. Without this, editing the course (e.g. lowering maxStudents 50→10)
 * and re-publishing / re-materializing leaves every future session carrying
 * the stale values — the new cap would silently not be enforced.
 *
 * Only cheap differing-field updates: title / category / description /
 * maxStudents on liveSession, plus the matching title / description /
 * maxAttendees on its CalendarEvent projection. NEVER touches lessonId,
 * roomId/roomUrl, status, scheduledAt, or participants.
 *
 * Returns true when liveSession was actually patched.
 */
export async function refreshKeptSessionAttributes(
  sessionId: string,
  attrs: KeptSessionAttributes,
  tx?: NodePgDatabase<typeof schema>
): Promise<boolean> {
  const db = tx ?? drizzleDb
  const [row] = await db
    .select({
      title: liveSession.title,
      category: liveSession.category,
      description: liveSession.description,
      maxStudents: liveSession.maxStudents,
    })
    .from(liveSession)
    .where(eq(liveSession.sessionId, sessionId))
    .limit(1)
  if (!row) return false

  const patch: Partial<typeof liveSession.$inferInsert> = {}
  if (row.title !== attrs.title) patch.title = attrs.title
  if (row.category !== attrs.category) patch.category = attrs.category
  const newDesc = attrs.description ?? null
  if ((row.description ?? null) !== newDesc) patch.description = newDesc
  if ((row.maxStudents ?? null) !== attrs.maxStudents) patch.maxStudents = attrs.maxStudents

  if (Object.keys(patch).length === 0) return false

  await db.update(liveSession).set(patch).where(eq(liveSession.sessionId, sessionId))

  const cePatch: Partial<typeof calendarEvent.$inferInsert> = {}
  if (patch.title !== undefined) cePatch.title = attrs.title
  if (patch.description !== undefined) cePatch.description = newDesc
  if (patch.maxStudents !== undefined) cePatch.maxAttendees = attrs.maxStudents
  if (Object.keys(cePatch).length > 0) {
    await db
      .update(calendarEvent)
      .set(cePatch)
      .where(and(eq(calendarEvent.externalId, sessionId), isNull(calendarEvent.deletedAt)))
  }
  return true
}

/**
 * Create LiveSession + CalendarEvent rows for every future occurrence of a
 * schedule.
 *
 * Hardening:
 * - Slots where an equivalent session already exists for the same schedule
 *   are kept as-is (counted in `kept`). An ENDED session at the exact instant
 *   counts as "already exists" unless `recreateRetiredSlots` is set — ended
 *   rows are deliberate cancellations, not gaps (the rolling job must not
 *   resurrect what a tutor cancelled; only a true gap — no row at all — is
 *   backfilled).
 * - Slots that overlap with the tutor's existing live sessions, calendar
 *   events, or confirmed 1-on-1 bookings are NOT created; they are returned in
 *   `skippedSlots` so the caller can surface the dropped slot to the tutor.
 */
export async function materializeScheduleSessions(
  opts: MaterializeScheduleOptions,
  tx?: NodePgDatabase<typeof schema>
): Promise<MaterializeScheduleResult> {
  const generated =
    opts.dates ??
    generateScheduleSessionDates(
      opts.slots,
      clampWeeksToSchedule(opts.weeksToSchedule),
      opts.timezone ?? 'UTC',
      true,
      opts.now
    )

  // Horizon cap (rolling re-materialization): the schedule's own horizon ends
  // at scheduleStart + weeksToSchedule, so occurrences past that point must
  // never be created — even though generation anchors at "now" and would
  // otherwise keep producing them. Drop before duplicate/conflict checks so
  // capped occurrences are not even counted as "kept".
  let dates = generated
  let beyondHorizon = 0
  if (opts.horizonEnd) {
    const horizonMs = opts.horizonEnd.getTime()
    dates = generated.filter(d => d.scheduledAt.getTime() <= horizonMs)
    beyondHorizon = generated.length - dates.length
    if (beyondHorizon > 0) {
      console.log(
        `[materializeScheduleSessions] schedule ${opts.scheduleId}: ` +
          `dropped ${beyondHorizon} occurrence(s) beyond horizon ` +
          opts.horizonEnd.toISOString()
      )
    }
  }

  const db = tx ?? drizzleDb
  const result: MaterializeScheduleResult = { created: 0, kept: 0, skippedSlots: [], beyondHorizon }
  for (const d of dates) {
    const endTime = new Date(d.scheduledAt.getTime() + d.durationMinutes * 60000)

    // Duplicate guard: any existing session for this exact schedule slot —
    // live OR ended — means this instant is already accounted for. An ended
    // row is a deliberate cancellation (tutor cancelled the occurrence, a
    // cleanup retired it); it must not be resurrected by an unattended
    // backfill run. Callers that re-affirm the whole pattern (schedule
    // re-save) pass recreateRetiredSlots to materialize over retired rows —
    // but never over marked tombstones (see isDeliberateTombstone).
    const [existing] = await db
      .select({
        sessionId: liveSession.sessionId,
        status: liveSession.status,
        title: liveSession.title,
        category: liveSession.category,
        description: liveSession.description,
        maxStudents: liveSession.maxStudents,
      })
      .from(liveSession)
      .where(
        and(
          eq(liveSession.tutorId, opts.tutorId),
          eq(liveSession.courseId, opts.courseId),
          eq(liveSession.scheduleId, opts.scheduleId),
          eq(liveSession.scheduledAt, d.scheduledAt)
        )
      )
      .limit(1)

    if (existing && (existing.status !== 'ended' || !opts.recreateRetiredSlots)) {
      result.kept++
      // Propagate attribute changes (title/category/description/maxStudents)
      // onto the kept session so a lowered cap or renamed course is actually
      // enforced. Best-effort: a refresh hiccup must not block the rest.
      if (existing.status !== 'ended') {
        try {
          await refreshKeptSessionAttributes(
            existing.sessionId,
            {
              title: opts.title,
              category: opts.category,
              description: opts.description,
              maxStudents: opts.maxStudents ?? 50,
            },
            tx
          )
        } catch (err) {
          console.error(
            `[materializeScheduleSessions] failed to refresh kept session ${existing.sessionId}:`,
            err
          )
        }
      }
      continue
    }

    // recreateRetiredSlots is set, but a MARKED ended row (tutor-cancelled
    // occurrence, reschedule-away tombstone) is a deliberate removal, not a
    // stale retirement from a previous edit — keep it dead.
    if (existing && existing.status === 'ended' && isDeliberateTombstone(existing.description)) {
      result.kept++
      continue
    }

    // Conflict guard: avoid overlapping with the tutor's existing commitments.
    const conflicts = await findConflicts(opts.tutorId, d.scheduledAt, endTime)
    if (conflicts.length > 0) {
      console.warn(
        `[materializeScheduleSessions] skipping conflicting slot for schedule ${opts.scheduleId} at ${d.scheduledAt.toISOString()}:`,
        conflicts.map(c => ({ type: c.type, id: c.id, title: c.title }))
      )
      result.skippedSlots.push({
        scheduledAt: d.scheduledAt,
        durationMinutes: d.durationMinutes,
        reason: 'conflict',
      })
      continue
    }

    try {
      await createSession(
        {
          tutorId: opts.tutorId,
          title: opts.title,
          scheduledAt: d.scheduledAt,
          durationMinutes: d.durationMinutes,
          category: opts.category,
          type: 'COURSE',
          courseId: opts.courseId,
          scheduleId: opts.scheduleId,
          description: opts.description ?? undefined,
          status: 'scheduled',
          maxStudents: opts.maxStudents ?? 50,
          timezone: 'UTC',
        },
        tx
      )
      result.created++
    } catch (err) {
      // A concurrent materialization (rolling job vs publish) can insert the
      // same instant between the duplicate-guard check above and this insert.
      // Postgres' unique-violation code means the slot is already accounted
      // for by the other writer — count it as kept, not as a failure.
      if ((err as { code?: string }).code === '23505') {
        result.kept++
        continue
      }
      throw err
    }
  }

  if (result.kept > 0 || result.skippedSlots.length > 0) {
    console.log(
      `[materializeScheduleSessions] schedule ${opts.scheduleId}: created ${result.created}, kept ${result.kept}, skipped ${result.skippedSlots.length}`
    )
  }
  return result
}

/**
 * Retire the FUTURE, not-yet-started sessions materialized from a schedule so
 * they leave the calendar — used when a schedule's times change (before
 * re-materializing) or when a schedule is removed. Past/active sessions are
 * left untouched. Soft-retires (status 'ended' + calendarEvent cancelled) rather
 * than hard-deleting, to avoid touching rows other tables may reference.
 * Returns the number of sessions retired.
 */
export async function clearFutureScheduleSessions(scheduleId: string): Promise<number> {
  const now = new Date()
  const future = await drizzleDb
    .select({ sessionId: liveSession.sessionId })
    .from(liveSession)
    .where(
      and(
        eq(liveSession.scheduleId, scheduleId),
        eq(liveSession.status, 'scheduled'),
        gt(liveSession.scheduledAt, now)
      )
    )
  if (future.length === 0) return 0
  const ids = future.map(s => s.sessionId)
  await drizzleDb
    .update(liveSession)
    .set({ status: 'ended', endedAt: now })
    .where(inArray(liveSession.sessionId, ids))
  await drizzleDb
    .update(calendarEvent)
    .set({ isCancelled: true, deletedAt: now })
    .where(inArray(calendarEvent.externalId, ids))
  return ids.length
}

/**
 * Retire only the STALE future sessions of a schedule: future, not-yet-started
 * sessions whose scheduledAt is NOT one of `keepInstants`. Used when a schedule
 * is re-saved so that unchanged slots keep their existing sessions (and their
 * lesson assignments / room / participants) while removed or moved slots are
 * retired before re-materialization. Returns the number of sessions retired.
 */
export async function clearStaleScheduleSessions(
  scheduleId: string,
  keepInstants: Date[]
): Promise<number> {
  const now = new Date()
  const keep = new Set(keepInstants.map(d => new Date(d).getTime()))
  const future = await drizzleDb
    .select({ sessionId: liveSession.sessionId, scheduledAt: liveSession.scheduledAt })
    .from(liveSession)
    .where(
      and(
        eq(liveSession.scheduleId, scheduleId),
        eq(liveSession.status, 'scheduled'),
        gt(liveSession.scheduledAt, now)
      )
    )
  const stale = future.filter(s => s.scheduledAt && !keep.has(new Date(s.scheduledAt).getTime()))
  if (stale.length === 0) return 0
  const ids = stale.map(s => s.sessionId)
  await drizzleDb
    .update(liveSession)
    .set({ status: 'ended', endedAt: now })
    .where(inArray(liveSession.sessionId, ids))
  await drizzleDb
    .update(calendarEvent)
    .set({ isCancelled: true, deletedAt: now })
    .where(inArray(calendarEvent.externalId, ids))
  return ids.length
}

/**
 * Retire future, not-yet-started 'scheduled' COURSE sessions of a course that
 * its current schedule patterns no longer produce:
 * - sessions whose scheduleId no longer belongs to the course (the schedule
 *   row was removed), and
 * - sessions whose instant their schedule's current pattern no longer
 *   generates (e.g. weeksToSchedule trimmed, slot times changed).
 *
 * One-time sessions (scheduleId null) and sessions at still-generated
 * instants are left untouched. Used by the publish flow after it
 * re-materializes a variant, because publish historically only ever ADDED
 * sessions — ghosts from removed schedules or old patterns accumulated
 * forever. Soft-retires (status 'ended' + calendar event cancelled) like the
 * other clear* helpers. Returns the number of sessions retired.
 */
export async function clearOrphanedScheduleSessions(
  courseId: string,
  validInstantsBySchedule: Map<string, Set<number>>,
  now: Date,
  tx?: NodePgDatabase<typeof schema>
): Promise<number> {
  const db = tx ?? drizzleDb
  const future = await db
    .select({
      sessionId: liveSession.sessionId,
      scheduleId: liveSession.scheduleId,
      scheduledAt: liveSession.scheduledAt,
    })
    .from(liveSession)
    .where(
      and(
        eq(liveSession.courseId, courseId),
        eq(liveSession.status, 'scheduled'),
        gt(liveSession.scheduledAt, now),
        isNotNull(liveSession.scheduleId)
      )
    )
  const stale = future.filter(s => {
    if (!s.scheduleId || !s.scheduledAt) return false
    const valid = validInstantsBySchedule.get(s.scheduleId)
    return !valid || !valid.has(new Date(s.scheduledAt).getTime())
  })
  if (stale.length === 0) return 0
  const ids = stale.map(s => s.sessionId)
  await db
    .update(liveSession)
    .set({ status: 'ended', endedAt: now })
    .where(inArray(liveSession.sessionId, ids))
  await db
    .update(calendarEvent)
    .set({ isCancelled: true, deletedAt: now })
    .where(inArray(calendarEvent.externalId, ids))
  return ids.length
}
