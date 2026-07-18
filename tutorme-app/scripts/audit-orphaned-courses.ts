/**
 * READ-ONLY audit of orphaned `courseId` references and missing course FKs.
 *
 * Context: `BuilderTask.courseId` (and likely other course FKs) is NOT enforced
 * in prod — a schema-drift artifact of the frozen migration journal. As a result,
 * hard-deleting a Course leaves orphaned rows (LiveSession/BuilderTask/…) whose
 * `courseId` points at a Course row that no longer exists. This surfaced as ~24
 * "phantom-courseId" BuilderTask rows for one tutor.
 *
 * This script reports the full footprint so a cleanup + FK-enforcement can be
 * planned with real numbers. It performs SELECTs ONLY — it writes nothing and
 * changes no data.
 *
 * Run (against the DIRECT prod URL):
 *   npm run audit:orphaned-courses
 *   # or: npx tsx scripts/audit-orphaned-courses.ts
 */

import { sql } from 'drizzle-orm'
import { drizzleDb } from '../src/lib/db/drizzle'

/** (table, column) pairs that reference Course."id". */
const COURSE_REFS: Array<{ table: string; column: string }> = [
  { table: 'BuilderTask', column: 'courseId' },
  { table: 'LiveSession', column: 'courseId' },
  { table: 'GroupSession', column: 'courseId' },
  { table: 'OneOnOneBookingRequest', column: 'courseId' },
  { table: 'CourseLesson', column: 'courseId' },
  { table: 'CalendarEvent', column: 'courseId' },
  { table: 'CourseEnrollment', column: 'courseId' },
  { table: 'CourseSchedule', column: 'courseId' },
  { table: 'DeployedMaterial', column: 'courseId' },
  { table: 'CourseVariant', column: 'templateCourseId' },
  { table: 'CourseVariant', column: 'publishedCourseId' },
]

async function rows<T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T[]> {
  const res = await drizzleDb.execute(q)
  return res.rows as T[]
}

/** Does `table` (and optionally `column`) exist? Guards against name drift. */
async function exists(table: string, column?: string): Promise<boolean> {
  if (column) {
    const r = await rows<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
    `)
    return (r[0]?.n ?? 0) > 0
  }
  const r = await rows<{ ok: string | null }>(sql`SELECT to_regclass(${'"' + table + '"'}) AS ok`)
  return !!r[0]?.ok
}

async function main() {
  console.log('=== Orphaned-course audit (READ-ONLY) ===\n')

  // 1) Which course FKs are actually enforced right now?
  console.log('— Foreign keys referencing Course."id" that exist in prod —')
  const fks = await rows<{ conname: string; tbl: string }>(sql`
    SELECT conname, conrelid::regclass::text AS tbl
    FROM pg_constraint
    WHERE contype = 'f' AND confrelid = '"Course"'::regclass
    ORDER BY tbl, conname
  `)
  if (fks.length === 0) {
    console.log(
      '  (NONE — no table has an enforced FK to Course; orphans are possible everywhere.)'
    )
  } else {
    for (const f of fks) console.log(`  ✓ ${f.tbl}  →  ${f.conname}`)
  }
  const enforced = new Set(fks.map(f => f.tbl.replace(/"/g, '')))

  // 2) Per (table, column): how many rows point at a non-existent Course?
  console.log('\n— Orphaned references (courseId set, but no Course row) —')
  const orphanCourseIds = new Set<string>()
  let grandTotal = 0
  for (const { table, column } of COURSE_REFS) {
    if (!(await exists(table, column))) {
      console.log(`  · ${table}.${column}: (table/column not present — skipped)`)
      continue
    }
    const tIdent = sql.raw(`"${table}"`)
    const cIdent = sql.raw(`"${column}"`)
    const [{ n }] = await rows<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM ${tIdent} t
      WHERE t.${cIdent} IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "Course" c WHERE c."id" = t.${cIdent})
    `)
    grandTotal += n
    const fkNote = enforced.has(table) ? '' : '  [FK NOT enforced]'
    console.log(`  · ${table}.${column}: ${n} orphaned${fkNote}`)
    if (n > 0) {
      const ids = await rows<{ id: string }>(sql`
        SELECT DISTINCT t.${cIdent} AS id FROM ${tIdent} t
        WHERE t.${cIdent} IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "Course" c WHERE c."id" = t.${cIdent})
      `)
      for (const r of ids) if (r.id) orphanCourseIds.add(r.id)
    }
  }
  console.log(
    `\n  TOTAL orphaned references: ${grandTotal} across ${orphanCourseIds.size} distinct missing course id(s).`
  )

  // 3) Per missing course id: the downstream footprint a cleanup would touch.
  //    Grouped queries (one per table) instead of per-course loops, so this stays
  //    fast even with hundreds of missing courses.
  if (orphanCourseIds.size > 0) {
    type Foot = { ls: number; bt: number; cl: number; subs: number }
    const foot = new Map<string, Foot>()
    const get = (cid: string): Foot =>
      foot.get(cid) ?? (foot.set(cid, { ls: 0, bt: 0, cl: 0, subs: 0 }), foot.get(cid)!)

    // orphan predicate reused per table
    const grouped = async (
      table: string,
      extraWhere: ReturnType<typeof sql> | null
    ): Promise<Map<string, number>> => {
      const tIdent = sql.raw(`"${table}"`)
      const where = extraWhere ? sql`AND ${extraWhere}` : sql``
      const r = await rows<{ cid: string; n: number }>(sql`
        SELECT t."courseId" AS cid, count(*)::int AS n
        FROM ${tIdent} t
        WHERE t."courseId" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "Course" c WHERE c."id" = t."courseId")
          ${where}
        GROUP BY t."courseId"
      `)
      return new Map(r.map(x => [x.cid, x.n]))
    }

    for (const [cid, n] of await grouped('LiveSession', null)) get(cid).ls = n
    for (const [cid, n] of await grouped('BuilderTask', sql`t."deletedAt" IS NULL`)) get(cid).bt = n
    for (const [cid, n] of await grouped('CourseLesson', sql`t."deletedAt" IS NULL`))
      get(cid).cl = n

    // Student submissions tied to an orphaned course's tasks — the destructive part.
    let totalSubs = 0
    if (await exists('TaskSubmission', 'taskId')) {
      const r = await rows<{ cid: string; n: number }>(sql`
        SELECT bt."courseId" AS cid, count(*)::int AS n
        FROM "TaskSubmission" s
        JOIN "BuilderTask" bt ON bt."id" = s."taskId"
        WHERE bt."courseId" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "Course" c WHERE c."id" = bt."courseId")
        GROUP BY bt."courseId"
      `)
      for (const x of r) {
        get(x.cid).subs = x.n
        totalSubs += x.n
      }
    }

    const ranked = [...foot.entries()].sort(
      (a, b) => b[1].ls + b[1].bt - (a[1].ls + a[1].bt) || b[1].subs - a[1].subs
    )
    const TOP = 25
    console.log(
      `\n— Per missing-course footprint (${foot.size} courses; top ${Math.min(TOP, foot.size)} by size) —`
    )
    for (const [cid, f] of ranked.slice(0, TOP)) {
      console.log(
        `  ${cid.slice(0, 8)}…  liveSessions=${f.ls}  builderTasks=${f.bt}  lessons=${f.cl}` +
          (f.subs > 0 ? `  taskSubmissions=${f.subs}  ⚠ student work` : '')
      )
    }
    if (foot.size > TOP) console.log(`  … and ${foot.size - TOP} more missing course(s)`)
    const coursesWithSubs = ranked.filter(([, f]) => f.subs > 0).length
    console.log(
      `\n  Student work at risk in a purge: ${totalSubs} taskSubmission(s) across ${coursesWithSubs} missing course(s).`
    )
  }

  // 4) What it means for enforcing the FK.
  console.log('\n— Recommendation —')
  if (grandTotal === 0) {
    console.log('  No orphans. Safe to ADD the missing Course FKs (they would not fail).')
  } else {
    console.log(
      `  ${grandTotal} orphaned reference(s) exist, so ADDING a Course FK would FAIL until they are\n` +
        '  resolved. Decide per missing course whether the orphaned sessions/tasks are live\n' +
        '  history to keep (re-point / recreate the Course) or dead data to purge, THEN add the\n' +
        '  FK via startup-schema-fix. Any purge with taskSubmissions > 0 destroys student work —\n' +
        '  confirm before doing so. This script itself changed nothing.'
    )
  }
}

main()
  .catch(err => {
    console.error('[audit] failed:', err)
    process.exit(1)
  })
  .finally(() => process.exit(0))
