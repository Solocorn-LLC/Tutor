'use client'

/**
 * AssessmentMasteryCard — per-topic mastery from a student's graded assessments,
 * weakest first, with a small trend sparkline and the misconceptions that recur.
 * Purely a read of /api/student/assessment-mastery; renders nothing until there
 * is at least one graded submission.
 */

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface TrendPoint {
  at: string | null
  score: number
}
interface TopicMastery {
  topic: string
  attempts: number
  averageScore: number
  latestScore: number
  delta: number
  trend: TrendPoint[]
  misconceptions: { label: string; count: number }[]
}

function barColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

function Sparkline({ trend }: { trend: TrendPoint[] }) {
  if (trend.length < 2) return null
  const w = 64
  const h = 20
  const max = 100
  const step = w / (trend.length - 1)
  const pts = trend
    .map((p, i) => `${(i * step).toFixed(1)},${(h - (p.score / max) * h).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function AssessmentMasteryCard() {
  const [topics, setTopics] = useState<TopicMastery[] | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/student/assessment-mastery', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { topics: [] }))
      .then(d => {
        if (active) setTopics(Array.isArray(d?.topics) ? d.topics : [])
      })
      .catch(() => active && setTopics([]))
    return () => {
      active = false
    }
  }, [])

  if (!topics || topics.length === 0) return null

  return (
    <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Your topic mastery</h2>
      <div className="space-y-3">
        {topics.slice(0, 6).map(t => {
          const trendUp = t.delta > 4
          const trendDown = t.delta < -4
          return (
            <div key={t.topic}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium text-gray-800">{t.topic}</span>
                <span className="flex shrink-0 items-center gap-2 text-gray-500">
                  <span
                    className={`inline-flex items-center gap-0.5 text-xs ${
                      trendUp ? 'text-emerald-600' : trendDown ? 'text-red-500' : 'text-gray-400'
                    }`}
                  >
                    {trendUp ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : trendDown ? (
                      <TrendingDown className="h-3.5 w-3.5" />
                    ) : (
                      <Minus className="h-3.5 w-3.5" />
                    )}
                    {t.delta > 0 ? `+${t.delta}` : t.delta}
                  </span>
                  <span className="font-semibold tabular-nums text-gray-700">
                    {t.averageScore}%
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${barColor(t.averageScore)}`}
                    style={{ width: `${Math.max(2, t.averageScore)}%` }}
                  />
                </div>
                <div className="text-gray-300">
                  <Sparkline trend={t.trend} />
                </div>
              </div>
              {t.misconceptions.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  Recurring slips: {t.misconceptions.map(m => m.label).join(', ')}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
