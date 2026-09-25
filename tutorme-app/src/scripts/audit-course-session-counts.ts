/**
 * Read-only audit: session-count sanity for published courses.
 *
 * Motivation: several student-visible course cards showed session totals far
 * beyond anything their tutors ever configured (e.g. "64 of 64 sessions
 * remaining" on an 8-slot × 8-week course, i.e. 64 = exactly slots × weeks —
 * the signature of the rolling re-materialization job topping schedules up on
 * every tick instead of only filling gaps). The scheduling fix stops future
 * growth; this script quantifies the EXISTING rows so a targeted cleanup can
 * be decided with real numbers.
 *
 * For every published, non-deleted course's schedule it reports:
 *   - course name, tutor handle, slot count, weeksToSchedule
 *   - expected total (slots × weeksToSchedule)
 *   - observed buckets: future-scheduled / completed (ended, in the past) /
 *     ended-future ghosts (retired slots that still inflate counts) / other
 *   - excess = observed countable total − expected total
 *
 * Read-only: never writes. Run against a prod-like database:
 *   cd tutorme-app
 *   npx tsx src/scripts/audit-course-session-counts.ts
 *
 * Optional: only show courses with excess > 0:
 *   ONLY_EXCESS=1 npx tsx src/scripts/audit-course-session-counts.ts
 */

import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'

// dotenv MUST run before any '@/lib/db/*' import: drizzle.ts snapshots the
// connection string at module-load time, and static imports would hoist above
// these lines. The db modules are therefore imported dynamically inside main(),
// after the env is loaded (tsx compiles to CJS, so no top-level await).
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })
dotenvConfig({ path: resolve(process.cwd(), '.env') })

const ONLY_EXCESS = process.env.ONLY_EXCESS === '1'

interface ScheduleReport {
  courseId: string
  courseName: string | null
  tutorHandle: string | null
  scheduleId: string
  slotCount: number
  weeksToSchedule: number
  expected: number
  futureScheduled: number
  completed: number
  endedFutureGhosts: number
  other: number
  total: number
  get excess(): number
}

async function main() {
  const { drizzleDb } = await import('@/lib/db/drizzle')
  const { course, courseSchedule, liveSession, user } = await import('@/lib/db/schema')
  const { and, eq, isNull } = await import('drizzle-orm')

  const now = new Date()
  const rows = await drizzleDb
    .select({
      scheduleId: courseSchedule.scheduleId,
      courseId: courseSchedule.courseId,
      scheduleName: courseSchedule.name,
      schedule: courseSchedule.schedule,
      weeksToSchedule: courseSchedule.weeksToSchedule,
      courseName: course.name,
      tutorHandle: user.handle,
    })
    .from(courseSchedule)
    .innerJoin(course, eq(course.courseId, courseSchedule.courseId))
    .leftJoin(user, eq(user.userId, course.creatorId))
    .where(and(eq(course.isPublished, true), isNull(course.deletedAt)))

  const reports: ScheduleReport[] = []
  for (const row of rows) {
    const sessions = await drizzleDb
      .select({
        scheduledAt: liveSession.scheduledAt,
        status: liveSession.status,
      })
      .from(liveSession)
      .where(eq(liveSession.scheduleId, row.scheduleId))

    let futureScheduled = 0
    let completed = 0
    let endedFutureGhosts = 0
    let other = 0
    for (const s of sessions) {
      const inFuture = s.scheduledAt != null && s.scheduledAt.getTime() > now.getTime()
      if (s.status === 'ended') {
        if (inFuture) endedFutureGhosts++
        else completed++
      } else if (s.status === 'scheduled' && inFuture) {
        futureScheduled++
      } else {
        other++
      }
    }

    const slotCount = Array.isArray(row.schedule) ? row.schedule.length : 0
    const weeksToSchedule = row.weeksToSchedule ?? 8
    const expected = slotCount * weeksToSchedule
    const total = sessions.length
    reports.push({
      courseId: row.courseId,
      courseName: row.courseName,
      tutorHandle: row.tutorHandle,
      scheduleId: row.scheduleId,
      slotCount,
      weeksToSchedule,
      expected,
      futureScheduled,
      completed,
      endedFutureGhosts,
      other,
      total,
      get excess() {
        return this.total - this.expected
      },
    })
  }

  const flagged = reports.filter(r => (ONLY_EXCESS ? r.excess > 0 : true))
  flagged.sort((a, b) => b.excess - a.excess)

  console.log(`audited ${reports.length} published schedule(s); showing ${flagged.length}`)
  console.log(
    'excess = live rows − (slots × weeks). ' +
      'Positive excess = more sessions exist than the schedule could ever produce.'
  )
  for (const r of flagged) {
    console.log(
      `\n[${r.excess > 0 ? 'EXCESS' : 'ok    '}] ${r.courseName ?? '(unnamed)'} ` +
        `(@${r.tutorHandle ?? 'unknown'})`
    )
    console.log(
      `  course ${r.courseId} / schedule ${r.scheduleId}: ` +
        `${r.slotCount} slot(s) × ${r.weeksToSchedule} wk = expected ${r.expected}`
    )
    console.log(
      `  live ${r.total} (future ${r.futureScheduled}, completed ${r.completed}, ` +
        `ghosts ${r.endedFutureGhosts}, other ${r.other}) → excess ${r.excess}`
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('audit failed:', err)
    process.exit(1)
  })
