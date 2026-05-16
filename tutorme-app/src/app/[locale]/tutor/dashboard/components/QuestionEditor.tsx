'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { Badge } from '@/components/ui/badge'
import { FileQuestion, Plus, X } from 'lucide-react'
import type { QuizQuestion } from './builder-types'
import {
  MatchingPairsEditor,
  ManualQuestionComposer,
  formatMatchingExplanation,
} from './builder-components'

interface QuestionEditorProps {
  questions: QuizQuestion[]
  onChange: (questions: QuizQuestion[]) => void
  showMultiselect?: boolean
  showManualComposer?: boolean
}

export function QuestionEditor({
  questions,
  onChange,
  showMultiselect = false,
  showManualComposer = false,
}: QuestionEditorProps) {
  const addQuestion = (type: QuizQuestion['type']) => {
    const matchingPairs =
      type === 'matching'
        ? [
            { left: '', right: '' },
            { left: '', right: '' },
          ]
        : undefined
    const newQuestion: QuizQuestion = {
      id: `q-${Date.now()}`,
      type,
      question: '',
      points: 1,
      options:
        type === 'mcq' || (showMultiselect && type === 'multiselect')
          ? ['', '', '', '']
          : type === 'truefalse'
            ? ['True', 'False']
            : undefined,
      matchingPairs,
      correctAnswer: matchingPairs ? matchingPairs.map(pair => pair.right) : undefined,
    }
    onChange([...questions, newQuestion])
  }

  const updateQuestion = (index: number, updates: Partial<QuizQuestion>) => {
    const newQuestions = [...questions]
    newQuestions[index] = { ...newQuestions[index], ...updates }
    onChange(newQuestions)
  }

  const removeQuestion = (index: number) => {
    onChange(questions.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <FileQuestion className="h-4 w-4 text-purple-500" />
          Questions ({questions.length})
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => addQuestion('mcq')}>
            <Plus className="mr-1 h-4 w-4" /> MCQ
          </Button>
          <Button variant="outline" size="sm" onClick={() => addQuestion('truefalse')}>
            <Plus className="mr-1 h-4 w-4" /> T/F
          </Button>
          <Button variant="outline" size="sm" onClick={() => addQuestion('shortanswer')}>
            <Plus className="mr-1 h-4 w-4" /> Short
          </Button>
          <Button variant="outline" size="sm" onClick={() => addQuestion('essay')}>
            <Plus className="mr-1 h-4 w-4" /> Essay
          </Button>
          {showMultiselect && (
            <Button variant="outline" size="sm" onClick={() => addQuestion('multiselect')}>
              <Plus className="mr-1 h-4 w-4" /> Multi-select
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => addQuestion('matching')}>
            <Plus className="mr-1 h-4 w-4" /> Matching
          </Button>
          <Button variant="outline" size="sm" onClick={() => addQuestion('fillblank')}>
            <Plus className="mr-1 h-4 w-4" /> Fill Blank
          </Button>
        </div>
      </div>

      {showManualComposer && (
        <ManualQuestionComposer
          onImport={incomingQuestions => onChange([...questions, ...incomingQuestions])}
        />
      )}

      <div className="space-y-3">
        {questions.map((q, idx) => (
          <div key={q.id} className="space-y-3 rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary">
                  Q{idx + 1} - {q.type.toUpperCase()}
                </Badge>
                <label className="text-muted-foreground flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={q.extendEnabled ?? false}
                    onChange={(e: any) => updateQuestion(idx, { extendEnabled: e.target.checked })}
                  />
                  Extend
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="h-8 w-20"
                  value={q.points}
                  onChange={(e: any) =>
                    updateQuestion(idx, { points: parseInt(e.target.value) || 1 })
                  }
                />
                <span className="text-muted-foreground text-sm">pts</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => removeQuestion(idx)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <AutoTextarea
              value={q.question}
              onChange={(e: any) => updateQuestion(idx, { question: e.target.value })}
              placeholder="Enter question"
              rows={2}
            />
            {q.type === 'mcq' && q.options && (
              <div className="space-y-2 pl-4">
                {q.options.map((opt, optIdx) => (
                  <div key={optIdx} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${q.id}`}
                      checked={q.correctAnswer === opt}
                      onChange={() => updateQuestion(idx, { correctAnswer: opt })}
                    />
                    <Input
                      value={opt}
                      onChange={(e: any) => {
                        const newOptions = [...q.options!]
                        newOptions[optIdx] = e.target.value
                        updateQuestion(idx, { options: newOptions })
                      }}
                      placeholder={`Option ${optIdx + 1}`}
                      className="flex-1"
                    />
                  </div>
                ))}
              </div>
            )}
            {q.type === 'multiselect' && q.options && (
              <div className="space-y-2 pl-4">
                {q.options.map((opt, optIdx) => {
                  const selectedAnswers = Array.isArray(q.correctAnswer) ? q.correctAnswer : []
                  const checked = selectedAnswers.includes(opt)
                  return (
                    <div key={optIdx} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e: any) => {
                          const next = new Set(selectedAnswers)
                          if (e.target.checked) next.add(opt)
                          else next.delete(opt)
                          updateQuestion(idx, { correctAnswer: Array.from(next) })
                        }}
                      />
                      <Input
                        value={opt}
                        onChange={(e: any) => {
                          const newOptions = [...q.options!]
                          newOptions[optIdx] = e.target.value
                          updateQuestion(idx, { options: newOptions })
                        }}
                        placeholder={`Option ${optIdx + 1}`}
                        className="flex-1"
                      />
                    </div>
                  )
                })}
              </div>
            )}
            {q.type === 'truefalse' && (
              <div className="flex gap-4 pl-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${q.id}`}
                    checked={q.correctAnswer === 'True'}
                    onChange={() => updateQuestion(idx, { correctAnswer: 'True' })}
                  />
                  <span>True</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${q.id}`}
                    checked={q.correctAnswer === 'False'}
                    onChange={() => updateQuestion(idx, { correctAnswer: 'False' })}
                  />
                  <span>False</span>
                </label>
              </div>
            )}
            {q.type === 'matching' && (
              <MatchingPairsEditor
                pairs={
                  q.matchingPairs ?? [
                    { left: '', right: '' },
                    { left: '', right: '' },
                  ]
                }
                onChange={nextPairs =>
                  updateQuestion(idx, {
                    matchingPairs: nextPairs,
                    correctAnswer: nextPairs.map(pair => pair.right),
                    explanation: formatMatchingExplanation(nextPairs),
                  })
                }
              />
            )}
            <Textarea
              value={q.explanation || ''}
              onChange={(e: any) => updateQuestion(idx, { explanation: e.target.value })}
              placeholder="Explanation (shown after answering)"
              rows={2}
              className="text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
