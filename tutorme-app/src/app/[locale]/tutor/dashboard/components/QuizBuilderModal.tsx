'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileQuestion, Plus, X, Shield, FileText } from 'lucide-react'
import { toast } from 'sonner'
import type { Quiz, CourseBuilderNodeQuiz, QuizQuestion, BuilderModalProps } from './builder-types'
import { ResourceImportPanel, QuestionsPreview, formatMatchingExplanation } from './builder-components'
import { DEFAULT_QUIZ, DEFAULT_NODE_QUIZ } from './builder-utils'
import { QuestionEditor } from './QuestionEditor'

export function QuizBuilderModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  isCourseBuilderNodeQuiz = false,
}: BuilderModalProps & { isCourseBuilderNodeQuiz?: boolean }) {
  const [data, setData] = useState<Quiz | CourseBuilderNodeQuiz>(
    initialData || (isCourseBuilderNodeQuiz ? DEFAULT_NODE_QUIZ(0) : DEFAULT_QUIZ(0))
  )

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileQuestion className="h-5 w-5 text-red-500" />
              {isCourseBuilderNodeQuiz ? 'Exam Builder (Summative)' : 'Assessment Builder'}
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="edit" className="w-full">
            <TabsList className="bg-muted mb-4 grid w-full grid-cols-2 gap-1 rounded-xl border p-1">
              <TabsTrigger
                value="edit"
                className="rounded-lg border border-gray-400 bg-white transition-all duration-200 data-[state=active]:bg-gray-200 data-[state=active]:text-gray-900"
              >
                Edit
              </TabsTrigger>
              <TabsTrigger
                value="preview"
                className="rounded-lg border border-gray-400 bg-white transition-all duration-200 data-[state=active]:bg-gray-200 data-[state=active]:text-gray-900"
              >
                Preview (student view)
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="edit"
              className="border-border bg-card/95 mt-4 space-y-4 rounded-2xl border p-6 py-4 shadow-xl backdrop-blur-md"
            >
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{isCourseBuilderNodeQuiz ? 'Exam Title *' : 'Assessment Title *'}</Label>
                  <Input
                    value={data.title}
                    onChange={(e: any) => setData({ ...data, title: e.target.value })}
                    placeholder={
                      isCourseBuilderNodeQuiz
                        ? 'e.g., Lesson 1 Comprehensive Exam'
                        : 'e.g., Lesson 1 Assessment'
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Instructions</Label>
                  <AutoTextarea
                    value={data.description}
                    onChange={(e: any) => setData({ ...data, description: e.target.value })}
                    placeholder="What should students know before starting this exam?"
                    rows={2}
                  />
                </div>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={data.showCorrectAnswers}
                      onCheckedChange={checked => setData({ ...data, showCorrectAnswers: checked })}
                      disabled={data.answersNeverVisible}
                    />
                    <Label className="text-sm">Show correct answers</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={data.randomizeQuestions}
                      onCheckedChange={checked => setData({ ...data, randomizeQuestions: checked })}
                    />
                    <Label className="text-sm">Randomize questions</Label>
                  </div>
                  <div className="flex items-center gap-2 border-l border-amber-400 pl-4">
                    <Switch
                      checked={data.answersNeverVisible}
                      onCheckedChange={checked =>
                        setData({
                          ...data,
                          answersNeverVisible: checked,
                          showCorrectAnswers: checked ? false : data.showCorrectAnswers,
                        })
                      }
                    />
                    <Label className="flex items-center gap-1 text-sm font-medium text-amber-700">
                      <Shield className="h-3 w-3" />
                      Never show answers to students
                    </Label>
                  </div>
                </div>

                {isCourseBuilderNodeQuiz && (
                  <div className="space-y-2 rounded-lg border bg-blue-50 p-4">
                    <Label>Coverage</Label>
                    <Select
                      value={(data as CourseBuilderNodeQuiz).coverage}
                      onValueChange={v =>
                        setData({ ...data, coverage: v as 'all_lessons' | 'selected_lessons' })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all_lessons">All lessons in module</SelectItem>
                        <SelectItem value="selected_lessons">Selected lessons only</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-muted-foreground text-xs">
                      This is a summative assessment covering knowledge from the entire module
                    </p>
                  </div>
                )}

                <ResourceImportPanel data={data} setData={setData} targetField="description" />

                {/* Questions Section */}
                <div className="space-y-4">
                  <QuestionEditor
                    questions={data.questions}
                    onChange={next => setData({ ...data, questions: next })}
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent
              value="preview"
              className="mt-4 space-y-4 rounded-2xl bg-white/95 p-6 py-4 shadow-2xl backdrop-blur-md"
            >
              <div className="bg-muted/30 space-y-3 rounded-lg border p-4">
                <h3 className="font-semibold">{data.title}</h3>
                {data.description && (
                  <p className="text-muted-foreground text-sm">{data.description}</p>
                )}
                {data.sourceDocument && (
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs font-medium">Uploaded document</p>
                    {data.sourceDocument.mimeType === 'application/pdf' ? (
                      <div className="overflow-hidden rounded border">
                        <iframe
                          src={
                            data.sourceDocument.fileUrl.includes('#')
                              ? `${data.sourceDocument.fileUrl}&toolbar=0&navpanes=0`
                              : `${data.sourceDocument.fileUrl}#toolbar=0&navpanes=0`
                          }
                          title={data.sourceDocument.fileName}
                          className="h-64 w-full"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded border bg-white p-3">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <a
                          href={data.sourceDocument.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 underline"
                        >
                          Open {data.sourceDocument.fileName}
                        </a>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-muted-foreground text-xs">
                  {data.timeLimit != null ? `${data.timeLimit} min limit · ` : ''}
                  {(data as Quiz).attemptsAllowed} attempt(s) · {data.questions.length} questions
                </p>
                <h4 className="mt-4 text-sm font-medium">Questions</h4>
                <QuestionsPreview questions={data.questions ?? []} />
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onSave({ ...data })} disabled={data.questions.length === 0}>
              Save ({data.questions.length} questions)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
