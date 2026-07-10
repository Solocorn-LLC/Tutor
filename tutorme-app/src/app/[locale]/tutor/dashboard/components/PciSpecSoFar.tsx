'use client'

/**
 * PciSpecSoFar — the live "policy so far" panel for the PCI assistant chat.
 *
 * As the tutor answers the assistant's probing questions, the model reports what
 * it has captured (a partial PciSpec); this shows a CHECKLIST of every policy
 * point — captured (✓, with the value) vs still to define (○) — plus an "X of N"
 * count, so the tutor sees the marking policy taking shape AND what's left. A
 * just-captured field flashes briefly. Each captured field can be corrected
 * inline (the correction is fed back to the assistant as authoritative). It does
 * NOT finalize anything — the saved PCI is still only written when the tutor
 * applies it.
 */

import { useEffect, useRef, useState } from 'react'
import { ListChecks, Check, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PCI_SPEC_FIELDS, type PciSpec } from '@/lib/assessment/pci-spec'

type PciSpecKey = keyof PciSpec

interface PciSpecSoFarProps {
  spec?: PciSpec
  board?: string
  subject?: string
  /** Whether to show the exam Board — Board applies to assessments only, not
   *  tasks. Defaults to true; pass false for tasks. */
  showBoard?: boolean
  /** Allow inline corrections of captured fields. */
  editable?: boolean
  onEditField?: (key: PciSpecKey, value: string) => void
}

export function PciSpecSoFar({
  spec,
  board,
  subject,
  showBoard = true,
  editable,
  onEditField,
}: PciSpecSoFarProps) {
  // Board (AP, IB, SAT…) is an assessment-only concept; tasks show subject only.
  const contextValue = showBoard
    ? [board?.trim(), subject?.trim()].filter(Boolean).join(' · ')
    : subject?.trim() || ''
  const hasContext = !!contextValue
  const total = PCI_SPEC_FIELDS.length
  const filledCount = PCI_SPEC_FIELDS.filter(f => spec?.[f.key]?.trim()).length

  // Flash a field the moment its captured value appears or changes.
  const prevRef = useRef<Record<string, string>>({})
  const [flash, setFlash] = useState<Set<string>>(new Set())
  useEffect(() => {
    const changed = new Set<string>()
    for (const f of PCI_SPEC_FIELDS) {
      const v = (spec?.[f.key] ?? '').trim()
      if (v && v !== (prevRef.current[f.key] ?? '')) changed.add(f.key)
      prevRef.current[f.key] = v
    }
    if (changed.size === 0) return
    setFlash(changed)
    const t = setTimeout(() => setFlash(new Set()), 1400)
    return () => clearTimeout(t)
  }, [spec])

  // Inline edit state.
  const [editingKey, setEditingKey] = useState<PciSpecKey | null>(null)
  const [draft, setDraft] = useState('')
  const startEdit = (key: PciSpecKey, current: string) => {
    setEditingKey(key)
    setDraft(current)
  }
  const saveEdit = (key: PciSpecKey) => {
    onEditField?.(key, draft.trim())
    setEditingKey(null)
  }

  // Nothing captured and no board/subject yet → stay hidden (pre-interview).
  if (filledCount === 0 && !hasContext) return null

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2">
      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
        <ListChecks className="h-3.5 w-3.5" /> Your policy so far
        <span className="ml-auto rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium normal-case text-indigo-700">
          {filledCount} of {total}
        </span>
      </p>
      <ul className="space-y-0.5">
        {hasContext && (
          <li className="px-1 py-0.5 text-xs">
            <span className="font-medium text-slate-600">
              {showBoard ? 'Board / Subject:' : 'Subject:'}
            </span>{' '}
            <span className="text-slate-700">{contextValue}</span>
          </li>
        )}
        {PCI_SPEC_FIELDS.map(f => {
          const value = spec?.[f.key]?.trim() ?? ''
          const done = !!value
          const isEditing = editingKey === f.key
          return (
            <li
              key={f.key}
              className={cn(
                'group rounded px-1 py-0.5 text-xs transition-colors duration-500',
                flash.has(f.key) && 'bg-emerald-100'
              )}
            >
              <div className="flex items-start gap-1.5">
                {done ? (
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                ) : (
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-slate-300" />
                )}
                <div className="min-w-0 flex-1">
                  <span className={cn('font-medium', done ? 'text-slate-600' : 'text-slate-400')}>
                    {f.label}
                  </span>
                  {isEditing ? (
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        value={draft}
                        autoFocus
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEdit(f.key)
                          if (e.key === 'Escape') setEditingKey(null)
                        }}
                        aria-label={`Correct ${f.label}`}
                        className="min-w-0 flex-1 rounded border border-indigo-300 px-1 py-0.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                      <button
                        type="button"
                        onClick={() => saveEdit(f.key)}
                        title="Save correction"
                        className="text-emerald-600 hover:text-emerald-700"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingKey(null)}
                        title="Cancel"
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : done ? (
                    <>
                      {': '}
                      <span className="text-slate-700">{value}</span>
                      {editable && onEditField && (
                        <button
                          type="button"
                          onClick={() => startEdit(f.key, value)}
                          title="Correct this"
                          aria-label={`Correct ${f.label}`}
                          className="ml-1 inline-flex align-middle text-indigo-500 opacity-0 transition-opacity hover:text-indigo-700 group-hover:opacity-100"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400"> — not yet defined</span>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
