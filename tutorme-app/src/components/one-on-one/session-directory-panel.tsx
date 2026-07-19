'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  X,
  Folder,
  FileText,
  Video,
  ChevronRight,
  ChevronDown,
  Loader2,
  User as UserIcon,
} from 'lucide-react'
import { TaskDocumentCard } from '@/components/task/TaskDocumentCard'
import { sanitizeHtml } from '@/lib/security/sanitize'
import { isImportPlaceholder } from '@/lib/tasks/import-placeholder'

/**
 * The student's course Directory inside the live 1-on-1/group classroom — the same
 * feature as the course-builder classroom's Directory. It fetches the SAME source
 * (`/api/student/directory`), so the content (Tutors → Courses → tasks / assessments
 * / materials / homework / reports / recorded sessions) is identical no matter which
 * classroom the student is in. Items open in a self-contained viewer (the document is
 * re-signed server-side, so it just renders); reports open a summary.
 */

interface DirItem {
  id: string
  itemId?: string
  title: string
  type: string
  deployedAt?: string
  content?: unknown
  courseName?: string
}
interface CourseNode {
  courseId?: string
  tasks?: DirItem[]
  assessments?: DirItem[]
  homework?: DirItem[]
  materials?: DirItem[]
  reports?: DirItem[]
  recordedSessions?: DirItem[]
}
type Directory = Record<string, Record<string, CourseNode>>

// Categories in the same order + colours as the course-builder directory.
const CATEGORIES: {
  key: keyof CourseNode
  label: string
  icon: typeof FileText
  color: string
}[] = [
  { key: 'tasks', label: 'Tasks', icon: FileText, color: 'text-blue-400' },
  { key: 'assessments', label: 'Assessments', icon: FileText, color: 'text-purple-400' },
  { key: 'materials', label: 'Materials', icon: FileText, color: 'text-amber-400' },
  { key: 'homework', label: 'Homework', icon: FileText, color: 'text-emerald-400' },
  { key: 'reports', label: 'Reports', icon: FileText, color: 'text-orange-400' },
  { key: 'recordedSessions', label: 'Recorded sessions', icon: Video, color: 'text-rose-400' },
]

interface SourceDoc {
  fileName?: string | null
  fileUrl?: string | null
  fileKey?: string | null
  mimeType?: string | null
}
/** Read-only, student-safe view of a question (never carries answer/rubric). */
interface DirQuestion {
  id?: string
  questionNumber?: number
  questionLabel?: string
  questionText?: string
  options?: string[]
}
type Detail =
  | {
      kind: 'doc'
      title: string
      html: string | null
      sourceDocument: SourceDoc | null
      questions: DirQuestion[]
    }
  | {
      kind: 'report'
      title: string
      strengths: string[]
      weaknesses: string[]
      comments: string | null
      score: number | null
    }

export function SessionDirectoryPanel({ onClose }: { onClose: () => void }) {
  const [directory, setDirectory] = useState<Directory>({})
  const [warnings, setWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [detail, setDetail] = useState<Detail | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch('/api/student/directory', { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Server error (${r.status})`))))
      .then((d: { directory?: Directory; errors?: string[] }) => {
        if (!active) return
        const dir = d.directory ?? {}
        setDirectory(dir)
        setWarnings(Array.isArray(d.errors) ? d.errors : [])
        // Open every tutor + course folder by default (categories default open too).
        const o: Record<string, boolean> = {}
        for (const [tutor, courses] of Object.entries(dir)) {
          o[`tutor_${tutor}`] = true
          for (const course of Object.keys(courses)) o[`cat_${tutor}_${course}`] = true
        }
        setOpen(o)
      })
      .catch(e => active && setError(e instanceof Error ? e.message : 'Failed to load directory'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const toggle = (k: string) => setOpen(p => ({ ...p, [k]: !p[k] }))

  const tutors = useMemo(() => Object.entries(directory), [directory])

  const openItem = (item: DirItem) => {
    if (item.type === 'report') {
      const c = (item.content ?? {}) as {
        strengths?: unknown
        weaknesses?: unknown
        overallComments?: string | null
        score?: number | null
      }
      setDetail({
        kind: 'report',
        title: item.title,
        strengths: toList(c.strengths),
        weaknesses: toList(c.weaknesses),
        comments: c.overallComments ?? null,
        score: typeof c.score === 'number' ? c.score : null,
      })
      return
    }
    let parsed: Record<string, unknown> = {}
    const raw = item.content
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = {}
      }
    } else if (raw && typeof raw === 'object') {
      parsed = raw as Record<string, unknown>
    }
    const html = typeof parsed.content === 'string' ? parsed.content : null
    // Read the questions student-safe: only the prompt + option bank, NEVER answer
    // or rubric — even if the stored content happens to carry them.
    const rawQ = Array.isArray(parsed.dmiItems)
      ? (parsed.dmiItems as Record<string, unknown>[])
      : []
    const questions: DirQuestion[] = rawQ.map(q => ({
      id: typeof q.id === 'string' ? q.id : undefined,
      questionNumber: typeof q.questionNumber === 'number' ? q.questionNumber : undefined,
      questionLabel: typeof q.questionLabel === 'string' ? q.questionLabel : undefined,
      questionText: typeof q.questionText === 'string' ? q.questionText : undefined,
      options: Array.isArray(q.options)
        ? q.options.filter((o): o is string => typeof o === 'string')
        : undefined,
    }))
    setDetail({
      kind: 'doc',
      title: item.title,
      html: html && !isImportPlaceholder(html) ? sanitizeHtml(html) : null,
      sourceDocument: (parsed.sourceDocument as SourceDoc | undefined) ?? null,
      questions,
    })
  }

  return (
    <div className="pointer-events-auto flex h-full w-[24rem] max-w-[92vw] flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Folder className="h-4 w-4 text-indigo-500" fill="currentColor" />
          Directory
        </h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            Failed to load directory — {error}
          </div>
        ) : tutors.length === 0 ? (
          <div className="px-3 py-10 text-center text-xs text-slate-500">
            No enrolled courses found.
          </div>
        ) : (
          <>
            {warnings.length > 0 ? (
              <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700">
                Some items couldn’t load; showing what’s available.
              </div>
            ) : null}
            {tutors.map(([tutor, courses]) => {
              const tKey = `tutor_${tutor}`
              const tOpen = open[tKey]
              const tutorName = tutor.startsWith('Tutor@') ? tutor.slice(6) : tutor
              return (
                <div key={tutor}>
                  <FolderRow
                    open={!!tOpen}
                    onClick={() => toggle(tKey)}
                    icon={<UserIcon className="h-4 w-4 text-slate-400" />}
                    label={tutorName || 'Tutor'}
                    bold
                  />
                  {tOpen ? (
                    <div className="ml-4">
                      {Object.entries(courses).map(([courseName, node]) => {
                        const cKey = `cat_${tutor}_${courseName}`
                        const cOpen = open[cKey]
                        return (
                          <div key={courseName}>
                            <FolderRow
                              open={!!cOpen}
                              onClick={() => toggle(cKey)}
                              icon={
                                <Folder className="h-4 w-4 text-indigo-400" fill="currentColor" />
                              }
                              label={courseName}
                            />
                            {cOpen ? (
                              <div className="ml-4">
                                {CATEGORIES.map(cat => {
                                  const items = (node[cat.key] as DirItem[] | undefined) ?? []
                                  const catKey = `${cKey}_${cat.key}`
                                  const catOpen = open[catKey] ?? true
                                  const Icon = cat.icon
                                  return (
                                    <div key={cat.key}>
                                      <FolderRow
                                        open={catOpen}
                                        onClick={() => toggle(catKey)}
                                        icon={
                                          <Folder
                                            className={`h-4 w-4 ${cat.color}`}
                                            fill="currentColor"
                                          />
                                        }
                                        label={cat.label}
                                        count={items.length}
                                      />
                                      {catOpen ? (
                                        <div className="ml-5">
                                          {items.length === 0 ? (
                                            <p className="px-2 py-1 text-xs text-slate-400">
                                              Empty folder
                                            </p>
                                          ) : (
                                            [...items].reverse().map(item => (
                                              <button
                                                key={item.id}
                                                onClick={() => openItem(item)}
                                                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-100"
                                              >
                                                <Icon
                                                  className={`h-3.5 w-3.5 shrink-0 ${cat.color}`}
                                                />
                                                <span className="truncate">{item.title}</span>
                                              </button>
                                            ))
                                          )}
                                        </div>
                                      ) : null}
                                    </div>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </>
        )}
      </div>

      {detail ? <DirectoryItemViewer detail={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  )
}

function FolderRow({
  open,
  onClick,
  icon,
  label,
  bold,
  count,
}: {
  open: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  bold?: boolean
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left hover:bg-slate-50"
    >
      {open ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      )}
      {icon}
      <span
        className={`min-w-0 flex-1 truncate text-xs ${bold ? 'font-semibold text-slate-800' : 'text-slate-700'}`}
      >
        {label}
      </span>
      {typeof count === 'number' && count > 0 ? (
        <span className="shrink-0 text-[10px] text-slate-400">{count}</span>
      ) : null}
    </button>
  )
}

/** Full-screen viewer for a selected directory item (document task or report). */
function DirectoryItemViewer({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
          <h3 className="truncate text-base font-semibold text-slate-900">{detail.title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {detail.kind === 'doc' ? (
            <>
              {detail.sourceDocument ? (
                <div className="mb-4 h-[60vh] w-full">
                  <TaskDocumentCard sourceDocument={detail.sourceDocument} alwaysOpen />
                </div>
              ) : null}
              {detail.html ? (
                <div
                  className="prose prose-sm mb-4 max-w-none text-slate-700"
                  dangerouslySetInnerHTML={{ __html: detail.html }}
                />
              ) : null}
              {detail.questions.length > 0 ? (
                <ol className="flex flex-col gap-3">
                  {detail.questions.map((q, i) => (
                    <li key={q.id ?? i} className="rounded-lg border border-slate-200 p-3">
                      <p className="mb-1 text-xs font-semibold text-slate-500">
                        {q.questionLabel || `Question ${q.questionNumber || i + 1}`}
                      </p>
                      {q.questionText ? (
                        <p className="mb-2 whitespace-pre-wrap text-sm text-slate-800">
                          {q.questionText}
                        </p>
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
                    </li>
                  ))}
                </ol>
              ) : null}
              {!detail.sourceDocument && !detail.html && detail.questions.length === 0 ? (
                <p className="text-sm text-slate-400">Nothing to preview for this item.</p>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              {detail.score != null ? (
                <p className="text-slate-800">
                  <span className="font-semibold">Score:</span> {detail.score}
                </p>
              ) : null}
              {detail.strengths.length > 0 ? (
                <div>
                  <p className="font-semibold text-emerald-700">Strengths</p>
                  <ul className="ml-4 list-disc text-slate-700">
                    {detail.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {detail.weaknesses.length > 0 ? (
                <div>
                  <p className="font-semibold text-rose-700">To improve</p>
                  <ul className="ml-4 list-disc text-slate-700">
                    {detail.weaknesses.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {detail.comments ? (
                <p className="whitespace-pre-wrap text-slate-700">{detail.comments}</p>
              ) : null}
              {detail.score == null &&
              !detail.strengths.length &&
              !detail.weaknesses.length &&
              !detail.comments ? (
                <p className="text-slate-400">This report has no detail yet.</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function toList(v: unknown): string[] {
  if (Array.isArray(v))
    return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  return []
}
