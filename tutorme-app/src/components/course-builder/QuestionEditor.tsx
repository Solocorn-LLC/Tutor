'use client'

/**
 * QuestionEditor — Standalone, reusable question editor component.
 *
 * Features:
 *  - Add/remove questions (MCQ, True/False, Short Answer, Essay)
 *  - Set correct answer, points, explanation per question
 *  - Drag-drop question reordering
 *  - Inline preview toggle
 *  - Import questions from AI generator
 *
 * Props:
 *  - questions: QuizQuestion[]
 *  - onChange: (questions: QuizQuestion[]) => void
 *  - courseId?: string — required for AI import
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { scrollElementIntoView } from '@/lib/scroll-into-view'

import {
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Wand2,
  Copy,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react'

// ---- Types ----

export interface QuizQuestion {
  id: string
  type: 'mcq' | 'truefalse' | 'shortanswer' | 'essay'
  question: string
  options?: string[]
  correctAnswer?: string | string[]
  points: number
  explanation?: string
  difficultyMode?: 'all' | 'fixed' | 'adaptive'
  fixedDifficulty?: string
  variants?: Record<string, any>
}

interface QuestionEditorProps {
  questions: QuizQuestion[]
  onChange: (questions: QuizQuestion[]) => void
  courseId?: string
  compact?: boolean
}

// ---- Helpers ----

function generateId() {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const QUESTION_TYPES = [
  { value: 'mcq', label: 'Multiple Choice' },
  { value: 'truefalse', label: 'True / False' },
  { value: 'shortanswer', label: 'Short Answer' },
  { value: 'essay', label: 'Essay' },
] as const

function defaultQuestion(type: QuizQuestion['type'] = 'mcq'): QuizQuestion {
  return {
    id: generateId(),
    type,
    question: '',
    options: type === 'mcq' ? ['', '', '', ''] : undefined,
    correctAnswer: type === 'truefalse' ? 'True' : '',
    points: 1,
    explanation: '',
  }
}

// ---- Component ----

export function QuestionEditor({
  questions,
  onChange,
  courseId,
  compact = false,
}: QuestionEditorProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(questions.map(q => q.id)))

  const itemRefs = useRef<Record<string, HTMLElement | null>>({})
  const prevExpandedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    expanded.forEach(id => {
      if (!prevExpandedRef.current.has(id)) {
        const el = itemRefs.current[id]
        if (el) scrollElementIntoView(el, { margin: 16 })
      }
    })
    prevExpandedRef.current = new Set(expanded)
  }, [expanded])
  const [previewMode, setPreviewMode] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiTopic, setAiTopic] = useState('')
  const [showAiImport, setShowAiImport] = useState(false)

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const addQuestion = (type: QuizQuestion['type'] = 'mcq') => {
    const q = defaultQuestion(type)
    onChange([...questions, q])
    setExpanded(prev => new Set(prev).add(q.id))
  }

  const removeQuestion = (id: string) => {
    onChange(questions.filter(q => q.id !== id))
  }

  const duplicateQuestion = (id: string) => {
    const idx = questions.findIndex(q => q.id === id)
    if (idx === -1) return
    const clone = { ...questions[idx], id: generateId() }
    const updated = [...questions]
    updated.splice(idx + 1, 0, clone)
    onChange(updated)
  }

  const updateQuestion = useCallback(
    (id: string, patch: Partial<QuizQuestion>) => {
      onChange(questions.map(q => (q.id === id ? { ...q, ...patch } : q)))
    },
    [questions, onChange]
  )

  const moveQuestion = (from: number, to: number) => {
    if (to < 0 || to >= questions.length) return
    const updated = [...questions]
    const [moved] = updated.splice(from, 1)
    updated.splice(to, 0, moved)
    onChange(updated)
  }

  // AI Import
  const handleAiImport = async () => {
    if (!aiTopic.trim()) {
      toast.error('Enter a topic to generate questions')
      return
    }
    setAiLoading(true)
    try {
      const res = await fetch('/api/tutor/questions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          topic: aiTopic,
          count: 5,
          difficulty: 'intermediate',
          types: ['multiple_choice', 'short_answer'],
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const aiQuestions: QuizQuestion[] = (data.questions || []).map((t: any) => ({
          id: t.id || generateId(),
          type: (t.type === 'mcq'
            ? 'mcq'
            : t.type === 'shortanswer'
              ? 'shortanswer'
              : t.type === 'essay'
                ? 'essay'
                : 'mcq') as QuizQuestion['type'],
          question: t.question || '',
          options: t.options || undefined,
          correctAnswer: t.correctAnswer || '',
          points: t.points ?? 1,
          explanation: t.explanation || '',
        }))

        if (aiQuestions.length > 0) {
          onChange([...questions, ...aiQuestions])
          toast.success(`Imported ${aiQuestions.length} AI-generated questions`)
          setShowAiImport(false)
          setAiTopic('')
        } else {
          toast.error('AI returned no questions')
        }
      } else {
        toast.error('AI generation failed')
      }
    } catch {
      toast.error('AI generation failed')
    } finally {
      setAiLoading(false)
    }
  }

  // ---- Preview Mode ----
  if (previewMode) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Student Preview ({questions.length} questions)</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewMode(false)}
            className="gap-1"
          >
            <EyeOff className="h-3 w-3" /> Exit Preview
          </Button>
        </div>
        {questions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No questions to preview</p>
        ) : (
          questions.map((q, idx) => (
            <Card key={q.id}>
              <CardContent className="pb-4 pt-4">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    Q{idx + 1}
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize">
                    {q.type}
                  </Badge>
                  <span className="text-muted-foreground ml-auto text-xs">{q.points} pts</span>
                </div>
                <p className="mb-3 text-sm font-medium">{q.question || '(No question text)'}</p>
                {q.type === 'mcq' && q.options && (
                  <div className="space-y-1.5">
                    {q.options.map((opt, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-lg border p-2 text-sm hover:bg-gray-50"
                      >
                        <span className="text-muted-foreground w-5 font-medium">
                          {String.fromCharCode(65 + i)}.
                        </span>
                        {opt || `Option ${i + 1}`}
                      </div>
                    ))}
                  </div>
                )}
                {q.type === 'truefalse' && (
                  <div className="flex gap-2">
                    {['True', 'False'].map(opt => (
                      <div key={opt} className="flex-1 rounded-lg border p-2 text-center text-sm">
                        {opt}
                      </div>
                    ))}
                  </div>
                )}
                {(q.type === 'shortanswer' || q.type === 'essay') && (
                  <div
                    className={cn(
                      'text-muted-foreground rounded-lg border bg-gray-50 p-2 text-sm',
                      q.type === 'essay' ? 'h-24' : 'h-10'
                    )}
                  >
                    Type your answer here...
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    )
  }

  // ---- Edit Mode ----
  return (
    <div className="space-y-3">
      {/* Header toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Questions ({questions.length})</span>
          <span className="text-muted-foreground text-xs">
            {questions.reduce((s, q) => s + q.points, 0)} pts total
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewMode(true)}
            className="gap-1"
          >
            <Eye className="h-3 w-3" /> Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAiImport(!showAiImport)}
            className="gap-1"
          >
            <Wand2 className="h-3 w-3" /> AI Import
          </Button>
        </div>
      </div>

      {/* AI Import Panel */}
      {showAiImport && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pb-4 pt-4">
            <Label className="mb-1 block text-xs font-medium">Generate questions about:</Label>
            <div className="flex gap-2">
              <Input
                value={aiTopic}
                onChange={e => setAiTopic(e.target.value)}
                placeholder="e.g. Photosynthesis, World War II, Algebra..."
                className="flex-1"
              />
              <Button size="sm" onClick={handleAiImport} disabled={aiLoading} className="gap-1">
                {aiLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3" />
                )}
                Generate
              </Button>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              AI will generate 5 questions and add them to your list
            </p>
          </CardContent>
        </Card>
      )}

      {/* Question List */}
      {questions.map((q, idx) => (
        <Card key={q.id} className="relative">
          <CardContent className="pb-3 pt-3">
            {/* Question Header */}
            <div className="flex items-center gap-2">
              <button
                className="text-muted-foreground cursor-grab hover:text-gray-600"
                title="Drag to reorder"
                onMouseDown={() => {}}
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <button
                onClick={() => toggleExpand(q.id)}
                className="flex items-center gap-1 text-sm font-medium"
              >
                {expanded.has(q.id) ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Q{idx + 1}
              </button>
              <Badge variant="outline" className="text-xs capitalize">
                {q.type}
              </Badge>
              <span className="text-muted-foreground flex-1 truncate text-xs">
                {q.question || '(Untitled)'}
              </span>
              <span className="text-muted-foreground text-xs">{q.points} pts</span>
              <div className="flex items-center gap-0.5">
                {idx > 0 && (
                  <button
                    onClick={() => moveQuestion(idx, idx - 1)}
                    className="text-muted-foreground p-1 text-xs hover:text-gray-600"
                    title="Move up"
                  >
                    ↑
                  </button>
                )}
                {idx < questions.length - 1 && (
                  <button
                    onClick={() => moveQuestion(idx, idx + 1)}
                    className="text-muted-foreground p-1 text-xs hover:text-gray-600"
                    title="Move down"
                  >
                    ↓
                  </button>
                )}
                <button
                  onClick={() => duplicateQuestion(q.id)}
                  className="text-muted-foreground p-1 hover:text-blue-600"
                  title="Duplicate"
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  onClick={() => removeQuestion(q.id)}
                  className="text-muted-foreground p-1 hover:text-red-600"
                  title="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Question Body (expanded) */}
            {expanded.has(q.id) && (
              <div
                ref={el => {
                  itemRefs.current[q.id] = el
                }}
                className="mt-3 space-y-3 pl-6"
              >
                {/* Type selector */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={q.type}
                      onValueChange={v => {
                        const newType = v as QuizQuestion['type']
                        const patch: Partial<QuizQuestion> = { type: newType }
                        if (newType === 'mcq' && !q.options) patch.options = ['', '', '', '']
                        if (newType === 'truefalse') {
                          patch.options = undefined
                          patch.correctAnswer = 'True'
                        }
                        if (newType === 'shortanswer' || newType === 'essay')
                          patch.options = undefined
                        updateQuestion(q.id, patch)
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUESTION_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Points</Label>
                    <Input
                      type="number"
                      min={1}
                      value={q.points}
                      onChange={e =>
                        updateQuestion(q.id, { points: parseInt(e.target.value) || 1 })
                      }
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Question text */}
                <div>
                  <Label className="text-xs">Question</Label>
                  <Textarea
                    value={q.question}
                    onChange={e => updateQuestion(q.id, { question: e.target.value })}
                    placeholder="Enter your question..."
                    rows={2}
                    className="mt-1"
                  />
                </div>

                {/* MCQ Options */}
                {q.type === 'mcq' && (
                  <div>
                    <Label className="text-xs">Options (click ✓ to set correct answer)</Label>
                    <div className="mt-1 space-y-1.5">
                      {(q.options || []).map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuestion(q.id, { correctAnswer: opt })}
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-full border transition-all',
                              q.correctAnswer === opt
                                ? 'border-green-500 bg-green-500 text-white'
                                : 'border-gray-300 hover:border-green-400'
                            )}
                          >
                            {q.correctAnswer === opt ? (
                              <CheckCircle className="h-3.5 w-3.5" />
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                {String.fromCharCode(65 + oi)}
                              </span>
                            )}
                          </button>
                          <Input
                            value={opt}
                            onChange={e => {
                              const newOpts = [...(q.options || [])]
                              newOpts[oi] = e.target.value
                              updateQuestion(q.id, { options: newOpts })
                            }}
                            placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                            className="flex-1"
                          />
                          {(q.options?.length || 0) > 2 && (
                            <button
                              onClick={() => {
                                const newOpts = (q.options || []).filter((_, i) => i !== oi)
                                updateQuestion(q.id, { options: newOpts })
                              }}
                              className="text-muted-foreground hover:text-red-500"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateQuestion(q.id, { options: [...(q.options || []), ''] })
                        }
                        className="gap-1 text-xs"
                      >
                        <Plus className="h-3 w-3" /> Add Option
                      </Button>
                    </div>
                  </div>
                )}

                {/* True/False */}
                {q.type === 'truefalse' && (
                  <div>
                    <Label className="text-xs">Correct Answer</Label>
                    <div className="mt-1 flex gap-2">
                      {['True', 'False'].map(opt => (
                        <button
                          key={opt}
                          onClick={() => updateQuestion(q.id, { correctAnswer: opt })}
                          className={cn(
                            'flex-1 rounded-lg border p-2 text-sm font-medium transition-all',
                            q.correctAnswer === opt
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'hover:bg-gray-50'
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Short Answer correct answer */}
                {q.type === 'shortanswer' && (
                  <div>
                    <Label className="text-xs">Expected Answer</Label>
                    <Input
                      value={typeof q.correctAnswer === 'string' ? q.correctAnswer : ''}
                      onChange={e => updateQuestion(q.id, { correctAnswer: e.target.value })}
                      placeholder="The expected correct answer"
                      className="mt-1"
                    />
                  </div>
                )}

                {/* Explanation */}
                <div>
                  <Label className="text-xs">Explanation (shown after grading)</Label>
                  <Textarea
                    value={q.explanation || ''}
                    onChange={e => updateQuestion(q.id, { explanation: e.target.value })}
                    placeholder="Why is this the correct answer?"
                    rows={2}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Add question buttons */}
      <div className="flex flex-wrap gap-2">
        {QUESTION_TYPES.map(t => (
          <Button
            key={t.value}
            variant="outline"
            size="sm"
            onClick={() => addQuestion(t.value as QuizQuestion['type'])}
            className="gap-1 text-xs"
          >
            <Plus className="h-3 w-3" /> {t.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

export default QuestionEditor
