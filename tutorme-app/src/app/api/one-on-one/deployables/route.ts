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
import { and, desc, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, builderTaskDmi, course, courseLesson, courseVariant } from '@/lib/db/schema'
import { buildStudentDeployPayload, type RawDeployDmiItem } from '@/lib/assessment/deploy-safety'
import type { StudentDmiItem } from '@/lib/assessment/student-dmi'
import { formatCourseVariantName } from '@/lib/courses/variant-name'

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

/**
 * Materialize the course's authored lesson tasks — stored in the builder's
 * working model `courseLesson.builderData.{tasks,assessments,homework}` — into
 * BuilderTask + BuilderTaskDmi rows so they become deployable.
 *
 * Why: the deploy panel lists BuilderTask rows, but those are otherwise only
 * created the first time a task is deployed from a course class (the socket
 * `task:deploy` handler upserts them). A course whose tasks were authored but
 * never deployed therefore shows an empty panel — even though the tutor can see
 * the tasks under "Edit course" (which reads builderData). This runs the SAME
 * builderData→BuilderTask copy the deploy path already performs, up front and
 * scoped to this session's course family, keeping the answer key server-side in
 * BuilderTaskDmi exactly as the deploy path does (the deployables query below
 * still strips it via buildStudentDeployPayload before anything reaches a client).
 *
 * Idempotent: upserts keyed on the authored item id and refreshed from
 * builderData (the source of truth), so re-opening the panel just no-ops/refreshes.
 */
/** The attachable document a task was built from (e.g. a question-paper PDF).
 *  Shaped like the socket's LiveTaskSourceDocument; the durable `fileKey` is what
 *  matters — the socket re-signs the url from it on deploy. */
interface SourceDocLite {
  fileName: string
  fileUrl: string
  fileKey: string
  mimeType: string
}

const MATERIALIZE_CAP = 500

async function materializeCourseFamilyTasks(
  tutorId: string,
  familyIds: string[]
): Promise<Map<string, SourceDocLite>> {
  const lessons = await drizzleDb
    .select({
      lessonId: courseLesson.lessonId,
      courseId: courseLesson.courseId,
      builderData: courseLesson.builderData,
    })
    .from(courseLesson)
    .where(and(inArray(courseLesson.courseId, familyIds), isNull(courseLesson.deletedAt)))

  const now = new Date()
  const SOURCES: Array<['task' | 'assessment' | 'homework', string]> = [
    ['task', 'tasks'],
    ['assessment', 'assessments'],
    ['homework', 'homework'],
  ]
  const taskRows: (typeof builderTask.$inferInsert)[] = []
  const dmiRows: (typeof builderTaskDmi.$inferInsert)[] = []
  const seen = new Set<string>()
  // Read fresh from builderData every call (not stored on BuilderTask), so a
  // task's attached PDF flows to the deploy panel even for already-materialized
  // rows, and picks up a re-linked document without a stale copy.
  const sourceDocByTask = new Map<string, SourceDocLite>()

  for (const l of lessons) {
    const bd = (l.builderData ?? {}) as Record<string, unknown>
    for (const [type, key] of SOURCES) {
      const arr = Array.isArray(bd[key]) ? (bd[key] as Record<string, unknown>[]) : []
      for (const item of arr) {
        const id = typeof item?.id === 'string' ? item.id : null
        if (!id || seen.has(id)) continue
        seen.add(id)

        // A task's source document (question-paper PDF etc.) — carry the durable
        // fileKey so the deploy path can show it in the live Materials panel.
        const sd = item.sourceDocument as Record<string, unknown> | undefined
        if (sd && typeof sd.fileKey === 'string' && sd.fileKey) {
          const fk = sd.fileKey
          sourceDocByTask.set(id, {
            fileKey: fk,
            fileUrl: typeof sd.fileUrl === 'string' ? sd.fileUrl : '',
            fileName:
              typeof sd.fileName === 'string' ? sd.fileName : fk.split('/').pop() || 'document',
            mimeType:
              typeof sd.mimeType === 'string'
                ? sd.mimeType
                : fk.toLowerCase().endsWith('.pdf')
                  ? 'application/pdf'
                  : 'application/octet-stream',
          })
        }

        if (taskRows.length >= MATERIALIZE_CAP) continue
        const title = (typeof item.title === 'string' && item.title.trim()) || 'Untitled task'
        const content =
          (typeof item.content === 'string' && item.content) ||
          (typeof item.description === 'string' && item.description) ||
          (typeof item.instructions === 'string' && item.instructions) ||
          ''
        taskRows.push({
          taskId: id,
          courseId: l.courseId,
          lessonId: l.lessonId,
          tutorId,
          title,
          content,
          pci: '',
          type,
          status: 'published',
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        if (Array.isArray(item.dmiItems) && item.dmiItems.length > 0) {
          dmiRows.push({
            dmiId: `dmi-${id}`,
            taskId: id,
            type: type === 'assessment' ? 'assessment' : 'task',
            items: item.dmiItems,
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }

    // Standalone lesson documents (docs/worksheets not attached to a task) —
    // surface each as a deployable document so the tutor can push a PDF/worksheet
    // to the live room (shown in the Materials panel via the sourceDocument path,
    // no questions). Guarded: only items carrying a durable fileKey.
    for (const key of ['docs', 'worksheets']) {
      const arr = Array.isArray(bd[key]) ? (bd[key] as Record<string, unknown>[]) : []
      for (const doc of arr) {
        const fk = typeof doc?.fileKey === 'string' && doc.fileKey ? doc.fileKey : null
        if (!fk) continue
        const id = typeof doc.id === 'string' && doc.id ? doc.id : `doc-${fk}`
        if (seen.has(id)) continue
        seen.add(id)
        sourceDocByTask.set(id, {
          fileKey: fk,
          fileUrl: typeof doc.fileUrl === 'string' ? doc.fileUrl : '',
          fileName:
            typeof doc.fileName === 'string' ? doc.fileName : fk.split('/').pop() || 'document',
          mimeType:
            typeof doc.mimeType === 'string'
              ? doc.mimeType
              : fk.toLowerCase().endsWith('.pdf')
                ? 'application/pdf'
                : 'application/octet-stream',
        })
        if (taskRows.length >= MATERIALIZE_CAP) continue
        taskRows.push({
          taskId: id,
          courseId: l.courseId,
          lessonId: l.lessonId,
          tutorId,
          title:
            (typeof doc.title === 'string' && doc.title.trim()) ||
            (typeof doc.fileName === 'string' && doc.fileName) ||
            'Document',
          content: '',
          pci: '',
          type: 'task',
          status: 'published',
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
        })
      }
    }
  }

  if (seen.size > MATERIALIZE_CAP) {
    console.warn(
      `[deployables] course family has ${seen.size} authored tasks; materializing only the first ${MATERIALIZE_CAP}.`
    )
  }

  // The mutations below are best-effort: they make authored tasks appear as
  // deployable rows. Crucially they are wrapped so that a write failure (e.g.
  // an unexpected constraint) can NEVER discard `sourceDocByTask`, which is a
  // pure read from builderData and is what surfaces a task's document in the
  // deploy preview / live Materials panel. Previously a throw here bubbled to
  // the caller's catch, which reset the map to empty — silently dropping every
  // task's document. Read-then-write separation keeps the document reliable.
  try {
    if (taskRows.length > 0) {
      // Insert new tasks only. Do NOT overwrite an existing row: an in-session
      // inline edit (tasks/[taskId] PATCH) writes title/content straight to
      // BuilderTask, and re-opening the panel must not stomp it back to the
      // builderData snapshot. Also avoids re-writing unchanged rows on every open.
      await drizzleDb.insert(builderTask).values(taskRows).onConflictDoNothing({
        target: builderTask.taskId,
      })
    }
    if (dmiRows.length > 0) {
      await drizzleDb.insert(builderTaskDmi).values(dmiRows).onConflictDoNothing({
        target: builderTaskDmi.dmiId,
      })
    }

    // Reconcile deletions: soft-delete family tasks that we materialized but that
    // are no longer in builderData (the tutor deleted them in the builder) — so a
    // deleted task stops showing as a deployable "ghost". Only touches rows that
    // were NEVER deployed (no DeployedMaterial); a task that was actually deployed
    // has live history and is kept even if later removed from the builder. `seen`
    // holds every current authored id. This distinguisher works without a flag, so
    // it also cleans up rows materialized by earlier versions.
    const currentIds = [...seen]
    await drizzleDb
      .update(builderTask)
      .set({ deletedAt: now })
      .where(
        and(
          eq(builderTask.tutorId, tutorId),
          inArray(builderTask.courseId, familyIds),
          isNull(builderTask.deletedAt),
          ne(builderTask.courseId, ADHOC_ANCHOR_COURSE_ID),
          ...(currentIds.length > 0 ? [notInArray(builderTask.taskId, currentIds)] : []),
          sql`NOT EXISTS (SELECT 1 FROM "DeployedMaterial" dm WHERE dm."itemId" = ${builderTask.taskId})`
        )
      )
  } catch (err) {
    console.warn(
      '[deployables] materialization writes failed (non-critical); documents/tasks still surfaced from builderData:',
      err
    )
  }

  return sourceDocByTask
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

    // Ensure the course's authored lesson tasks exist as deployable BuilderTask
    // rows before we read them (see materializeCourseFamilyTasks). Only for a
    // course-scoped session; non-critical, so a failure never blocks the panel.
    let sourceDocByTask = new Map<string, SourceDocLite>()
    if (scopedFamily) {
      try {
        sourceDocByTask = await materializeCourseFamilyTasks(session.user.id, scopedFamily)
      } catch (err) {
        console.warn('[deployables] task materialization failed (non-critical):', err)
      }
    }

    // For a course-scoped session, return the FULL course structure — every lesson
    // of the session's course (even ones with no deployable task) — plus the full
    // variant name (category — nationality), so the panel shows the whole course,
    // not just the tasks.
    let scopedLessons: { lessonId: string; title: string; order: number }[] = []
    let scopedCourse: { courseId: string; name: string; variantName: string } | null = null
    // Correlate a family task's lesson to THIS scoped course's lesson. Template and
    // published-variant lessons don't share ids, but a published lesson records the
    // template lesson it was copied from in `sourceLessonId`, so both resolve to the
    // same "root" (sourceLessonId || id). Falls back to matching by `order`. Without
    // this, a task authored under the template (or a sibling variant) has a lessonId
    // that isn't in the scoped course's lesson list and would fall into "Other tasks"
    // instead of nesting under its real lesson.
    let resolveScopedLessonId: (
      lessonId: string | null,
      sourceId: string | null,
      order: number | null
    ) => string | null = lessonId => lessonId
    if (scopedCourseId) {
      const [lessonRows, courseRows, variantRows] = await Promise.all([
        drizzleDb
          .select({
            lessonId: courseLesson.lessonId,
            title: courseLesson.title,
            order: courseLesson.order,
            sourceLessonId: courseLesson.sourceLessonId,
          })
          .from(courseLesson)
          .where(and(eq(courseLesson.courseId, scopedCourseId), isNull(courseLesson.deletedAt)))
          .orderBy(courseLesson.order),
        drizzleDb
          .select({ name: course.name })
          .from(course)
          .where(eq(course.courseId, scopedCourseId))
          .limit(1),
        drizzleDb
          .select({ category: courseVariant.category, nationality: courseVariant.nationality })
          .from(courseVariant)
          .where(eq(courseVariant.publishedCourseId, scopedCourseId))
          .limit(1),
      ])
      scopedLessons = lessonRows.map(l => ({
        lessonId: l.lessonId,
        title: l.title || 'Untitled lesson',
        order: typeof l.order === 'number' ? l.order : 0,
      }))

      // rootId → scoped lessonId (rootId = the template lesson id both a template
      // lesson and its published copies share) and order → scoped lessonId fallback.
      const scopedIds = new Set(lessonRows.map(l => l.lessonId))
      const byRoot = new Map<string, string>()
      const byOrder = new Map<number, string>()
      // `order` has no unique constraint; only use it as a fallback for orders that
      // identify exactly ONE lesson, so a duplicate order never mis-nests a task
      // (an ambiguous one falls through to "Other tasks" instead of guessing).
      const orderCount = new Map<number, number>()
      for (const l of lessonRows) {
        if (typeof l.order === 'number') orderCount.set(l.order, (orderCount.get(l.order) ?? 0) + 1)
      }
      for (const l of lessonRows) {
        byRoot.set(l.sourceLessonId || l.lessonId, l.lessonId)
        if (typeof l.order === 'number' && orderCount.get(l.order) === 1)
          byOrder.set(l.order, l.lessonId)
      }
      resolveScopedLessonId = (lessonId, sourceId, order) => {
        if (!lessonId) return null
        if (scopedIds.has(lessonId)) return lessonId // already a scoped lesson
        const root = sourceId || lessonId
        return (
          byRoot.get(root) ??
          (typeof order === 'number' ? byOrder.get(order) : undefined) ??
          lessonId // truly foreign — leave as-is (client shows it under "Other tasks")
        )
      }
      scopedCourse = {
        courseId: scopedCourseId,
        name: courseRows[0]?.name || 'Course',
        variantName: variantRows[0]
          ? formatCourseVariantName(variantRows[0].category, variantRows[0].nationality)
          : '',
      }
    }

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
        lessonSourceId: courseLesson.sourceLessonId,
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

    // Scoped-lesson metadata (title/order) keyed by the scoped lessonId, so a task
    // remapped onto a scoped lesson also reports that lesson's title/order.
    const scopedLessonById = new Map(scopedLessons.map(l => [l.lessonId, l]))

    // Resolve each task onto a scoped-course lesson, then de-duplicate: a published
    // variant often carries its own copy of a template task, so the family query can
    // return both — they resolve to the same lesson and would show twice. Keep one
    // per (resolved lesson + title + type), preferring the scoped course's OWN copy
    // (and, failing that, the one that actually carries a document / questions).
    const seenTaskKey = new Map<string, number>() // key → index into `deployTasks`
    const deployTasks: Array<{
      taskId: string
      title: string
      type: 'task' | 'assessment' | 'homework'
      content: string
      lessonId: string | null
      courseId: string | null
      courseName: string
      coursePublished: boolean
      lessonTitle: string | null
      lessonOrder: number | null
      dmiItems: StudentDmiItem[]
      sourceDocument: SourceDocLite | null
    }> = []
    for (const r of rows) {
      const resolvedLessonId = resolveScopedLessonId(r.lessonId, r.lessonSourceId, r.lessonOrder)
      const scopedLesson = resolvedLessonId ? scopedLessonById.get(resolvedLessonId) : undefined
      const dmiItems = safeItemsByTask.get(r.taskId) ?? []
      const sourceDocument = sourceDocByTask.get(r.taskId) ?? null
      const task = {
        taskId: r.taskId,
        title: r.title || 'Untitled task',
        type: (r.type as 'task' | 'assessment' | 'homework') || 'task',
        content: r.content || '',
        lessonId: resolvedLessonId || null,
        courseId: r.courseId || null,
        courseName: r.courseName || 'Uncategorized',
        coursePublished: r.coursePublished ?? false,
        // Prefer the scoped lesson's own title/order once remapped, so the label the
        // client shows matches the lesson it's nested under.
        lessonTitle: scopedLesson?.title ?? r.lessonTitle ?? null,
        lessonOrder:
          scopedLesson?.order ?? (typeof r.lessonOrder === 'number' ? r.lessonOrder : null),
        dmiItems,
        // The task's attached document (e.g. question-paper PDF), so deploying it
        // shows the PDF in the live Materials panel. Durable fileKey; the socket
        // re-signs the url on deploy. Null when the task has no document.
        sourceDocument,
      }
      // De-dupe only within a scoped session (the family can surface variant copies).
      if (!scopedCourseId) {
        deployTasks.push(task)
        continue
      }
      const key = `${task.lessonId ?? '∅'}|${task.type}|${task.title.trim().toLowerCase()}`
      const existingIdx = seenTaskKey.get(key)
      if (existingIdx === undefined) {
        seenTaskKey.set(key, deployTasks.length)
        deployTasks.push(task)
        continue
      }
      // Duplicate: keep the better copy — scoped course's own wins, else the richer
      // one (has a document or questions).
      const existing = deployTasks[existingIdx]
      const score = (t: typeof task) =>
        (t.courseId === scopedCourseId ? 4 : 0) +
        (t.sourceDocument ? 2 : 0) +
        (t.dmiItems.length > 0 ? 1 : 0)
      if (score(task) > score(existing)) deployTasks[existingIdx] = task
    }

    return NextResponse.json({
      tasks: deployTasks,
      // Full structure for a course-scoped session (empty for all-courses mode):
      // the session course (with its variant name) + every lesson, so the panel
      // renders the whole course, not just the lessons that happen to have tasks.
      course: scopedCourse,
      lessons: scopedLessons,
    })
  },
  { role: 'TUTOR' }
)
