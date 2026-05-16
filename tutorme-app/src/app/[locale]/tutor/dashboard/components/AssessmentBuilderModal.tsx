'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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
import {
  ListTodo,
  Home,
  FileQuestion,
  Plus,
  X,
  Shield,
  Unlock,
  Lock,
  BookOpen,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Task, Assessment, QuizQuestion } from './builder-types'
import { DEFAULT_TASK, DEFAULT_HOMEWORK } from './builder-utils'
import { ResourceImportPanel, QuestionsPreview } from './builder-components'
import { QuestionEditor } from './QuestionEditor'
import { LessonSelectorDialog } from './LessonSelectorDialog'

interface BuilderModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: any) => void
  initialData?: any
}

export interface BuilderModalWithModulesProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: any, nodeId?: string, lessonId?: string) => void
  initialData?: any
  nodes: any[]
}

export function AssessmentBuilderModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  builderType = 'assessment',
}: BuilderModalProps & { builderType?: 'task' | 'assessment' | 'homework' }) {
  const [data, setData] = useState<Task | Assessment>(
    initialData ||
      (builderType === 'task'
        ? DEFAULT_TASK(0)
        : DEFAULT_HOMEWORK(0, builderType === 'homework' ? 'homework' : 'assessment'))
  )
  const [showAnswerKey, setShowAnswerKey] = useState(false)
  const isTask = builderType === 'task'
  const isHomework = builderType === 'homework'
  const titleLabel = isTask ? 'Task' : isHomework ? 'Homework' : 'Assessment'
  const assessmentData = data as Assessment

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isTask ? (
                <ListTodo className="h-5 w-5 text-orange-500" />
              ) : isHomework ? (
                <Home className="h-5 w-5 text-purple-500" />
              ) : (
                <FileQuestion className="h-5 w-5 text-purple-500" />
              )}
              {titleLabel} Builder
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
                  <Label>{titleLabel} Title *</Label>
                  <Input
                    value={data.title}
                    onChange={(e: any) => setData({ ...data, title: e.target.value })}
                    placeholder={`e.g., ${titleLabel} 1`}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Instructions</Label>
                  <AutoTextarea
                    value={data.description}
                    onChange={(e: any) => setData({ ...data, description: e.target.value })}
                    placeholder="What should students know before starting this assessment?"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{isTask ? 'Instructions *' : 'Question *'}</Label>
                  <AutoTextarea
                    value={data.instructions}
                    onChange={(e: any) => setData({ ...data, instructions: e.target.value })}
                    placeholder={
                      isTask ? 'Enter the task instructions here' : 'Enter the question here'
                    }
                    rows={4}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 rounded-xl bg-white/30 p-4 shadow-sm backdrop-blur-sm">
                  <div className="space-y-2">
                    <Label>Submission</Label>
                    {isTask ? (
                      <Select
                        value={data.submissionType as Task['submissionType']}
                        onValueChange={v =>
                          setData({
                            ...(data as Task),
                            submissionType: v as Task['submissionType'],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="file">File</SelectItem>
                          <SelectItem value="link">Link</SelectItem>
                          <SelectItem value="questions">Questions</SelectItem>
                          <SelectItem value="none">None</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={data.submissionType as Assessment['submissionType']}
                        onValueChange={v =>
                          setData({
                            ...(data as Assessment),
                            submissionType: v as Assessment['submissionType'],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="file">File</SelectItem>
                          <SelectItem value="link">Link</SelectItem>
                          <SelectItem value="multiple">Multiple</SelectItem>
                          <SelectItem value="questions">Questions</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {/* Questions Section - Only when submissionType is 'questions' */}
                {data.submissionType === 'questions' && (
                  <div className="space-y-4 rounded-lg border bg-purple-50/30 p-4">
                    <QuestionEditor
                      questions={data.questions || []}
                      onChange={next => setData({ ...data, questions: next })}
                      showMultiselect
                      showManualComposer
                    />
                  </div>
                )}

                {!isTask && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={
                          'allowLateSubmission' in data
                            ? (data as Assessment).allowLateSubmission
                            : false
                        }
                        onCheckedChange={checked =>
                          setData({ ...(data as Assessment), allowLateSubmission: checked })
                        }
                      />
                      <Label>Allow late submission</Label>
                    </div>
                    {'allowLateSubmission' in data && (data as Assessment).allowLateSubmission && (
                      <div className="space-y-2">
                        <Label>Late Penalty (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={(data as Assessment).latePenalty}
                          onChange={(e: any) =>
                            setData({
                              ...(data as Assessment),
                              latePenalty: parseInt(e.target.value) || 0,
                            })
                          }
                        />
                        <p className="text-muted-foreground text-xs">
                          Percentage deducted for late submissions
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Answer Key Section - Protected */}
                <div className="mt-4 border-t pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-amber-500" />
                      <Label className="font-medium text-amber-700">
                        Instructor Answer Key (Protected)
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => setShowAnswerKey(!showAnswerKey)}
                      >
                        {showAnswerKey ? (
                          <Unlock className="h-3 w-3" />
                        ) : (
                          <Lock className="h-3 w-3" />
                        )}
                        {showAnswerKey ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                  </div>
                  {showAnswerKey ? (
                    <div className="space-y-3">
                      <Textarea
                        value={data.answerKey || ''}
                        onChange={(e: any) => setData({ ...data, answerKey: e.target.value })}
                        placeholder="Enter the expected answer/solution here. This is ONLY visible to instructors."
                        rows={4}
                        className="border-amber-400 bg-amber-50/30"
                      />
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={data.answerKeyProtected !== false}
                          onCheckedChange={checked =>
                            setData({ ...data, answerKeyProtected: checked })
                          }
                        />
                        <Label className="text-muted-foreground text-xs">
                          <Lock className="mr-1 inline h-3 w-3" />
                          Protect answer key (never visible to students)
                        </Label>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded border border-dashed border-gray-400 bg-gray-50 p-3 text-center">
                      <Lock className="mx-auto mb-1 h-4 w-4 text-gray-400" />
                      <span className="text-muted-foreground text-xs">
                        Answer key is hidden. Click "Show" to view/edit.
                      </span>
                    </div>
                  )}
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
                {data.instructions && (
                  <div className="text-sm">
                    <span className="text-muted-foreground font-medium">Instructions: </span>
                    {data.instructions}
                  </div>
                )}
                {!isTask && (
                  <div className="space-y-3">
                    <ResourceImportPanel data={data} setData={setData} targetField="instructions" />
                  </div>
                )}
                {!isTask && data.sourceDocument && (
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
                {!isTask && (
                  <div className="space-y-3 rounded-lg border bg-white p-3">
                    <h4 className="text-sm font-medium">Settings</h4>
                    <div className="flex flex-wrap gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={assessmentData.showCorrectAnswers ?? true}
                          onCheckedChange={checked =>
                            setData({ ...assessmentData, showCorrectAnswers: checked })
                          }
                          disabled={assessmentData.answersNeverVisible}
                        />
                        <Label className="text-sm">Show correct answers</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={assessmentData.answersNeverVisible ?? false}
                          onCheckedChange={checked =>
                            setData({
                              ...assessmentData,
                              answersNeverVisible: checked,
                              showCorrectAnswers: checked
                                ? false
                                : assessmentData.showCorrectAnswers,
                            })
                          }
                        />
                        <Label className="text-sm">Never show answers</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={assessmentData.randomizeQuestions}
                          onCheckedChange={checked =>
                            setData({ ...assessmentData, randomizeQuestions: checked })
                          }
                        />
                        <Label className="text-sm">Randomize question order</Label>
                      </div>
                    </div>
                  </div>
                )}
                <h4 className="mt-4 text-sm font-medium">Questions</h4>
                <QuestionsPreview questions={data.questions ?? []} />
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onSave({ ...data })}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function TaskBuilderModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  nodes,
}: BuilderModalWithModulesProps) {
  const [showLessonSelector, setShowLessonSelector] = useState(false)
  const [pendingData, setPendingData] = useState<any>(null)

  const handleSaveRequest = (data: any) => {
    setPendingData(data)
    setShowLessonSelector(true)
  }

  const handleConfirmLesson = (nodeId: string, lessonId: string) => {
    if (pendingData) {
      onSave(pendingData, nodeId, lessonId)
    }
    setPendingData(null)
  }

  return (
    <>
      <AssessmentBuilderModal
        isOpen={isOpen}
        onClose={onClose}
        onSave={handleSaveRequest}
        initialData={initialData}
        builderType="task"
      />
      <LessonSelectorDialog
        isOpen={showLessonSelector}
        onClose={() => setShowLessonSelector(false)}
        onConfirm={handleConfirmLesson}
        nodes={nodes}
        itemType="task"
      />
    </>
  )
}

export function HomeworkBuilderModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  nodes,
}: BuilderModalWithModulesProps) {
  const [showLessonSelector, setShowLessonSelector] = useState(false)
  const [pendingData, setPendingData] = useState<any>(null)

  const handleSaveRequest = (data: any) => {
    setPendingData(data)
    setShowLessonSelector(true)
  }

  const handleConfirmLesson = (nodeId: string, lessonId: string) => {
    if (pendingData) {
      onSave(pendingData, nodeId, lessonId)
    }
    setPendingData(null)
  }

  return (
    <>
      <AssessmentBuilderModal
        isOpen={isOpen}
        onClose={onClose}
        onSave={handleSaveRequest}
        initialData={initialData}
        builderType="homework"
      />
      <LessonSelectorDialog
        isOpen={showLessonSelector}
        onClose={() => setShowLessonSelector(false)}
        onConfirm={handleConfirmLesson}
        nodes={nodes}
        itemType="homework"
      />
    </>
  )
}

export function AssessmentBuilderModalWithSelector({
  isOpen,
  onClose,
  onSave,
  initialData,
  nodes,
}: BuilderModalWithModulesProps) {
  const [showLessonSelector, setShowLessonSelector] = useState(false)
  const [pendingData, setPendingData] = useState<any>(null)

  const handleSaveRequest = (data: any) => {
    setPendingData(data)
    setShowLessonSelector(true)
  }

  const handleConfirmLesson = (nodeId: string, lessonId: string) => {
    if (pendingData) {
      onSave(pendingData, nodeId, lessonId)
    }
    setPendingData(null)
  }

  return (
    <>
      <AssessmentBuilderModal
        isOpen={isOpen}
        onClose={onClose}
        onSave={handleSaveRequest}
        initialData={initialData}
        builderType="assessment"
      />
      <LessonSelectorDialog
        isOpen={showLessonSelector}
        onClose={() => setShowLessonSelector(false)}
        onConfirm={handleConfirmLesson}
        nodes={nodes}
        itemType="assessment"
      />
    </>
  )
}
