'use client'

/**
 * AssessmentReviewModal — read-only review of a submitted assessment.
 *
 * Closes the feedback loop: a student who already submitted can re-open a task
 * and see their score, the tutor's written feedback, and a per-question
 * breakdown (their answer vs the correct answer, points earned) — instead of the
 * one-shot results screen that vanished after the QuizModal closed.
 */

import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Clock, X } from 'lucide-react'
import type { QuestionResultItem } from './quiz-modal'

export interface AssessmentReviewQuestion {
  id: string
  question: string
  options?: string[]
  correctAnswer?: string
  points?: number
}

export interface AssessmentReviewData {
  title: string
  score: number | null
  maxScore?: number | null
  /** True once the tutor has finalized the grade (vs the provisional auto-grade). */
  graded: boolean
  feedback?: string | null
  submittedAt?: string | null
  gradedAt?: string | null
  questions: AssessmentReviewQuestion[]
  answers: Record<string, unknown> | null
  questionResults: QuestionResultItem[] | null
}

function formatAnswer(value: unknown): string {
  if (value == null || value === '') return '—'
  if (Array.isArray(value)) return value.map(v => String(v)).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function AssessmentReviewModal({
  data,
  onClose,
}: {
  data: AssessmentReviewData
  onClose: () => void
}) {
  const resultById = new Map<string, QuestionResultItem>()
  for (const r of data.questionResults ?? []) resultById.set(String(r.questionId), r)

  const scoreTxt = data.score != null ? `${Math.round(data.score)}%` : 'N/A'
  const gradedDate = data.gradedAt ?? data.submittedAt
  const dateTxt = gradedDate ? new Date(gradedDate).toLocaleDateString() : null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Review of ${data.title}`}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-gray-900">{data.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-2xl font-bold text-indigo-600">{scoreTxt}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  data.graded ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                {data.graded ? 'Graded by your tutor' : 'Provisional — awaiting your tutor'}
              </span>
              {dateTxt && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="h-3 w-3" />
                  {dateTxt}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close review"
            className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Tutor feedback — the headline of the review when present */}
          {data.feedback && (
            <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                Feedback from your tutor
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                {data.feedback}
              </p>
            </div>
          )}

          {/* Per-question breakdown */}
          <div className="space-y-3">
            {data.questions.map((q, i) => {
              const result = resultById.get(String(q.id))
              const yourAnswer = data.answers?.[q.id]
              const needsReview = result?.needsReview === true
              const correct = result?.correct === true
              return (
                <div key={q.id} className="rounded-xl border border-gray-200 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900">
                      <span className="mr-1 text-gray-400">Q{i + 1}.</span>
                      {q.question}
                    </p>
                    {result &&
                      (needsReview ? (
                        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          Tutor review
                        </span>
                      ) : correct ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600">
                          <CheckCircle className="h-3.5 w-3.5" /> Correct
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-red-500">
                          <XCircle className="h-3.5 w-3.5" /> Incorrect
                        </span>
                      ))}
                  </div>

                  <div className="mt-2 space-y-1 text-sm">
                    <p className="text-gray-700">
                      <span className="text-gray-400">Your answer: </span>
                      {formatAnswer(yourAnswer)}
                    </p>
                    {q.correctAnswer != null && q.correctAnswer !== '' && !correct && (
                      <p className="text-emerald-700">
                        <span className="text-gray-400">Correct answer: </span>
                        {q.correctAnswer}
                      </p>
                    )}
                    {result && !needsReview && (
                      <p className="text-xs text-gray-400">
                        {result.pointsEarned}/{result.pointsMax} points
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 p-4">
          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
