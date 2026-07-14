'use client'

import { useEffect, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { toast } from 'sonner'
import { Loader2, Send, X, FileText, ListChecks } from 'lucide-react'
import type { StudentDmiItem } from '@/lib/assessment/student-dmi'

interface Deployable {
  taskId: string
  title: string
  type: 'task' | 'assessment' | 'homework'
  content: string
  lessonId: string | null
  /** Student-safe questions (answers already stripped server-side). */
  dmiItems: StudentDmiItem[]
}

/**
 * Tutor-only panel to deploy one of their saved tasks into the live session — the
 * same `task:deploy` socket event a course classroom uses, so the server persists
 * it (under the ad-hoc anchor for a course-less session) and broadcasts it to the
 * room. Self-contained: if the fetch or socket is unavailable it just shows an
 * empty/disabled state, never affecting the whiteboard/video around it.
 */
export function SessionDeployPanel({
  sessionId,
  socket,
  onClose,
}: {
  sessionId: string
  socket: Socket | null
  onClose: () => void
}) {
  const [items, setItems] = useState<Deployable[]>([])
  const [loading, setLoading] = useState(true)
  const [deployingId, setDeployingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/one-on-one/deployables', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { tasks: [] }))
      .then(d => {
        if (active) setItems(Array.isArray(d.tasks) ? d.tasks : [])
      })
      .catch(() => active && setItems([]))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

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
    <div className="pointer-events-auto flex h-full w-80 flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Deploy a task</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-xs text-slate-500">
            No saved tasks to deploy yet. Create tasks in the course builder first.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map(t => (
              <li
                key={t.taskId}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{t.title}</p>
                    <p className="flex items-center gap-1 text-[11px] capitalize text-slate-400">
                      {t.type}
                      {t.dmiItems.length > 0 ? (
                        <span className="inline-flex items-center gap-0.5 lowercase text-blue-500">
                          <ListChecks className="h-3 w-3" />
                          {t.dmiItems.length} q{t.dmiItems.length === 1 ? '' : 's'}
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
        )}
      </div>
    </div>
  )
}
