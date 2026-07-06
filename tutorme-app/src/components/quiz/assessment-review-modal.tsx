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
import { CheckCircle, XCircle, Clock, X, Sparkles, Loader2, Lightbulb } from 'lucide-react'
import type { QuestionResultItem } from './quiz-modal'
import type { AiQuestionFeedbackItem } from '@/lib/feedback/per-question-feedback'

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
  /** Grounded per-question AI study hints, once generated. */
  aiFeedback?: AiQuestionFeedbackItem[] | null
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
  onRequestHints,
  hintsLoading,
}: {
  data: AssessmentReviewData
  onClose: () => void
  /** Generate grounded AI study hints for the wrong answers (one call, cached). */
  onRequestHints?: () => void
  hintsLoading?: boolean
}) {
  const resultById = new Map<string, QuestionResultItem>()
  for (const r of data.questionResults ?? []) resultById.set(String(r.questionId), r)

  const hintById = new Map<string, AiQuestionFeedbackItem>()
  for (const h of data.aiFeedback ?? []) hintById.set(String(h.questionId), h)

  // Questions the auto-grader marked wrong (and could grade) — the ones AI hints
  // can explain. Offer the button only when there are some and none exist yet.
  const explainableWrong = (data.questionResults ?? []).filter(
    r => r.correct === false && r.needsReview !== true
  ).length
  const showHintsButton =
    !!onRequestHints && explainableWrong > 0 && (data.aiFeedback?.length ?? 0) === 0

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

          {/* AI study hints — offered once for the wrong answers, grounded in the
              tutor's marking basis. Clearly distinct from the tutor's own word. */}
          {showHintsButton && (
            <button
              type="button"
              onClick={onRequestHints}
              disabled={hintsLoading}
              className="mb-4 inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-60"
            >
              {hintsLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating study hints…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Explain what I got wrong
                </>
              )}
            </button>
          )}

          {/* Per-question breakdown */}
          <div className="space-y-3">
            {data.questions.map((q, i) => {
              const result = resultById.get(String(q.id))
              const yourAnswer = data.answers?.[q.id]
              const needsReview = result?.needsReview === true
              const correct = result?.correct === true
              const hint = hintById.get(String(q.id))
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

                  {/* Grounded AI study hint for a wrong answer */}
                  {hint && (
                    <div className="mt-2.5 rounded-lg border border-violet-100 bg-violet-50/60 p-2.5">
                      <p className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                        <Lightbulb className="h-3 w-3" /> AI study hint
                      </p>
                      <p className="text-sm leading-relaxed text-gray-800">{hint.explanation}</p>
                      {hint.misconception && (
                        <p className="mt-1 text-xs text-gray-500">
                          <span className="font-medium text-gray-600">Common slip:</span>{' '}
                          {hint.misconception}
                        </p>
                      )}
                      {hint.nextStep && (
                        <p className="mt-1 text-xs text-violet-700">
                          <span className="font-medium">Next step:</span> {hint.nextStep}
                        </p>
                      )}
                    </div>
                  )}
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
