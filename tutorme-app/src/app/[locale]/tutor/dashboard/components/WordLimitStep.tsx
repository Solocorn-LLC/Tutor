'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { DMIQuestion } from './builder-types'
import { isOpenDmiType } from '@/lib/assessment/question-types'

interface WordLimitStepProps {
  items: DMIQuestion[]
  canEdit: boolean
  onChange: (limits: Record<string, number | null>) => void
}

export function WordLimitStep({ items, canEdit, onChange }: WordLimitStepProps) {
  const textualItems = useMemo(
    () => items.filter(q => isOpenDmiType(q.questionType) || q.questionType === 'fill_blank'),
    [items]
  )

  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const q of textualItems) {
      initial[q.id] = q.wordLimit === null || q.wordLimit === undefined ? '' : String(q.wordLimit)
    }
    return initial
  })

  // Keep draft in sync if the DMI items change (e.g., after a marking-scheme upload).
  useEffect(() => {
    setDraft(prev => {
      const next: Record<string, string> = {}
      for (const q of textualItems) {
        next[q.id] =
          prev[q.id] ??
          (q.wordLimit === null || q.wordLimit === undefined ? '' : String(q.wordLimit))
      }
      return next
    })
  }, [textualItems.map(q => `${q.id}:${q.wordLimit ?? ''}`).join('|')])

  // Notify parent whenever a valid draft value changes.
  useEffect(() => {
    const limits: Record<string, number | null> = {}
    for (const q of textualItems) {
      const raw = draft[q.id]?.trim()
      if (!raw) {
        limits[q.id] = null
      } else {
        const n = Number(raw)
        if (Number.isFinite(n) && n > 0) limits[q.id] = Math.round(n)
      }
    }
    onChange(limits)
  }, [draft, textualItems, onChange])

  if (textualItems.length === 0) {
    return (
      <p className="text-[11px] leading-snug text-slate-500">
        No open-ended textual questions in this assessment, so word limits do not apply.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-snug text-slate-500">
        Confirm or set a maximum word count for each textual response. The LLM inferred these from
        the assessment document; an uploaded answer sheet takes precedence. Leave a field blank to
        let the response grow freely.
      </p>

      {textualItems.map(item => {
        const raw = draft[item.id] ?? ''
        const hasValue = raw.trim().length > 0
        const number = Number(raw.trim())
        const invalid = hasValue && (!Number.isFinite(number) || number <= 0)
        const label = item.questionLabel ?? String(item.questionNumber)
        return (
          <div
            key={item.id}
            className={cn(
              'rounded-md border bg-white p-2',
              !hasValue ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-slate-700">Question {label}</p>
                <p className="truncate text-[10px] text-slate-500">{item.questionText}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={raw}
                  readOnly={!canEdit}
                  onChange={e => {
                    const v = e.target.value
                    // Allow empty or positive integers only.
                    if (v === '' || /^\d+$/.test(v)) {
                      setDraft(prev => ({ ...prev, [item.id]: v }))
                    }
                  }}
                  placeholder="No limit"
                  className={cn(
                    'w-20 rounded-md border p-1.5 text-right text-[11px] text-gray-900 placeholder:text-slate-400',
                    invalid
                      ? 'border-red-300 bg-red-50'
                      : !hasValue
                        ? 'border-amber-300 bg-white'
                        : 'border-gray-300 bg-white'
                  )}
                />
                <span className="w-10 text-[10px] text-slate-500">words</span>
              </div>
            </div>
            {!hasValue && (
              <p className="mt-1 text-[10px] text-amber-700">
                No word limit inferred — enter a value or leave blank for a free response.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Build a concise response-length policy sentence from confirmed limits. */
export function buildResponseLengthPolicy(
  items: DMIQuestion[],
  limits: Record<string, number | null>
): string {
  const textual = items.filter(
    q => isOpenDmiType(q.questionType) || q.questionType === 'fill_blank'
  )
  const withLimit = textual
    .map(q => ({ q, limit: limits[q.id] }))
    .filter(({ limit }) => typeof limit === 'number')
    .map(({ q, limit }) => ({
      ref: q.questionLabel ?? String(q.questionNumber),
      limit: limit as number,
    }))
  if (withLimit.length === 0) return 'No word limits — textual responses may be any length.'

  // Group by limit value.
  const byLimit = new Map<number, string[]>()
  for (const { ref, limit } of withLimit) {
    const arr = byLimit.get(limit) ?? []
    arr.push(ref)
    byLimit.set(limit, arr)
  }

  const parts: string[] = []
  for (const [limit, refs] of Array.from(byLimit.entries()).sort((a, b) => a[0] - b[0])) {
    parts.push(`${refs.join(', ')}: up to ${limit} words`)
  }

  const missing = textual.filter(q => limits[q.id] === null || limits[q.id] === undefined).length
  if (missing > 0) {
    parts.push(`${missing} question${missing === 1 ? '' : 's'} with no word limit`)
  }

  return `Word limits — ${parts.join('; ')}.`
}
