'use client'

/**
 * PciInterview — a conversational way to author the marking policy (PCI).
 *
 * Instead of a form, an assistant probes the tutor one plain-language question at
 * a time (Board, Subject, and the 10 PciSpec marking fields), interprets each
 * answer into the structured spec (shown live in "Your policy so far"), and on
 * finish saves the SAME { free-text pci + PciSpec } the Guided form produced —
 * so grading is unchanged. Simple language for non-native speakers.
 */

import { useEffect, useRef, useState } from 'react'
import { Send, Loader2, Sparkles, CheckCircle2, ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import { PCI_SPEC_FIELDS, pciSpecToText, type PciSpec } from '@/lib/assessment/pci-spec'
import type { MarkingSchemeDigestRow } from './PciQuestionnaire'

interface Msg {
  role: 'assistant' | 'user'
  content: string
}

interface PciInterviewProps {
  source: 'task' | 'assessment'
  title?: string
  content?: string
  markingScheme?: MarkingSchemeDigestRow[]
  board?: string
  subject?: string
  onExamContextChange?: (patch: { category?: string; board?: string }) => void
  canEdit: boolean
  onSave: (specText: string, spec: PciSpec) => void
  onClose: () => void
  /** Switch to the box-filling Guided form instead. */
  onSwitchToForm?: () => void
}

function schemeToText(rows?: MarkingSchemeDigestRow[]): string | undefined {
  if (!rows || rows.length === 0) return undefined
  return rows
    .map(r =>
      [
        r.label ? `${r.label}` : null,
        typeof r.marks === 'number' ? `[${r.marks}]` : null,
        r.rubric ? `— ${r.rubric}` : null,
      ]
        .filter(Boolean)
        .join(' ')
    )
    .filter(Boolean)
    .join('\n')
}

export function PciInterview({
  source,
  title,
  content,
  markingScheme,
  board,
  subject,
  onExamContextChange,
  canEdit,
  onSave,
  onClose,
  onSwitchToForm,
}: PciInterviewProps) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [spec, setSpec] = useState<PciSpec>({})
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [started, setStarted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const turn = async (history: Msg[]) => {
    setBusy(true)
    try {
      const res = await fetch('/api/ai/pci-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: source,
          title,
          content,
          markingScheme: schemeToText(markingScheme),
          history: history.map(m => ({ role: m.role, content: m.content })),
          spec,
          boardKnown: !!board?.trim(),
          subjectKnown: !!subject?.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'The assistant is unavailable')

      // Merge the extracted marking fields into the live spec.
      if (data.updates && typeof data.updates === 'object') {
        setSpec(prev => {
          const next = { ...prev }
          for (const { key } of PCI_SPEC_FIELDS) {
            const v = (data.updates as Record<string, string>)[key]
            if (typeof v === 'string' && v.trim()) next[key] = v.trim()
          }
          return next
        })
      }
      // Board / Subject flow back to Course details (Model A).
      const ex = data.examContext as { board?: string; category?: string } | undefined
      if (ex && (ex.board || ex.category)) {
        onExamContextChange?.({
          ...(ex.board ? { board: ex.board } : {}),
          ...(ex.category ? { category: ex.category } : {}),
        })
      }
      if (typeof data.message === 'string' && data.message.trim()) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message.trim() }])
      }
      if (data.done === true) setDone(true)
    } catch (e) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: e instanceof Error ? e.message : 'Sorry — please try again.',
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  // Kick off the interview once.
  useEffect(() => {
    if (started) return
    setStarted(true)
    void turn([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started])

  const send = () => {
    const q = draft.trim()
    if (!q || busy || !canEdit) return
    const next = [...messages, { role: 'user' as const, content: q }]
    setMessages(next)
    setDraft('')
    void turn(next)
  }

  const filledFields = PCI_SPEC_FIELDS.filter(f => spec[f.key]?.trim())
  const hasAnything = filledFields.length > 0 || !!board?.trim() || !!subject?.trim()

  const handleSave = () => {
    const text = pciSpecToText(spec)
    if (!text.trim()) {
      toast.error('Answer a few questions first, so there is a policy to save.')
      return
    }
    onSave(text, spec)
  }

  return (
    <div className="mt-2 flex max-h-[70vh] flex-col overflow-hidden rounded-lg border border-indigo-200 bg-white">
      <div className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-50/60 px-3 py-2">
        <Sparkles className="h-4 w-4 text-indigo-600" />
        <span className="text-sm font-semibold text-indigo-900">
          Set up your marking policy by chat
        </span>
        <div className="ml-auto flex items-center gap-2">
          {onSwitchToForm && (
            <button
              type="button"
              onClick={onSwitchToForm}
              className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
            >
              Use the form instead
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
          >
            Close
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 sm:grid-cols-[1fr_240px]">
        {/* Chat */}
        <div className="flex min-h-0 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m, i) =>
              m.role === 'assistant' ? (
                <div key={i} className="flex flex-col items-start">
                  <span className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-800">
                    {m.content}
                  </span>
                </div>
              ) : (
                <div key={i} className="flex justify-end">
                  <span className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-indigo-600 px-3 py-2 text-sm text-white">
                    {m.content}
                  </span>
                </div>
              )
            )}
            {busy && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
              </div>
            )}
          </div>
          <div className="border-t border-gray-100 p-2">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                disabled={busy || !canEdit}
                rows={1}
                placeholder="Type your answer…"
                className="max-h-28 min-h-[38px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <button
                type="button"
                onClick={send}
                disabled={busy || !draft.trim() || !canEdit}
                title="Send"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-400 text-white transition-colors hover:bg-slate-500 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Live "policy so far" */}
        <div className="min-h-0 overflow-y-auto border-t border-gray-100 bg-slate-50/60 p-3 sm:border-l sm:border-t-0">
          <p className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <ListChecks className="h-3.5 w-3.5" /> Your policy so far
          </p>
          {!hasAnything ? (
            <p className="text-xs text-slate-400">
              As you answer, your marking policy fills in here.
            </p>
          ) : (
            <ul className="space-y-2">
              {(board?.trim() || subject?.trim()) && (
                <li className="text-xs">
                  <span className="font-medium text-slate-600">Board / Subject:</span>{' '}
                  <span className="text-slate-700">
                    {[board?.trim(), subject?.trim()].filter(Boolean).join(' · ')}
                  </span>
                </li>
              )}
              {filledFields.map(f => (
                <li key={f.key} className="text-xs">
                  <span className="font-medium text-slate-600">{f.label}:</span>{' '}
                  <span className="text-slate-700">{spec[f.key]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-3 py-2">
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            {done ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> All done — review and
                save.
              </>
            ) : (
              `${filledFields.length} of ${PCI_SPEC_FIELDS.length} points set`
            )}
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasAnything}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            Save to PCI
          </button>
        </div>
      )}
    </div>
  )
}
