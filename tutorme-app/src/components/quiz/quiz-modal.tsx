'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { PersonalizedFeedbackCard } from './PersonalizedFeedbackCard'

interface Question {
  id: string
  type: 'multiple_choice' | 'short_answer'
  question: string
  options?: string[]
  correctAnswer?: string
  rubric?: string
}

/** Per-question result for analytics and reports */
export interface QuestionResultItem {
  questionId: string
  correct: boolean
  pointsEarned: number
  pointsMax: number
  selectedAnswer?: unknown
  timeSpentSec?: number
}

/** What the parent's submit returns so the modal can show the authoritative
 *  server grade (used by the non-'instant' reveal modes). */
export interface QuizServerResult {
  score?: number | null
  questionResults?: QuestionResultItem[]
  correctAnswers?: Record<string, string>
}

interface QuizModalProps {
  questions: Question[]
  onComplete: (results: {
    score: number
    answers: Record<string, any>
    questionResults?: QuestionResultItem[]
  }) => void | Promise<QuizServerResult | void>
  onClose: () => void
  studentId?: string // Optional student ID for personalized feedback
  /** Tutor's answer-reveal policy. 'instant' keeps the legacy client-graded
   *  results; 'after_submit'/'hidden' use the server's authoritative grade. */
  answerReveal?: 'instant' | 'after_submit' | 'hidden'
}

export function QuizModal({
  questions,
  onComplete,
  onClose,
  studentId,
  answerReveal = 'instant',
}: QuizModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [showResults, setShowResults] = useState(false)
  const [serverScore, setServerScore] = useState<number | null>(null)
  const [gradedAnswers, setGradedAnswers] = useState<
    Record<
      string,
      {
        correct: boolean
        feedback?: string
        explanation?: string
        nextSteps?: string[]
        relatedStruggles?: string[]
        isPersonalized?: boolean
        score?: number
      }
    >
  >({})

  const currentQuestion = questions[currentIndex]
  const progress = ((currentIndex + 1) / questions.length) * 100

  const handleAnswer = (answer: any) => {
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: answer }))
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      gradeQuiz()
    }
  }

  const gradeQuiz = async () => {
    // Non-'instant' modes: the browser has no answer key, so submit first and
    // render the server's authoritative grade. Correct answers are revealed only
    // for 'after_submit'.
    if (answerReveal !== 'instant') {
      const server = (await onComplete({ answers, score: 0, questionResults: [] })) || {}
      const byId: Record<string, QuestionResultItem> = {}
      ;(server.questionResults || []).forEach(r => {
        byId[r.questionId] = r
      })
      const gradedFromServer: typeof gradedAnswers = {}
      for (const q of questions) {
        const r = byId[q.id]
        const reveal = answerReveal === 'after_submit' ? server.correctAnswers?.[q.id] : undefined
        gradedFromServer[q.id] = {
          correct: r?.correct ?? false,
          score: r?.pointsMax
            ? Math.round(((r.pointsEarned ?? 0) / r.pointsMax) * 100)
            : r?.correct
              ? 100
              : 0,
          explanation: reveal ? `Correct answer: ${reveal}` : undefined,
        }
      }
      setServerScore(typeof server.score === 'number' ? server.score : null)
      setGradedAnswers(gradedFromServer)
      setShowResults(true)
      return
    }

    const graded: Record<
      string,
      {
        correct: boolean
        feedback?: string
        explanation?: string
        nextSteps?: string[]
        relatedStruggles?: string[]
        isPersonalized?: boolean
        score?: number
      }
    > = {}
    let correctCount = 0

    for (const question of questions) {
      const answer = answers[question.id]

      if (question.type === 'multiple_choice') {
        const isCorrect = answer === question.correctAnswer
        graded[question.id] = { correct: isCorrect, score: isCorrect ? 100 : 0 }
        if (isCorrect) correctCount++
      } else if (question.type === 'short_answer') {
        // For short answer, we'll send to AI for grading with student context
        try {
          const response = await fetch('/api/quiz/grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: question.question,
              rubric: question.rubric,
              studentAnswer: answer,
              maxScore: 100,
              studentId, // Pass student ID for personalized feedback
            }),
          })
          const result = await response.json()
          graded[question.id] = {
            correct: result.score >= 70,
            feedback: result.feedback,
            explanation: result.explanation,
            nextSteps: result.nextSteps || [],
            relatedStruggles: result.relatedStruggles || [],
            isPersonalized: result.isPersonalized || false,
            score: result.score,
          }
          if (result.score >= 70) correctCount++
        } catch {
          graded[question.id] = {
            correct: false,
            feedback: 'Could not grade answer',
            score: 0,
          }
        }
      }
    }

    setGradedAnswers(graded)
    setShowResults(true)

    const questionResults: QuestionResultItem[] = questions.map(q => ({
      questionId: q.id,
      correct: graded[q.id]?.correct ?? false,
      pointsEarned: graded[q.id]?.score ?? 0,
      pointsMax: 100,
      selectedAnswer: answers[q.id],
    }))

    onComplete({
      score: Math.round((correctCount / questions.length) * 100),
      answers,
      questionResults,
    })
  }

  if (showResults) {
    const score =
      serverScore != null
        ? serverScore
        : Math.round(
            (Object.values(gradedAnswers).filter(g => g.correct).length / questions.length) * 100
          )

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <Card className="max-h-[90vh] w-full max-w-lg overflow-auto">
          <CardHeader>
            <CardTitle className="text-center">Quiz Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 text-center">
              <div className="mb-2 text-5xl font-bold">
                {score >= 80 ? (
                  <span className="text-green-500">{score}%</span>
                ) : score >= 60 ? (
                  <span className="text-yellow-500">{score}%</span>
                ) : (
                  <span className="text-red-500">{score}%</span>
                )}
              </div>
              <p className="text-gray-600">
                {score >= 80
                  ? 'Excellent work!'
                  : score >= 60
                    ? 'Good effort! Keep practicing.'
                    : 'Keep studying! You will improve.'}
              </p>
              {/* This just-submitted score is the automatic grade. Written answers
                  are flagged for the tutor, who may review and adjust it — so it's
                  provisional until the tutor finalizes it. */}
              <div className="mx-auto mt-3 max-w-sm rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span className="font-semibold">Provisional score</span> — auto-graded now. Your
                tutor may review and adjust it (especially written answers).
              </div>
            </div>

            <div className="space-y-4">
              {questions.map((q, idx) => {
                const graded = gradedAnswers[q.id]
                const hasPersonalizedFeedback =
                  graded?.isPersonalized &&
                  (graded.nextSteps?.length || graded.relatedStruggles?.length)

                return (
                  <div key={q.id}>
                    <div className="mb-2 flex items-start gap-2">
                      {graded?.correct ? (
                        <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" />
                      ) : (
                        <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">Question {idx + 1}</p>
                        <p className="text-sm text-gray-600">{q.question}</p>
                      </div>
                    </div>

                    {hasPersonalizedFeedback ? (
                      <PersonalizedFeedbackCard
                        feedback={graded.feedback || ''}
                        explanation={graded.explanation || ''}
                        nextSteps={graded.nextSteps}
                        relatedStruggles={graded.relatedStruggles}
                        isPersonalized={graded.isPersonalized}
                        score={graded.score || 0}
                        maxScore={100}
                      />
                    ) : (
                      graded?.feedback && (
                        <div className="ml-7 mt-2 rounded-lg border bg-gray-50 p-3">
                          <p className="text-sm text-gray-700">{graded.feedback}</p>
                          {graded.explanation && (
                            <p className="mt-1 text-xs text-gray-500">{graded.explanation}</p>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )
              })}
            </div>

            <Button className="mt-6 w-full" onClick={onClose}>
              Continue Learning
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Skip
            </Button>
          </div>
          <Progress value={progress} />
          <CardTitle className="mt-4">{currentQuestion.question}</CardTitle>
        </CardHeader>
        <CardContent>
          {currentQuestion.type === 'multiple_choice' && currentQuestion.options && (
            <div className="space-y-2">
              {currentQuestion.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAnswer(option)}
                  className={`w-full rounded-lg border p-4 text-left transition-colors ${
                    answers[currentQuestion.id] === option
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          {currentQuestion.type === 'short_answer' && (
            <div className="space-y-4">
              <textarea
                value={answers[currentQuestion.id] || ''}
                onChange={e => handleAnswer(e.target.value)}
                placeholder="Type your answer here..."
                className="h-32 w-full resize-none rounded-lg border p-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {currentQuestion.rubric && (
                <p className="text-sm text-gray-500">
                  <AlertCircle className="mr-1 inline h-4 w-4" />
                  Grading criteria: {currentQuestion.rubric}
                </p>
              )}
            </div>
          )}

          <Button
            className="mt-6 w-full"
            onClick={handleNext}
            disabled={!answers[currentQuestion.id]}
          >
            {currentIndex < questions.length - 1 ? 'Next' : 'Submit'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
