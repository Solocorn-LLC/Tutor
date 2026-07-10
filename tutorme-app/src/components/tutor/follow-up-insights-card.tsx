'use client'

/**
 * FollowUpInsightsCard — "where students ask for help". Reads
 * /api/tutor/follow-up-insights and lists the (task, question) pairs that drew
 * the most follow-up questions, with a few sample questions each. Renders
 * nothing until there's at least one follow-up.
 */

import { useEffect, useState } from 'react'
import { MessageCircleQuestion, ChevronDown, ChevronUp } from 'lucide-react'

interface Hotspot {
  taskId: string
  taskTitle: string
  questionId: string
  count: number
  samples: string[]
}

export function FollowUpInsightsCard() {
  const [items, setItems] = useState<Hotspot[] | null>(null)
  const [total, setTotal] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/tutor/follow-up-insights', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { items: [], totalFollowUps: 0 }))
      .then(d => {
        if (!active) return
        setItems(Array.isArray(d?.items) ? d.items : [])
        setTotal(typeof d?.totalFollowUps === 'number' ? d.totalFollowUps : 0)
      })
      .catch(() => active && setItems([]))
    return () => {
      active = false
    }
  }, [])

  if (!items || items.length === 0) return null

  return (
    <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-violet-900">
          <MessageCircleQuestion className="h-4 w-4" />
          Where students ask for help
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
            {total} follow-up{total === 1 ? '' : 's'}
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-violet-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-violet-500" />
        )}
      </button>

      {open && (
        <ul className="mt-3 space-y-2">
          {items.map(it => (
            <li
              key={`${it.taskId}:${it.questionId}`}
              className="rounded-lg border border-violet-100 bg-white/70 p-2.5"
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium text-gray-800">
                  {it.taskTitle} · Q{it.questionId}
                </span>
                <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                  {it.count} ask{it.count === 1 ? '' : 's'}
                </span>
              </div>
              {it.samples.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {it.samples.map((s, i) => (
                    <li key={i} className="truncate text-xs text-gray-500">
                      “{s}”
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
