'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { toast } from 'sonner'
import {
  Loader2,
  Send,
  X,
  FileText,
  ListChecks,
  Search,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Eye,
} from 'lucide-react'
import type { StudentDmiItem } from '@/lib/assessment/student-dmi'
import { TaskDocumentCard } from '@/components/task/TaskDocumentCard'
import { sanitizeHtml } from '@/lib/security/sanitize'

interface Deployable {
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
  /** Student-safe questions (answers already stripped server-side). */
  dmiItems: StudentDmiItem[]
  /** The document the task was built from (e.g. a question-paper PDF), shown in
   *  the live Materials panel when deployed. Null when the task has none. */
  sourceDocument: {
    fileName: string
    fileUrl: string
    fileKey: string
    mimeType: string
  } | null
}

interface LessonGroup {
  lessonId: string
  lessonTitle: string
  lessonOrder: number
  tasks: Deployable[]
}
interface CourseGroup {
  courseId: string
  courseName: string
  /** Full variant label (category — nationality), when this is a scoped course. */
  variantName?: string
  coursePublished: boolean
  taskCount: number
  lessons: LessonGroup[]
}

/** The scoped course's full structure (all lessons + variant name), returned only
 *  for a course-scoped session. */
interface CourseStructure {
  course: { courseId: string; name: string; variantName: string } | null
  lessons: { lessonId: string; title: string; order: number }[]
}

/**
 * Tutor-only panel to deploy one of their saved tasks into the live session — the
 * same `task:deploy` socket event a course classroom uses, so the server persists
 * it (under the ad-hoc anchor for a course-less session) and broadcasts it to the
 * room. Tasks are grouped by the course + lesson they belong to (with a
 * published/draft badge) so the tutor always knows what they're deploying, and a
 * search box keeps a big catalogue navigable. Self-contained: if the fetch or
 * socket is unavailable it just shows an empty/disabled state.
 */
export function SessionDeployPanel({
  sessionId,
  socket,
  courseId,
  refreshKey,
  onClose,
}: {
  sessionId: string
  socket: Socket | null
  /** When the session is built around a course, only that course's tasks are
   *  deployable; null/undefined offers all the tutor's published tasks. */
  courseId?: string | null
  /** Bumped by the parent when the linked course is edited in the in-session
   *  modal, so the task list refetches instead of serving stale content. */
  refreshKey?: number
  onClose: () => void
}) {
  const [items, setItems] = useState<Deployable[]>([])
  const [structure, setStructure] = useState<CourseStructure>({ course: null, lessons: [] })
  const [loading, setLoading] = useState(true)
  const [deployingId, setDeployingId] = useState<string | null>(null)
  /** Task whose full content the tutor is previewing before deploying. */
  const [previewTask, setPreviewTask] = useState<Deployable | null>(null)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    let active = true
    const url = courseId
      ? `/api/one-on-one/deployables?courseId=${encodeURIComponent(courseId)}`
      : '/api/one-on-one/deployables'
    fetch(url, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { tasks: [] }))
      .then(d => {
        if (!active) return
        setItems(Array.isArray(d.tasks) ? d.tasks : [])
        setStructure({
          course: d.course ?? null,
          lessons: Array.isArray(d.lessons) ? d.lessons : [],
        })
      })
      .catch(() => {
        if (active) {
          setItems([])
          setStructure({ course: null, lessons: [] })
        }
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [courseId, refreshKey])

  // Group the flat task list into course → lesson → tasks, filtered by the
  // search query (matches task title, course name or lesson title).
  const courses = useMemo<CourseGroup[]>(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? items.filter(
          t =>
            t.title.toLowerCase().includes(q) ||
            t.courseName.toLowerCase().includes(q) ||
            (t.lessonTitle ?? '').toLowerCase().includes(q)
        )
      : items

    // Course-scoped session: render the WHOLE course — its variant name and every
    // lesson, even ones with no deployable task — with tasks nested under lessons.
    if (structure.course) {
      const c: CourseGroup = {
        courseId: structure.course.courseId,
        courseName: structure.course.name,
        variantName: structure.course.variantName,
        coursePublished: items[0]?.coursePublished ?? true,
        taskCount: filtered.length,
        lessons: structure.lessons.map(l => ({
          lessonId: l.lessonId,
          lessonTitle: l.title,
          lessonOrder: l.order,
          tasks: [] as Deployable[],
        })),
      }
      const byLesson = new Map(c.lessons.map(l => [l.lessonId, l]))
      let other: LessonGroup | null = null
      for (const t of filtered) {
        const l = t.lessonId ? byLesson.get(t.lessonId) : null
        if (l) l.tasks.push(t)
        else {
          if (!other) {
            other = {
              lessonId: '__other__',
              lessonTitle: 'Other tasks',
              lessonOrder: 1e9,
              tasks: [],
            }
            c.lessons.push(other)
          }
          other.tasks.push(t)
        }
      }
      c.lessons.sort((a, b) => a.lessonOrder - b.lessonOrder)
      // While searching, hide lessons with no matching task to keep it focused.
      if (q) c.lessons = c.lessons.filter(l => l.tasks.length > 0)
      return [c]
    }

    const byCourse = new Map<string, CourseGroup>()
    for (const t of filtered) {
      const cKey = t.courseId ?? '__none__'
      let c = byCourse.get(cKey)
      if (!c) {
        c = {
          courseId: cKey,
          courseName: t.courseName,
          coursePublished: t.coursePublished,
          taskCount: 0,
          lessons: [],
        }
        byCourse.set(cKey, c)
      }
      c.taskCount++
      const lKey = t.lessonId ?? '__none__'
      let l = c.lessons.find(x => x.lessonId === lKey)
      if (!l) {
        l = {
          lessonId: lKey,
          lessonTitle: t.lessonTitle ?? 'Other',
          lessonOrder: t.lessonOrder ?? 9999,
          tasks: [],
        }
        c.lessons.push(l)
      }
      l.tasks.push(t)
    }
    const list = Array.from(byCourse.values())
    for (const c of list) c.lessons.sort((a, b) => a.lessonOrder - b.lessonOrder)
    list.sort((a, b) => a.courseName.localeCompare(b.courseName))
    return list
  }, [items, query, structure])

  const toggle = (courseId: string) =>
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(courseId)) next.delete(courseId)
      else next.add(courseId)
      return next
    })

  const deploy = (t: Deployable) => {
    if (!socket) {
      toast.error('Still connecting — try again in a moment.')
      return
    }
    setDeployingId(t.taskId)
    // Same LiveTask shape the course classroom emits. The student-safe dmiItems
    // (answers already stripped by the deployables endpoint) ride along so the
    // task is answerable in the live classroom; the answer key stays server-side
    // in BuilderTaskDmi and the `task:complete` handler reloads it by taskId to
    // auto-grade — it is never sent to the client here.
    socket.emit('task:deploy', {
      roomId: sessionId,
      task: {
        id: t.taskId,
        title: t.title,
        content: t.content,
        source: t.type,
        lessonId: t.lessonId ?? undefined,
        dmiItems: t.dmiItems,
        // Attached PDF (if any) — the server re-signs its url from the durable
        // fileKey on deploy and shows it in the Materials panel for everyone.
        sourceDocument: t.sourceDocument ?? undefined,
        deployedAt: Date.now(),
        polls: [],
        questions: [],
      },
    })
    toast.success(`Deployed "${t.title}"`)
    setTimeout(() => setDeployingId(null), 800)
  }

  return (
    <>
      <div className="pointer-events-auto flex h-full w-[22rem] flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Deploy from your courses</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!loading && items.length > 0 ? (
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search tasks, courses, lessons…"
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : courses.every(c => c.lessons.length === 0) ? (
            // Empty = no lessons AND no tasks (a course-scoped session still shows
            // its lessons, so this only fires for a truly empty course, an
            // all-courses session with no tasks, or a search that matched nothing).
            <div className="rounded-lg border border-dashed px-4 py-10 text-center text-xs text-slate-500">
              {query
                ? `No tasks match “${query}”.`
                : courseId
                  ? 'This session is scoped to its course, and that course has no lessons or tasks yet. Add them in the course builder.'
                  : 'No saved tasks to deploy yet. Create tasks in the course builder first.'}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {courses.map(c => {
                const isCollapsed = collapsed.has(c.courseId)
                return (
                  <div key={c.courseId} className="rounded-lg border border-slate-200">
                    <button
                      onClick={() => toggle(c.courseId)}
                      className="flex w-full items-center gap-1.5 rounded-t-lg bg-slate-50 px-2.5 py-2 text-left hover:bg-slate-100"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      )}
                      <BookOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs font-semibold text-slate-800">
                          {c.courseName}
                        </span>
                        {c.variantName ? (
                          <span className="truncate text-[10px] font-medium text-slate-400">
                            {c.variantName}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ' +
                          (c.coursePublished
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700')
                        }
                      >
                        {c.coursePublished ? 'Published' : 'Draft'}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">{c.taskCount}</span>
                    </button>

                    {!isCollapsed ? (
                      <div className="flex flex-col gap-2 p-2">
                        {c.lessons.map(l => (
                          <div key={l.lessonId}>
                            <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              {l.lessonTitle}
                            </p>
                            {l.tasks.length === 0 ? (
                              <p className="px-1 pb-1 text-[11px] italic text-slate-300">
                                No deployable tasks yet
                              </p>
                            ) : null}
                            <ul className="flex flex-col gap-1.5">
                              {l.tasks.map(t => (
                                <li
                                  key={t.taskId}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2"
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    {t.dmiItems.length > 0 ? (
                                      <ListChecks className="h-4 w-4 shrink-0 text-blue-400" />
                                    ) : (
                                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                                    )}
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-slate-900">
                                        {t.title}
                                      </p>
                                      <p className="flex items-center gap-1 text-[11px] capitalize text-slate-400">
                                        {t.type}
                                        {t.dmiItems.length > 0 ? (
                                          <span className="lowercase text-blue-500">
                                            · {t.dmiItems.length} q
                                            {t.dmiItems.length === 1 ? '' : 's'}
                                          </span>
                                        ) : null}
                                        {t.sourceDocument ? (
                                          <span className="inline-flex items-center gap-0.5 lowercase text-rose-500">
                                            · <FileText className="h-3 w-3" /> pdf
                                          </span>
                                        ) : null}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button
                                      onClick={() => setPreviewTask(t)}
                                      title="Preview the full task before deploying"
                                      aria-label={`Preview "${t.title}"`}
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      View
                                    </button>
                                    <button
                                      onClick={() => deploy(t)}
                                      disabled={deployingId === t.taskId}
                                      className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                                    >
                                      <Send className="h-3 w-3" />
                                      Deploy
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {previewTask ? (
        <TaskPreviewOverlay
          task={previewTask}
          deploying={deployingId === previewTask.taskId}
          onDeploy={() => {
            deploy(previewTask)
            setPreviewTask(null)
          }}
          onClose={() => setPreviewTask(null)}
        />
      ) : null}
    </>
  )
}

/**
 * Full read-only preview of a task/assessment BEFORE it is deployed, so the
 * tutor can see exactly what students will get: the attached document (if any),
 * the task content, and every question — rendered from the same student-safe
 * `dmiItems` (answers already stripped server-side) the students receive. A
 * "Deploy" action is offered inline so preview → deploy is one flow.
 */
function TaskPreviewOverlay({
  task,
  deploying,
  onDeploy,
  onClose,
}: {
  task: Deployable
  deploying: boolean
  onDeploy: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The importer stores "[Imported <file>]" as placeholder content when it can't
  // extract text from an uploaded doc. It's noise, not authored content — show
  // the real content only, and never as the sole "preview" of a task.
  const contentText = task.content?.trim() ?? ''
  // The importer emits "[Imported file.docx]" (single upload) or several such
  // blocks separated by blank lines (multi-upload). Match either shape wholly —
  // real authored content interleaved with a block breaks the match and is shown.
  const isImportPlaceholder = /^(\[Imported .+\]\s*)+$/.test(contentText)
  const showContent = contentText.length > 0 && !isImportPlaceholder
  const hasAnyPreview = !!task.sourceDocument || showContent || task.dmiItems.length > 0

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${task.title}`}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-500">
              Preview · {task.type}
            </p>
            <h3 className="truncate text-base font-semibold text-slate-900">{task.title}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {task.sourceDocument ? (
            <div className="mb-4 h-[55vh] w-full">
              <TaskDocumentCard sourceDocument={task.sourceDocument} alwaysOpen />
            </div>
          ) : null}

          {/* Hide the auto-generated "[Imported file.docx]" placeholder content —
              it's noise once the actual document is shown above. Only real
              authored content is rendered. */}
          {showContent ? (
            <div
              className="prose prose-sm mb-4 max-w-none text-slate-700"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(task.content) }}
            />
          ) : null}

          {task.dmiItems.length > 0 ? (
            <ol className="flex flex-col gap-4">
              {task.dmiItems.map((q, i) => (
                <li key={q.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-500">
                      {q.questionLabel || `Question ${q.questionNumber || i + 1}`}
                    </span>
                    {typeof q.marks === 'number' ? (
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {q.marks} mark{q.marks === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </div>
                  {q.questionText ? (
                    <p className="mb-2 whitespace-pre-wrap text-sm text-slate-800">
                      {q.questionText}
                    </p>
                  ) : null}
                  {q.hotspotImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={q.hotspotImageUrl}
                      alt=""
                      className="mb-2 max-h-64 w-auto rounded border border-slate-200"
                    />
                  ) : null}
                  {q.options && q.options.length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {q.options.map((opt, oi) => (
                        <li key={oi} className="flex items-start gap-2 text-sm text-slate-700">
                          <span className="shrink-0 font-semibold text-slate-400">
                            {String.fromCharCode(65 + oi)}.
                          </span>
                          <span className="whitespace-pre-wrap">{opt}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {q.matchPrompts && q.matchPrompts.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 text-sm text-slate-700">
                      <ul className="flex flex-col gap-1">
                        {q.matchPrompts.map((p, pi) => (
                          <li key={pi} className="whitespace-pre-wrap">
                            {pi + 1}. {p}
                          </li>
                        ))}
                      </ul>
                      {q.matchBank && q.matchBank.length > 0 ? (
                        <ul className="flex flex-col gap-1 text-slate-500">
                          {q.matchBank.map((b, bi) => (
                            <li key={bi} className="whitespace-pre-wrap">
                              • {b}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}

          {!hasAnyPreview ? (
            <p className="text-sm text-slate-400">This item has no previewable content.</p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
          <button
            onClick={onDeploy}
            disabled={deploying}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" />
            Deploy
          </button>
        </div>
      </div>
    </div>
  )
}
