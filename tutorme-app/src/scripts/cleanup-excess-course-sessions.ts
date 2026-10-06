/**
 * One-time cleanup: retire sessions ABOVE a published course schedule's
 * configured size on ACTIVE courses.
 *
 * Background: the rolling re-materialization job topped schedules up on every
 * tick before the liveness/size gates existed, so some published courses hold
 * far more future sessions than slots × weeksToSchedule could ever produce
 * (student-visible as "64 of 64 sessions remaining" style cards). The
 * scheduling fixes stop new growth; this script trims the EXISTING excess.
 *
 * Retire — never delete. A retired future session (status -> 'ended') is
 * treated by every count as "cancelled before start" and drops out of
 * sessionCount / remainingSessions / the progress bar, matching how the
 * enrollments API already excludes such rows. All cascading FKs stay intact
 * and the operation is reviewable in the audit trail.
 *
 * Mirrors the counting semantics of src/app/api/student/enrollments/route.ts:
 *   countable = scheduleId != null && status != 'cancelled',
 *               minus ended-with-future-scheduledAt ghosts
 *   completed = ended && scheduledAt <= now
 *   expected  = slotCount × weeksToSchedule (weeksToSchedule ?? 8)
 *
 * Safety rules:
 *   - only published, non-deleted courses
 *   - only schedules whose countable total EXCEEDS expected (excess > 0)
 *   - never touches completed (ended, past) sessions
 *   - never touches 'live'/'active' sessions or past-dated rows
 *   - retires at most `excess` sessions, newest-scheduled first, so the
 *     earliest upcoming classes are always preserved
 *
 * Run (dry run — prints the full retire plan, changes nothing):
 *   cd tutorme-app
 *   npx tsx src/scripts/cleanup-excess-course-sessions.ts
 *
 * Apply:
 *   APPLY=1 npx tsx src/scripts/cleanup-excess-course-sessions.ts
 *
 * Restrict to one course while validating:
 *   COURSE_ID=<courseId> npx tsx src/scripts/cleanup-excess-course-sessions.ts
 */

import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'

// dotenv MUST run before any '@/lib/db/*' import: drizzle.ts snapshots the
// connection string at module-load time, and static imports would hoist above
// these lines. The db modules are therefore imported dynamically inside main(),
// after the env is loaded (tsx compiles to CJS, so no top-level await).
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })
dotenvConfig({ path: resolve(process.cwd(), '.env') })

const APPLY = process.env.APPLY === '1'
const COURSE_ID = process.env.COURSE_ID || null

interface RetirePlan {
  courseId: string
  courseName: string | null
  tutorHandle: string | null
  scheduleId: string
  slotCount: number
  weeksToSchedule: number
  expected: number
  completed: number
  futureScheduled: number
  other: number
  ghosts: number
  excess: number
  retireCount: number
  retirees: Array<{ sessionId: string; scheduledAt: Date }>
}

async function main() {
  const { drizzleDb } = await import('@/lib/db/drizzle')
  const { calendarEvent, course, courseSchedule, liveSession, user } =
    await import('@/lib/db/schema')
  const { and, eq, inArray, isNull } = await import('drizzle-orm')

  const now = new Date()
  console.log(`mode: ${APPLY ? 'APPLY (retiring sessions)' : 'DRY RUN (no changes)'}`)
  if (COURSE_ID) console.log(`restricted to course: ${COURSE_ID}`)

  const scheduleWhere = and(
    eq(course.isPublished, true),
    isNull(course.deletedAt),
    COURSE_ID ? eq(courseSchedule.courseId, COURSE_ID) : undefined
  )
  const rows = await drizzleDb
    .select({
      scheduleId: courseSchedule.scheduleId,
      courseId: courseSchedule.courseId,
      schedule: courseSchedule.schedule,
      weeksToSchedule: courseSchedule.weeksToSchedule,
      courseName: course.name,
      tutorHandle: user.handle,
    })
    .from(courseSchedule)
    .innerJoin(course, eq(course.courseId, courseSchedule.courseId))
    .leftJoin(user, eq(user.userId, course.creatorId))
    .where(scheduleWhere)

  const plans: RetirePlan[] = []
  for (const row of rows) {
    const sessions = await drizzleDb
      .select({
        sessionId: liveSession.sessionId,
        scheduledAt: liveSession.scheduledAt,
        status: liveSession.status,
      })
      .from(liveSession)
      .where(eq(liveSession.scheduleId, row.scheduleId))

    const ghosts: Array<{ sessionId: string; scheduledAt: Date }> = []
    const completed: typeof ghosts = []
    const futureScheduled: typeof ghosts = []
    const other: typeof ghosts = []
    for (const s of sessions) {
      if (s.scheduledAt == null) {
        other.push({ sessionId: s.sessionId, scheduledAt: new Date(0) })
        continue
      }
      const inFuture = s.scheduledAt.getTime() > now.getTime()
      if (s.status === 'ended') {
        if (inFuture) ghosts.push({ sessionId: s.sessionId, scheduledAt: s.scheduledAt })
        else completed.push({ sessionId: s.sessionId, scheduledAt: s.scheduledAt })
      } else if (s.status === 'scheduled' && inFuture) {
        futureScheduled.push({ sessionId: s.sessionId, scheduledAt: s.scheduledAt })
      } else {
        other.push({ sessionId: s.sessionId, scheduledAt: s.scheduledAt })
      }
    }

    const slotCount = Array.isArray(row.schedule) ? row.schedule.length : 0
    const weeksToSchedule = row.weeksToSchedule ?? 8
    const expected = slotCount * weeksToSchedule
    const countable = completed.length + futureScheduled.length + other.length
    const excess = countable - expected
    // Retire at most `excess` sessions and never more than the retirable
    // future pool; keep the earliest-scheduled classes by retiring newest first.
    const retireCount = excess > 0 ? Math.min(excess, futureScheduled.length) : 0
    const retirees =
      retireCount > 0
        ? [...futureScheduled].sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
        : []

    plans.push({
      courseId: row.courseId,
      courseName: row.courseName,
      tutorHandle: row.tutorHandle,
      scheduleId: row.scheduleId,
      slotCount,
      weeksToSchedule,
      expected,
      completed: completed.length,
      futureScheduled: futureScheduled.length,
      other: other.length,
      ghosts: ghosts.length,
      excess,
      retireCount,
      retirees: retirees.slice(0, retireCount),
    })
  }

  plans.sort((a, b) => b.excess - a.excess)
  const affected = plans.filter(p => p.retireCount > 0)
  console.log(
    `\nschedules audited: ${plans.length}; with excess: ${plans.filter(p => p.excess > 0).length}; ` +
      `to retire: ${affected.length} schedule(s), ${affected.reduce((n, p) => n + p.retireCount, 0)} session(s)`
  )
  for (const p of affected) {
    console.log(
      `\n[EXCESS +${p.excess}] ${p.courseName ?? '(unnamed)'} (@${p.tutorHandle ?? 'unknown'})`
    )
    console.log(
      `  course ${p.courseId} / schedule ${p.scheduleId}: ` +
        `${p.slotCount} slot(s) × ${p.weeksToSchedule} wk = expected ${p.expected}`
    )
    console.log(
      `  countable ${p.completed + p.futureScheduled + p.other} ` +
        `(completed ${p.completed}, future-scheduled ${p.futureScheduled}, other ${p.other}, ghosts ${p.ghosts})`
    )
    console.log(
      `  retiring ${p.retireCount} newest future session(s); ` +
        `newest: ${p.retirees[0]?.scheduledAt.toISOString() ?? '-'}, ` +
        `oldest retired: ${p.retirees[p.retirees.length - 1]?.scheduledAt.toISOString() ?? '-'}`
    )
  }
  for (const p of plans.filter(p => p.excess > 0 && p.retireCount === 0)) {
    console.log(
      `\n[EXCESS +${p.excess} — NO FUTURE SESSIONS TO RETIRE] ${p.courseName ?? '(unnamed)'} ` +
        `(@${p.tutorHandle ?? 'unknown'}), schedule ${p.scheduleId}: excess is entirely in ` +
        `completed/other rows; review manually before touching.`
    )
  }

  if (!APPLY) {
    console.log('\nDry run — re-run with APPLY=1 to retire these sessions.')
    return
  }
  const ids = affected.flatMap(p => p.retirees.map(r => r.sessionId))
  if (ids.length === 0) {
    console.log('\nNothing to retire.')
    return
  }
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500)
    await drizzleDb
      .update(liveSession)
      .set({ status: 'ended', endedAt: now })
      .where(inArray(liveSession.sessionId, chunk))
    await drizzleDb
      .update(calendarEvent)
      .set({ isCancelled: true, deletedAt: now })
      .where(inArray(calendarEvent.externalId, chunk))
  }
  console.log(`\nRetired ${ids.length} session(s) (status -> ended, calendar events cancelled).`)
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('cleanup failed:', err)
    process.exit(1)
  })
