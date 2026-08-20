/**
 * Diagnostic script for course session count mismatches.
 *
 * Run with:
 *   cd tutorme-app
 *   npx tsx src/scripts/audit-course-sessions.ts
 *
 * It compares the configured session count (slots × weeksToSchedule from
 * CourseSchedule) against the actual materialized LiveSession rows for each
 * published course and prints any discrepancies.
 */

import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseSchedule, liveSession } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { computeCourseSessionCount } from '@/lib/courses/session-count'

async function main() {
  const rows = await drizzleDb
    .select({
      courseId: course.courseId,
      name: course.name,
      isPublished: course.isPublished,
    })
    .from(course)
    .where(eq(course.isPublished, true))

  const courseIds = rows.map(r => r.courseId)

  const schedules = await drizzleDb
    .select({
      courseId: courseSchedule.courseId,
      schedule: courseSchedule.schedule,
      weeksToSchedule: courseSchedule.weeksToSchedule,
    })
    .from(courseSchedule)
    .where(sql`${courseSchedule.courseId} IN (${courseIds.map(id => `'${id}'`).join(',')})`)

  const schedulesByCourse = schedules.reduce(
    (acc, s) => {
      acc[s.courseId] = acc[s.courseId] || []
      acc[s.courseId].push(s)
      return acc
    },
    {} as Record<string, typeof schedules>
  )

  const liveCounts = await drizzleDb
    .select({
      courseId: liveSession.courseId,
      count: sql<number>`count(*)::int`,
    })
    .from(liveSession)
    .where(sql`${liveSession.courseId} IN (${courseIds.map(id => `'${id}'`).join(',')})`)
    .groupBy(liveSession.courseId)

  const liveCountByCourse = new Map(liveCounts.map(r => [r.courseId, r.count]))

  let mismatches = 0
  for (const c of rows) {
    const configured = computeCourseSessionCount(schedulesByCourse[c.courseId] || [])
    const materialized = liveCountByCourse.get(c.courseId) ?? 0
    if (configured !== materialized) {
      mismatches++
      console.log(
        `MISMATCH: ${c.name} (${c.courseId}) — configured ${configured}, materialized ${materialized}`
      )
    }
  }

  if (mismatches === 0) {
    console.log('No mismatches found.')
  } else {
    console.log(`\nFound ${mismatches} course(s) with session count mismatches.`)
    process.exitCode = 1
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
