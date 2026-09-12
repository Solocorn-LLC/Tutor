/**
 * Rolling schedule re-materialization.
 *
 * Sessions were only materialized when a course was published or a schedule was
 * edited — exactly `weeksToSchedule` weeks from that moment. Nothing ever topped
 * them up, so ~8 weeks after the last publish/edit a course silently ran out of
 * sessions on everyone's calendars. This job re-runs materialization for every
 * published course's schedule on a 24h cadence. The duplicate guard inside
 * materializeScheduleSessions makes re-runs idempotent: already-materialized
 * slots are kept as-is and only newly entered weeks create sessions.
 *
 * Liveness gate: only ACTIVE courses are topped up — a course counts as active
 * when it has any session (regardless of status) scheduled within the last
 * ACTIVE_WINDOW_DAYS, or its row was updated within that window. Without this
 * gate, long-abandoned courses that were never unpublished (and schedules that
 * were persisted by entry points which never materialized them) suddenly sprout
 * weeks of new session cards the first time the job runs.
 */

import { and, asc, eq, exists, gte, isNull, notInArray, or } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  calendarAvailability,
  course,
  courseSchedule,
  courseVariant,
  liveSession,
} from '@/lib/db/schema'
import {
  generateScheduleSessionDates,
  materializeScheduleSessions,
  type ScheduleSlotInput,
} from './materialize-schedule'

export interface RollingMaterializationOptions {
  /** How many weeks ahead to materialize on each run. Defaults to 8. */
  weeksAhead?: number
  /** Reference clock override (integration tests). Defaults to the real clock. */
  now?: Date
  /** Max course schedules processed per run. Defaults to 500. */
  limitPerRun?: number
}

export interface RollingMaterializationResult {
  schedulesScanned: number
  schedulesToppedUp: number
  sessionsCreated: number
  errors: number
}

/** How often the rolling re-materialization runs. */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
/** Delay the first run so it doesn't compete with cold-start work. */
const INITIAL_DELAY_MS = 60 * 1000
const DEFAULT_WEEKS_AHEAD = 8
const DEFAULT_LIMIT_PER_RUN = 500
/**
 * A course is topped up only when it shows activity within this window: any
 * session scheduled in it (regardless of status — past sessions are 'ended')
 * or a recent course update. 70 days ≈ the 8-week materialization horizon
 * plus slack, so an active course that consumed its window still qualifies
 * while a course dead for months does not.
 */
const ACTIVE_WINDOW_DAYS = 70

/**
 * Map a stored CourseSchedule `schedule` JSON payload to ScheduleSlotInput[].
 * Same slot shape the publish/schedules routes consume ({ dayOfWeek, startTime,
 * durationMinutes?, date? }); defensive about malformed entries so one bad slot
 * can't take down the whole run.
 */
function toScheduleSlotInputs(payload: unknown): ScheduleSlotInput[] {
  if (!Array.isArray(payload)) return []
  const slots: ScheduleSlotInput[] = []
  for (const item of payload as Array<Record<string, unknown>>) {
    if (!item || typeof item !== 'object') continue
    const { dayOfWeek, startTime, durationMinutes, date } = item
    if (typeof dayOfWeek !== 'string' || typeof startTime !== 'string') continue
    const slot: ScheduleSlotInput = { dayOfWeek, startTime }
    if (typeof durationMinutes === 'number' && Number.isFinite(durationMinutes)) {
      slot.durationMinutes = durationMinutes
    }
    if (typeof date === 'string') slot.date = date
    slots.push(slot)
  }
  return slots
}

/**
 * One pass over every ACTIVE published course's schedules: re-derive the future
 * slot instants (weeksAhead from now, in the tutor's timezone) and materialize
 * the ones that don't exist yet. Per-schedule failures are logged and counted
 * but never abort the run.
 */
export async function runRollingScheduleMaterialization(
  opts: RollingMaterializationOptions = {}
): Promise<RollingMaterializationResult> {
  const startedAt = Date.now()
  const weeksAhead = opts.weeksAhead ?? DEFAULT_WEEKS_AHEAD
  const limitPerRun = opts.limitPerRun ?? DEFAULT_LIMIT_PER_RUN
  const result: RollingMaterializationResult = {
    schedulesScanned: 0,
    schedulesToppedUp: 0,
    sessionsCreated: 0,
    errors: 0,
  }

  // Only PUBLISHED courses. Templates are never themselves published (their
  // variants are), and belt-and-braces we also exclude any course that is the
  // template of a variant: template-scoped sessions would appear under every
  // variant of that template.
  const templateIds = drizzleDb
    .select({ templateCourseId: courseVariant.templateCourseId })
    .from(courseVariant)

  // Liveness gate (see file header): skip courses with no session scheduled
  // within the active window and no recent update — topping those up resurrects
  // abandoned courses with weeks of unwanted session cards.
  const activeCutoff = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const recentSession = drizzleDb
    .select({ sessionId: liveSession.sessionId })
    .from(liveSession)
    .where(
      and(eq(liveSession.courseId, course.courseId), gte(liveSession.scheduledAt, activeCutoff))
    )

  const rows = await drizzleDb
    .select({
      scheduleId: courseSchedule.scheduleId,
      courseId: courseSchedule.courseId,
      schedule: courseSchedule.schedule,
      weeksToSchedule: courseSchedule.weeksToSchedule,
      maxStudents: courseSchedule.maxStudents,
      tutorId: course.creatorId,
      courseName: course.name,
      categories: course.categories,
    })
    .from(courseSchedule)
    .innerJoin(course, eq(course.courseId, courseSchedule.courseId))
    .where(
      and(
        eq(course.isPublished, true),
        isNull(course.deletedAt),
        notInArray(course.courseId, templateIds),
        or(exists(recentSession), gte(course.updatedAt, activeCutoff))
      )
    )
    .orderBy(asc(courseSchedule.scheduleId))
    .limit(limitPerRun)

  result.schedulesScanned = rows.length

  // Tutor timezone cache for this run (all availability rows share one zone).
  const timezoneCache = new Map<string, string>()
  const timezoneFor = async (tutorId: string): Promise<string> => {
    const cached = timezoneCache.get(tutorId)
    if (cached) return cached
    const [row] = await drizzleDb
      .select({ timezone: calendarAvailability.timezone })
      .from(calendarAvailability)
      .where(eq(calendarAvailability.tutorId, tutorId))
      .limit(1)
    const timezone = row?.timezone || 'UTC'
    timezoneCache.set(tutorId, timezone)
    return timezone
  }

  for (const row of rows) {
    try {
      // A schedule without an owning tutor can't be materialized (sessions are
      // keyed by tutorId) — skip rather than create orphan rows.
      if (!row.tutorId) continue

      const slots = toScheduleSlotInputs(row.schedule)
      if (slots.length === 0) continue

      const timezone = await timezoneFor(row.tutorId)
      const dates = generateScheduleSessionDates(slots, weeksAhead, timezone, true, opts.now)
      if (dates.length === 0) continue

      const materialized = await materializeScheduleSessions({
        tutorId: row.tutorId,
        courseId: row.courseId,
        scheduleId: row.scheduleId,
        slots,
        weeksToSchedule: weeksAhead,
        timezone,
        now: opts.now,
        maxStudents: row.maxStudents,
        title: row.courseName || 'Live Session',
        category: row.categories?.[0] || 'General',
        dates,
      })

      if (materialized.created > 0) result.schedulesToppedUp++
      result.sessionsCreated += materialized.created
    } catch (err) {
      result.errors++
      console.error(`[rolling-materialization] schedule ${row.scheduleId} failed:`, err)
    }
  }

  console.log(
    `[rolling-materialization] scanned ${result.schedulesScanned} schedule(s), ` +
      `topped up ${result.schedulesToppedUp}, created ${result.sessionsCreated} session(s), ` +
      `${result.errors} error(s) in ${Date.now() - startedAt}ms`
  )
  return result
}

let started = false

/** Idempotent — starts the periodic re-materialization loop once per process. */
export function startRollingMaterializationScheduler(): void {
  if (started) return
  started = true

  const tick = () => {
    // A failed run must never crash the server process.
    void runRollingScheduleMaterialization().catch(err =>
      console.error('[rolling-materialization] tick error:', err)
    )
  }

  setTimeout(tick, INITIAL_DELAY_MS)
  const handle = setInterval(tick, CHECK_INTERVAL_MS)
  // Don't keep the process alive solely for this timer.
  if (typeof handle.unref === 'function') handle.unref()

  console.log('[rolling-materialization] scheduler started')
}
