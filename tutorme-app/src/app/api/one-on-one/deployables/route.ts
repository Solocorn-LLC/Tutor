/**
 * GET /api/one-on-one/deployables  (tutor only)
 *
 * The tutor's saved, published tasks that can be deployed into a live session's
 * classroom (the session-classroom deploy panel), grouped by the course + lesson
 * they belong to so the tutor knows exactly what they're deploying. Returns
 * enough to build the LiveTask the client emits over `task:deploy`.
 *
 * For assessment/homework tasks that carry structured DMI questions, we also
 * return the *student-safe* `dmiItems` (answers stripped via
 * `buildStudentDeployPayload`) so the deployed task is answerable in the live
 * classroom. The answer key is NEVER returned here — it stays in
 * `BuilderTaskDmi.items` server-side and the `task:complete` handler reloads it
 * by taskId to auto-grade.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, builderTaskDmi, course, courseLesson, courseVariant } from '@/lib/db/schema'
import { buildStudentDeployPayload, type RawDeployDmiItem } from '@/lib/assessment/deploy-safety'
import type { StudentDmiItem } from '@/lib/assessment/student-dmi'

// The hidden system course that anchors course-less (ad-hoc) session deploys.
// Tasks under it are prior live deploys, not authored course content — keep them
// out of the deployable list. Mirrors ADHOC_ANCHOR_COURSE_ID in the socket server.
const ADHOC_ANCHOR_COURSE_ID = '__system_adhoc_course__'

/**
 * Resolve the whole template↔published variant family for a scoped course id.
 *
 * A course exists as a template plus N published variants (one per
 * nationality×category). Tasks are stored under whatever courseId the session
 * that authored them carried: a builder "teaching" session uses the TEMPLATE id,
 * while a scheduled live session carries the PUBLISHED-variant id. Scoping the
 * deploy panel by the raw session courseId therefore returns ZERO tasks whenever
 * the tasks were authored under a sibling id — the exact template/published
 * split documented across the codebase. Expanding to the family fixes both
 * directions. Standalone courses (no variant rows) resolve to just themselves,
 * so behaviour is unchanged for them.
 */
async function resolveCourseFamily(scopedId: string): Promise<string[]> {
  const rows = await drizzleDb
    .select({
      templateCourseId: courseVariant.templateCourseId,
      publishedCourseId: courseVariant.publishedCourseId,
    })
    .from(courseVariant)
    .where(
      or(
        eq(courseVariant.templateCourseId, scopedId),
        eq(courseVariant.publishedCourseId, scopedId)
      )
    )

  const family = new Set<string>([scopedId])
  const templateIds = new Set<string>()
  for (const r of rows) {
    family.add(r.templateCourseId)
    family.add(r.publishedCourseId)
    templateIds.add(r.templateCourseId)
  }

  // When `scopedId` is a published variant, the query above only matched its own
  // row — pull in the remaining siblings via the template(s) we just learned.
  if (templateIds.size > 0) {
    const siblings = await drizzleDb
      .select({ publishedCourseId: courseVariant.publishedCourseId })
      .from(courseVariant)
      .where(inArray(courseVariant.templateCourseId, [...templateIds]))
    for (const s of siblings) family.add(s.publishedCourseId)
  }

  return [...family]
}

export const GET = withAuth(
  async (req: NextRequest, session) => {
    // When a live session is built around a course, the classroom passes its
    // courseId so ONLY that course's tasks are deployable; with no course, all
    // of the tutor's published tasks are offered.
    const scopedCourseId = new URL(req.url).searchParams.get('courseId')?.trim() || null
    // Scope to the whole variant family, not just the raw id, so tasks authored
    // under a sibling variant/template id are still found (see resolveCourseFamily).
    const scopedFamily = scopedCourseId ? await resolveCourseFamily(scopedCourseId) : null

    const rows = await drizzleDb
      .select({
        taskId: builderTask.taskId,
        title: builderTask.title,
        type: builderTask.type,
        content: builderTask.content,
        lessonId: builderTask.lessonId,
        courseId: builderTask.courseId,
        courseName: course.name,
        coursePublished: course.isPublished,
        lessonTitle: courseLesson.title,
        lessonOrder: courseLesson.order,
      })
      .from(builderTask)
      .leftJoin(course, eq(builderTask.courseId, course.courseId))
      .leftJoin(courseLesson, eq(builderTask.lessonId, courseLesson.lessonId))
      .where(
        and(
          eq(builderTask.tutorId, session.user.id),
          eq(builderTask.status, 'published'),
          isNull(builderTask.deletedAt),
          ne(builderTask.courseId, ADHOC_ANCHOR_COURSE_ID),
          ...(scopedFamily ? [inArray(builderTask.courseId, scopedFamily)] : [])
        )
      )
      .orderBy(desc(builderTask.updatedAt))
      .limit(200)

    // Load the latest DMI item set per task in one query, then project each to
    // its student-safe form. Answer-bearing fields (answer/rubric/pairs/regions)
    // are dropped by `toStudentDmiItem`; only the prompts + option banks remain.
    const taskIds = rows.map(r => r.taskId)
    const safeItemsByTask = new Map<string, StudentDmiItem[]>()
    if (taskIds.length > 0) {
      const dmiRows = await drizzleDb
        .select({
          taskId: builderTaskDmi.taskId,
          items: builderTaskDmi.items,
          updatedAt: builderTaskDmi.updatedAt,
        })
        .from(builderTaskDmi)
        .where(inArray(builderTaskDmi.taskId, taskIds))
        .orderBy(desc(builderTaskDmi.updatedAt))

      // Keep only the most-recent row per task (rows arrive newest-first).
      for (const row of dmiRows) {
        if (safeItemsByTask.has(row.taskId)) continue
        const rawItems = Array.isArray(row.items) ? (row.items as RawDeployDmiItem[]) : []
        if (rawItems.length === 0) continue
        const { dmiItems } = buildStudentDeployPayload(rawItems)
        safeItemsByTask.set(row.taskId, dmiItems)
      }
    }

    return NextResponse.json({
      tasks: rows.map(r => ({
        taskId: r.taskId,
        title: r.title || 'Untitled task',
        type: (r.type as 'task' | 'assessment' | 'homework') || 'task',
        content: r.content || '',
        lessonId: r.lessonId || null,
        courseId: r.courseId || null,
        courseName: r.courseName || 'Uncategorized',
        coursePublished: r.coursePublished ?? false,
        lessonTitle: r.lessonTitle || null,
        lessonOrder: typeof r.lessonOrder === 'number' ? r.lessonOrder : null,
        dmiItems: safeItemsByTask.get(r.taskId) ?? [],
      })),
    })
  },
  { role: 'TUTOR' }
)
