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
} from 'lucide-react'
import type { StudentDmiItem } from '@/lib/assessment/student-dmi'

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
  coursePublished: boolean
  taskCount: number
  lessons: LessonGroup[]
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
  onClose,
}: {
  sessionId: string
  socket: Socket | null
  /** When the session is built around a course, only that course's tasks are
   *  deployable; null/undefined offers all the tutor's published tasks. */
  courseId?: string | null
  onClose: () => void
}) {
  const [items, setItems] = useState<Deployable[]>([])
  const [loading, setLoading] = useState(true)
  const [deployingId, setDeployingId] = useState<string | null>(null)
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
        if (active) setItems(Array.isArray(d.tasks) ? d.tasks : [])
      })
      .catch(() => active && setItems([]))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [courseId])

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
  }, [items, query])

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
        deployedAt: Date.now(),
        polls: [],
        questions: [],
      },
    })
    toast.success(`Deployed "${t.title}"`)
    setTimeout(() => setDeployingId(null), 800)
  }

  return (
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
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-xs text-slate-500">
            No saved tasks to deploy yet. Create tasks in the course builder first.
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-xs text-slate-500">
            No tasks match “{query}”.
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
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">
                      {c.courseName}
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
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => deploy(t)}
                                  disabled={deployingId === t.taskId}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                                >
                                  <Send className="h-3 w-3" />
                                  Deploy
                                </button>
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
  )
}
