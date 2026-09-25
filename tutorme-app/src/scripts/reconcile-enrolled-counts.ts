/**
 * Reconcile CourseSchedule.enrolledCount with the actual CourseEnrollment rows.
 *
 * Motivation: the enrolledCount counter on each CourseSchedule row is
 * maintained incrementally (atomic +1/-1 at enroll/unenroll/schedule-switch).
 * Any missed increment — a failed transaction half-applied, a bug in a removed
 * code path, a manual row edit — leaves the counter drifting from reality,
 * which then wrongly blocks (or over-admits) seat claims, since capacity checks
 * compare against this counter.
 *
 * For every non-deleted course, this script:
 *   - expands the course to its variant family via expandToCourseFamily()
 *     (a published id covers its template and vice versa; enrollment rows can
 *     reference either side of the pair)
 *   - recomputes, for each CourseSchedule row in the family, the true count of
 *     CourseEnrollment rows pointing at that schedule (scheduleId is globally
 *     unique, so this is an exact count, matching how the write path
 *     increments/decrements the counter)
 *   - compares it to the stored enrolledCount and corrects mismatches
 *
 * Enrollments with scheduleId NULL never touched a schedule counter at write
 * time, so they are reported per course (informational) but never folded in.
 *
 * Idempotent: each correction sets the counter to the exact row count, so a
 * second run finds zero mismatches.
 *
 * Usage (from tutorme-app/):
 *   npx tsx src/scripts/reconcile-enrolled-counts.ts            # dry-run (default)
 *   npx tsx src/scripts/reconcile-enrolled-counts.ts --dry-run  # report only
 *   npx tsx src/scripts/reconcile-enrolled-counts.ts --apply    # write updates
 */

import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'

// dotenv MUST run before any '@/lib/db/*' import: drizzle.ts snapshots the
// connection string at module-load time, and static imports would hoist above
// these lines. The db modules are therefore imported dynamically inside main(),
// after the env is loaded (tsx compiles to CJS, so no top-level await).
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })
dotenvConfig({ path: resolve(process.cwd(), '.env') })

const APPLY = process.argv.includes('--apply')

async function main() {
  const { drizzleDb } = await import('@/lib/db/drizzle')
  const { course, courseSchedule, courseEnrollment } = await import('@/lib/db/schema')
  const { and, eq, inArray, isNull, sql } = await import('drizzle-orm')
  const { expandToCourseFamily } = await import('@/lib/courses/variant-family')

  // All schedules that belong to a non-deleted course, grouped by course.
  const schedules = await drizzleDb
    .select({
      scheduleId: courseSchedule.scheduleId,
      courseId: courseSchedule.courseId,
      enrolledCount: courseSchedule.enrolledCount,
    })
    .from(courseSchedule)
    .innerJoin(course, eq(course.courseId, courseSchedule.courseId))
    .where(isNull(course.deletedAt))

  const schedulesByCourse = new Map<string, typeof schedules>()
  for (const s of schedules) {
    const list = schedulesByCourse.get(s.courseId) || []
    list.push(s)
    schedulesByCourse.set(s.courseId, list)
  }

  const courseIds = Array.from(schedulesByCourse.keys())
  console.log(
    `reconciling enrolledCount for schedules of ${courseIds.length} non-deleted course(s)` +
      ` (${schedules.length} schedule row(s)); mode: ${APPLY ? 'APPLY' : 'dry-run'}`
  )

  const reconciledScheduleIds = new Set<string>()
  let checked = 0
  let mismatched = 0
  let corrected = 0
  let nullScheduleEnrollments = 0

  for (const courseId of courseIds) {
    // Variant-family expansion: covers the schedule rows on BOTH sides of the
    // template<->published pair so one pass reconciles the whole family.
    const familyIds = await expandToCourseFamily([courseId])
    const familySchedules = familyIds.flatMap(id => schedulesByCourse.get(id) || [])

    // Informational: enrollments not attached to any schedule (never counted
    // by the write path, so intentionally excluded from the counters).
    const unattributed = await drizzleDb
      .select({ count: sql<number>`count(*)::int` })
      .from(courseEnrollment)
      .where(
        and(inArray(courseEnrollment.courseId, familyIds), isNull(courseEnrollment.scheduleId))
      )
    nullScheduleEnrollments += unattributed[0]?.count ?? 0

    for (const s of familySchedules) {
      if (reconciledScheduleIds.has(s.scheduleId)) continue
      reconciledScheduleIds.add(s.scheduleId)
      checked++

      const actualRows = await drizzleDb
        .select({ count: sql<number>`count(*)::int` })
        .from(courseEnrollment)
        .where(eq(courseEnrollment.scheduleId, s.scheduleId))
      const actual = actualRows[0]?.count ?? 0

      if (actual === s.enrolledCount) continue
      mismatched++
      console.log(`${s.courseId} (schedule ${s.scheduleId}): ${s.enrolledCount} -> ${actual}`)
      if (APPLY) {
        await drizzleDb
          .update(courseSchedule)
          .set({ enrolledCount: actual })
          .where(eq(courseSchedule.scheduleId, s.scheduleId))
        corrected++
      }
    }
  }

  console.log(
    `\nchecked ${checked} schedule(s): ${mismatched} mismatch(es)` +
      (APPLY ? `, ${corrected} corrected` : ' (dry-run; re-run with --apply to write)') +
      `. ${nullScheduleEnrollments} enrollment(s) with no schedule (informational only).`
  )
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('reconcile failed:', err)
    process.exit(1)
  })
