/**
 * One-time cleanup: retire stale ad-hoc demo classes (GO_LIVE_DEMO sessions).
 *
 * Every "Go live / Create a demo class" click inserts a permanent LiveSession
 * row (scheduleId null, scheduledAt null) against the course's template
 * course. Those rows accumulated under every variant's Course Sessions dialog
 * (and the student course-sessions list) until the APIs learned to exclude
 * them — this script retires the backlog.
 *
 * Retirement criteria:
 *   - sessionType = 'GO_LIVE_DEMO'
 *   - demoVideoContentId IS NULL  (a demo with an attached video powers the
 *     tutor's public profile — never touched)
 *   - scheduledAt IS NULL         (belt-and-braces: only ad-hoc demos)
 *   - createdAt older than CUTOFF_DAYS (default 7 — a recent demo may still
 *     receive a demo video via the Record flow)
 *   - not currently running (status not active/live)
 *
 * "Retire" = status -> 'ended' + endedAt set (+ calendar event cancelled if
 * one exists). Rows are kept for history; nothing is deleted.
 *
 * Run (dry run — prints what would be retired, changes nothing):
 *   cd tutorme-app
 *   npx tsx src/scripts/cleanup-stale-demo-sessions.ts
 *
 * Apply:
 *   APPLY=1 npx tsx src/scripts/cleanup-stale-demo-sessions.ts
 *
 * Widen the retention window (e.g. keep the last 30 days of demos):
 *   CUTOFF_DAYS=30 APPLY=1 npx tsx src/scripts/cleanup-stale-demo-sessions.ts
 */

import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'

// dotenv MUST run before any '@/lib/db/*' import: drizzle.ts snapshots the
// connection string at module-load time, and static imports would hoist above
// these lines. The db modules are therefore imported dynamically inside main(),
// after the env is loaded (tsx compiles to CJS, so no top-level await).
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })
dotenvConfig({ path: resolve(process.cwd(), '.env') })

const CUTOFF_DAYS = process.env.CUTOFF_DAYS ? Number(process.env.CUTOFF_DAYS) : 7
const APPLY = process.env.APPLY === '1'

async function main() {
  const { drizzleDb } = await import('@/lib/db/drizzle')
  const { calendarEvent, course, liveSession } = await import('@/lib/db/schema')
  const { and, eq, inArray, isNull, lt, ne } = await import('drizzle-orm')

  const cutoff = new Date(Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000)
  const now = new Date()

  console.log(`cutoff: demos created before ${cutoff.toISOString()} (${CUTOFF_DAYS} days)`)
  console.log(`mode: ${APPLY ? 'APPLY (retiring demos)' : 'DRY RUN (no changes)'}`)

  const candidates = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      courseId: liveSession.courseId,
      createdAt: liveSession.createdAt,
      status: liveSession.status,
      courseName: course.name,
    })
    .from(liveSession)
    .innerJoin(course, eq(course.courseId, liveSession.courseId))
    .where(
      and(
        eq(liveSession.sessionType, 'GO_LIVE_DEMO'),
        isNull(liveSession.demoVideoContentId),
        isNull(liveSession.scheduledAt),
        lt(liveSession.createdAt, cutoff),
        ne(liveSession.status, 'active'),
        ne(liveSession.status, 'live'),
        isNull(course.deletedAt)
      )
    )

  const byCourse = new Map<string, typeof candidates>()
  for (const c of candidates) {
    if (!c.courseId) continue
    const list = byCourse.get(c.courseId) ?? []
    list.push(c)
    byCourse.set(c.courseId, list)
  }

  console.log(
    `\nstale demo sessions to retire: ${candidates.length} across ${byCourse.size} course(s)`
  )
  for (const [courseId, list] of [...byCourse.entries()].sort(
    (a, b) => b[1].length - a[1].length
  )) {
    console.log(`  retire ${list.length}x: ${list[0].courseName} (${courseId})`)
  }

  if (!APPLY) {
    console.log('\nDry run — re-run with APPLY=1 to retire these sessions.')
    return
  }
  if (candidates.length === 0) {
    console.log('\nNothing to retire.')
    return
  }

  const ids = candidates.map(r => r.sessionId)
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
  console.log(
    `\nRetired ${ids.length} demo session(s) (status -> ended, calendar events cancelled).`
  )
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('cleanup failed:', err)
    process.exit(1)
  })
