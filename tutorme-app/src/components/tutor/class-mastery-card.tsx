'use client'

/**
 * ClassMasteryCard — "class weak spots". Reads /api/tutor/class-mastery and lists
 * the tutor's topics weakest-first, with the class average, how many students
 * struggled, and the misconceptions that recur across the class. Renders nothing
 * until there's at least one graded submission.
 */

import { useEffect, useState } from 'react'
import { TrendingDown, ChevronDown, ChevronUp } from 'lucide-react'

interface TopicWeakSpot {
  topic: string
  averageScore: number
  attempts: number
  students: number
  strugglingStudents: number
  misconceptions: { label: string; count: number }[]
}

function barColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

export function ClassMasteryCard() {
  const [topics, setTopics] = useState<TopicWeakSpot[] | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/tutor/class-mastery', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { topics: [] }))
      .then(d => active && setTopics(Array.isArray(d?.topics) ? d.topics : []))
      .catch(() => active && setTopics([]))
    return () => {
      active = false
    }
  }, [])

  if (!topics || topics.length === 0) return null

  return (
    <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50/40 p-4">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-rose-900">
          <TrendingDown className="h-4 w-4" />
          Class weak spots
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-rose-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-rose-500" />
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {topics.map(t => (
            <div key={t.topic}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium text-gray-800">{t.topic}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
                  {t.strugglingStudents > 0 && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">
                      {t.strugglingStudents}/{t.students} struggling
                    </span>
                  )}
                  <span className="font-semibold tabular-nums text-gray-700">
                    {t.averageScore}%
                  </span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${barColor(t.averageScore)}`}
                  style={{ width: `${Math.max(2, t.averageScore)}%` }}
                />
              </div>
              {t.misconceptions.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  Recurring slips: {t.misconceptions.map(m => m.label).join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
