/**
 * One-time cleanup: retire sessions that the rolling re-materialization job
 * created for INACTIVE courses during its first un-gated runs (deployed
 * 2026-09-12, before the liveness gate existed).
 *
 * The un-gated job topped up every published course's schedule, including
 * long-abandoned courses and schedules that were persisted (but never
 * materialized) months ago — surfacing weeks of unwanted session cards.
 *
 * Retirement criteria (mirrors the fixed job's liveness gate):
 *   - LiveSession.createdAt >= GO_LIVE (created by the un-gated job), AND
 *   - status 'scheduled' and scheduledAt in the future, AND
 *   - the course has NO pre-GO_LIVE session with scheduledAt within the last
 *     70 days (i.e. the course was not active when the job ran).
 *
 * Active courses that were legitimately topped up are left untouched.
 *
 * Run (dry run — prints what would be retired, changes nothing):
 *   cd tutorme-app
 *   npx tsx src/scripts/cleanup-rolling-materialization-sessions.ts
 *
 * Apply:
 *   APPLY=1 npx tsx src/scripts/cleanup-rolling-materialization-sessions.ts
 *
 * Override the job go-live timestamp if needed:
 *   GO_LIVE=2026-09-12T03:25:00Z APPLY=1 npx tsx src/scripts/cleanup-rolling-materialization-sessions.ts
 */

import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'

// dotenv MUST run before any '@/lib/db/*' import: drizzle.ts snapshots the
// connection string at module-load time, and static imports would hoist above
// these lines. The db modules are therefore imported dynamically inside main(),
// after the env is loaded (tsx compiles to CJS, so no top-level await).
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })
dotenvConfig({ path: resolve(process.cwd(), '.env') })

const GO_LIVE = process.env.GO_LIVE
  ? new Date(process.env.GO_LIVE)
  : new Date('2026-09-12T03:25:00Z')
const ACTIVE_WINDOW_DAYS = 70
const APPLY = process.env.APPLY === '1'

async function main() {
  const { drizzleDb } = await import('@/lib/db/drizzle')
  const { calendarEvent, course, liveSession } = await import('@/lib/db/schema')
  const { and, eq, gt, gte, inArray, isNull, lt } = await import('drizzle-orm')

  const activeCutoff = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const now = new Date()

  console.log(
    `go-live: ${GO_LIVE.toISOString()}, active window cutoff: ${activeCutoff.toISOString()}`
  )
  console.log(`mode: ${APPLY ? 'APPLY (retiring sessions)' : 'DRY RUN (no changes)'}`)

  const candidates = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      courseId: liveSession.courseId,
      scheduledAt: liveSession.scheduledAt,
      courseName: course.name,
    })
    .from(liveSession)
    .innerJoin(course, eq(course.courseId, liveSession.courseId))
    .where(
      and(
        gte(liveSession.createdAt, GO_LIVE),
        eq(liveSession.status, 'scheduled'),
        gt(liveSession.scheduledAt, now),
        isNull(course.deletedAt)
      )
    )

  // Group candidates by course, then keep only courses that fail the liveness
  // gate: no pre-go-live session scheduled within the active window.
  const byCourse = new Map<string, typeof candidates>()
  for (const c of candidates) {
    if (!c.courseId) continue
    const list = byCourse.get(c.courseId) ?? []
    list.push(c)
    byCourse.set(c.courseId, list)
  }

  const toRetire: typeof candidates = []
  const keptActive: string[] = []
  for (const [courseId, list] of byCourse) {
    const [live] = await drizzleDb
      .select({ sessionId: liveSession.sessionId })
      .from(liveSession)
      .where(
        and(
          eq(liveSession.courseId, courseId),
          lt(liveSession.createdAt, GO_LIVE),
          gte(liveSession.scheduledAt, activeCutoff)
        )
      )
      .limit(1)
    if (live) keptActive.push(`${list[0].courseName} (${list.length} candidate session(s))`)
    else toRetire.push(...list)
  }

  console.log(`\ncourses with post-go-live sessions: ${byCourse.size}`)
  console.log(`active (kept, legitimately topped up): ${keptActive.length}`)
  for (const k of keptActive) console.log(`  kept: ${k}`)
  console.log(`inactive (sessions to retire): ${toRetire.length}`)
  const byCourseRetired = new Map<string, number>()
  for (const r of toRetire) {
    const key = `${r.courseName} (${r.courseId})`
    byCourseRetired.set(key, (byCourseRetired.get(key) ?? 0) + 1)
  }
  for (const [key, count] of [...byCourseRetired.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  retire ${count}x: ${key}`)
  }

  if (!APPLY) {
    console.log('\nDry run — re-run with APPLY=1 to retire these sessions.')
    return
  }
  if (toRetire.length === 0) {
    console.log('\nNothing to retire.')
    return
  }

  const ids = toRetire.map(r => r.sessionId)
  // Chunk to stay within parameter limits.
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
