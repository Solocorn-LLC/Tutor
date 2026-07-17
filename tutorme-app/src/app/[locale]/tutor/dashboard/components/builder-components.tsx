'use client'

import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import {
  Loader2,
  Upload,
  Trash2,
  Plus,
  GripHorizontal,
  BarChart3,
  Signal,
  SignalHigh,
  SignalLow,
  Layers2,
  GripVertical,
  ChevronRight,
  FileText,
  Copy,
  MoreVertical,
  History,
  Check,
  RotateCcw,
  BookOpen,
  GraduationCap,
  ListTodo,
  FileQuestion,
  MonitorPlay,
  Zap,
  CheckCircle,
  Eye,
  ArrowRight,
  Send,
  Download,
  Share2,
  Clock,
  Shield,
  Layers,
  X,
  PenTool,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { extractTextFromFile } from '@/lib/extract-file-text'

import type {
  ImportedLearningResource,
  QuizQuestion,
  DifficultyLevel,
  DifficultyVariant,
  DifficultyMode,
  Task,
  Assessment,
  Quiz,
  CourseBuilderNodeQuiz,
  Lesson,
  CourseBuilderNode,
  VisibleDocumentPayload,
} from './builder-types'
import { generateId, generateQuestionPaperPDF } from './builder-utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface ResourceImportPanelProps<
  T extends {
    sourceDocument?: ImportedLearningResource
    questions?: QuizQuestion[]
    submissionType?: string
  },
> {
  data: T
  setData: (next: T) => void
  targetField: 'instructions' | 'body' | 'description'
}

export function ResourceImportPanel<
  T extends {
    sourceDocument?: ImportedLearningResource
    questions?: QuizQuestion[]
    submissionType?: string
  },
>({ data, setData, targetField }: ResourceImportPanelProps<T>) {
  const [extracting, setExtracting] = useState(false)
  const [resources, setResources] = useState<
    Array<{ id: string; name: string; url: string; mimeType: string | null }>
  >([])
  const [parseDocuments, setParseDocuments] = useState(false)
  const previousBlobUrlRef = useRef<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('tutor-parse-documents')
      if (raw) {
        setParseDocuments(raw === 'true')
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadResources = async () => {
      try {
        const res = await fetch('/api/tutor/resources', { credentials: 'include' })
        if (!res.ok) return
        const payload = await res.json()
        const items = Array.isArray(payload.resources) ? payload.resources : []
        if (active) setResources(items)
      } catch {
        // Non-fatal.
      }
    }
    loadResources()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const nextUrl = data.sourceDocument?.fileUrl
    const previousUrl = previousBlobUrlRef.current

    if (previousUrl && previousUrl !== nextUrl && previousUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previousUrl)
    }

    previousBlobUrlRef.current =
      typeof nextUrl === 'string' && nextUrl.startsWith('blob:') ? nextUrl : null

    return () => {
      const current = previousBlobUrlRef.current
      if (current && current.startsWith('blob:')) {
        URL.revokeObjectURL(current)
      }
      previousBlobUrlRef.current = null
    }
  }, [data.sourceDocument?.fileUrl])

  const handleImport = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return
    setExtracting(true)
    try {
      let extractedText = ''
      if (parseDocuments) {
        extractedText = await extractTextFromFile(file)
      }
      const formData = new FormData()
      formData.append('file', file)
      const uploadRes = await fetchWithCsrf('/api/uploads/documents', {
        method: 'POST',
        body: formData,
      })
      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}))
        throw new Error(errData.error || `Upload failed (${uploadRes.status})`)
      }
      const uploadData = await uploadRes.json()
      if (typeof uploadData?.url !== 'string' || uploadData.url.length === 0) {
        throw new Error('Upload succeeded but no file URL was returned')
      }
      const sourceDocument: ImportedLearningResource = {
        fileName: file.name,
        mimeType:
          uploadData.isPdf === true ? 'application/pdf' : file.type || 'application/octet-stream',
        fileUrl: uploadData.url,
        fileKey: uploadData.key,
        extractedText: extractedText || '',
        uploadedAt: new Date().toISOString(),
      }
      const oldFileKey = data.sourceDocument?.fileKey
      if (oldFileKey) {
        fetchWithCsrf('/api/uploads/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: [oldFileKey] }),
        }).catch(() => {})
      }
      const currentTarget = (data as Record<string, unknown>)[targetField]
      if (parseDocuments && !String(currentTarget || '').trim() && extractedText) {
        setData({ ...data, sourceDocument, [targetField]: extractedText.slice(0, 4000) } as T)
      } else {
        setData({ ...data, sourceDocument } as T)
      }
      toast.success(
        parseDocuments
          ? 'Document imported. PDF and extracted text are available.'
          : 'Document imported.'
      )
    } catch (err: any) {
      toast.error(err?.message || 'Failed to upload document. Please try again.')
    } finally {
      setExtracting(false)
    }
  }

  const handleRemove = () => {
    const current = data.sourceDocument?.fileUrl
    if (current && current.startsWith('blob:')) {
      URL.revokeObjectURL(current)
    }
    const fileKey = data.sourceDocument?.fileKey
    if (fileKey) {
      fetchWithCsrf('/api/uploads/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: [fileKey] }),
      }).catch(() => {})
    }
    setData({ ...data, sourceDocument: undefined } as T)
  }

  const source = data.sourceDocument
  const isPdf = source?.mimeType === 'application/pdf'

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={extracting} asChild>
          <label className="cursor-pointer" title="Supports .pdf, .docx, .pptx, images">
            {extracting ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Upload className="mr-1 h-3 w-3" />
            )}
            Upload file
            <input
              type="file"
              className="hidden"
              accept=".pdf,.txt,.md,.doc,.docx,.ppt,.pptx,image/*"
              onChange={(e: any) => {
                handleImport(e.target.files)
                e.currentTarget.value = ''
              }}
            />
          </label>
        </Button>
        <Button type="button" variant="outline" size="sm" asChild>
          <a href="/tutor/resources" target="_blank" rel="noreferrer">
            Open Resources
          </a>
        </Button>
      </div>
      {source && (
        <div className="bg-muted/20 space-y-3 rounded border p-3">
          <div className="flex items-center justify-between">
            <div className="text-muted-foreground text-xs">
              Imported: <span className="text-foreground font-medium">{source.fileName}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-red-600"
              onClick={handleRemove}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Remove
            </Button>
          </div>

          {/* PDF / Image / File preview */}
          {isPdf && (
            <div className="overflow-hidden rounded border">
              <iframe
                src={
                  source.fileUrl.includes('#')
                    ? `${source.fileUrl}&toolbar=0&navpanes=0`
                    : `${source.fileUrl}#toolbar=0&navpanes=0`
                }
                title={source.fileName}
                className="h-64 w-full"
              />
            </div>
          )}
          {!isPdf && source.mimeType.startsWith('image/') && (
            <div className="overflow-hidden rounded border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={source.fileUrl}
                alt={source.fileName}
                className="h-64 w-full object-contain"
              />
            </div>
          )}
          {!isPdf && !source.mimeType.startsWith('image/') && (
            <div className="flex items-center gap-2 rounded border bg-white p-3">
              <FileText className="h-5 w-5 text-blue-600" />
              <a
                href={source.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 underline"
              >
                Open {source.fileName}
              </a>
            </div>
          )}

          {/* Extracted text (editable) — only show if text exists or parsing is enabled */}
          {(parseDocuments || (source.extractedText || '').length > 0) && (
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium">Extracted text (editable)</p>
              <Textarea
                value={source.extractedText || ''}
                onChange={(e: any) =>
                  setData({
                    ...data,
                    sourceDocument: {
                      ...source,
                      extractedText: e.target.value,
                    },
                  } as T)
                }
                rows={6}
                placeholder="Imported content text (editable)"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export type PreviewUpdatePayload = Partial<Task> | Partial<Assessment>

export interface PreviewCardProps {
  type: 'task' | 'homework' | 'nodeQuiz' | 'lesson' | 'node'
  item: Task | Assessment | Quiz | Lesson | CourseBuilderNode
  onEdit: () => void
  onDuplicate: () => void
  onRemove: () => void
  onUpdateItem?: (updates: PreviewUpdatePayload) => void
  courseId?: string
  lessonId?: string
  showLiveShareAction?: boolean
  onMakeVisibleToStudents?: (payload: VisibleDocumentPayload) => void
  onSaveAll?: () => void
}

export function PreviewCard({
  type,
  item,
  onEdit,
  onDuplicate,
  onRemove,
  onUpdateItem,
  courseId,
  lessonId,
  showLiveShareAction,
  onMakeVisibleToStudents,
  onSaveAll,
}: PreviewCardProps) {
  const [studentPreviewOpen, setStudentPreviewOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [resourceText, setResourceText] = useState('')
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [generatedPdf, setGeneratedPdf] = useState<{
    url: string
    fileName: string
    blob: Blob
  } | null>(null)
  const [showPreviewAnswerKey, setShowPreviewAnswerKey] = useState(false)
  const [isAssigned, setIsAssigned] = useState(false)
  const normalizedItem = item as (
    | Task
    | Assessment
    | Quiz
    | CourseBuilderNodeQuiz
    | Lesson
    | CourseBuilderNode
  ) & {
    description?: string
    instructions?: string
    points?: number
    estimatedMinutes?: number
    questions?: QuizQuestion[]
    isPublished?: boolean
    submissionType?: string
    timeLimit?: number
    attemptsAllowed?: number
    sourceDocument?: ImportedLearningResource
  }

  const handleDownloadPdf = async () => {
    const result = await generateQuestionPaperPDF(
      normalizedItem.title,
      normalizedItem.description || normalizedItem.instructions || '',
      normalizedItem.questions || []
    )
    setGeneratedPdf(result)
    setPdfPreviewOpen(true)
  }

  const togglePublish = async () => {
    if (!onUpdateItem) return
    setPublishing(true)
    try {
      await onUpdateItem({ isPublished: !normalizedItem.isPublished })
      toast.success(
        normalizedItem.isPublished ? 'Unpublished successfully' : 'Published successfully'
      )
    } finally {
      setPublishing(false)
    }
  }

  const handleLiveShare = () => {
    if (!onMakeVisibleToStudents) return
    const payload: VisibleDocumentPayload = {
      id: normalizedItem.id,
      title: normalizedItem.title,
      type: type as any,
      itemType: type as any,
      content: normalizedItem.description || normalizedItem.instructions || '',
      questions: normalizedItem.questions,
      sourceDocument: normalizedItem.sourceDocument,
    }
    onMakeVisibleToStudents(payload)
    toast.success(`Shared "${normalizedItem.title}" with students`)
  }

  const getIcon = () => {
    switch (type) {
      case 'node':
        return <Layers className="h-4 w-4 text-blue-500" />
      case 'lesson':
        return <BookOpen className="h-4 w-4 text-indigo-500" />
      case 'task':
        return <ListTodo className="h-4 w-4 text-orange-500" />
      case 'homework':
        return <GraduationCap className="h-4 w-4 text-emerald-500" />
      case 'nodeQuiz':
        return <FileQuestion className="h-4 w-4 text-red-500" />
      default:
        return <FileText className="h-4 w-4 text-slate-600" />
    }
  }

  return (
    <div className="group relative flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-1 rounded-lg border bg-slate-50 p-2">{getIcon()}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="truncate font-semibold text-slate-900">{normalizedItem.title}</h4>
              {normalizedItem.isPublished && (
                <Badge
                  variant="secondary"
                  className="h-5 bg-emerald-50 text-[10px] text-emerald-700"
                >
                  Live
                </Badge>
              )}
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
              {normalizedItem.description ||
                normalizedItem.instructions ||
                'No description provided'}
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onEdit}>
              <PenTool className="mr-2 h-4 w-4" /> Edit Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="mr-2 h-4 w-4" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {type !== 'lesson' && (
              <>
                <DropdownMenuItem onClick={() => setStudentPreviewOpen(true)}>
                  <Eye className="mr-2 h-4 w-4" /> Student Preview
                </DropdownMenuItem>
                {normalizedItem.questions && normalizedItem.questions.length > 0 && (
                  <DropdownMenuItem onClick={handleDownloadPdf}>
                    <Download className="mr-2 h-4 w-4" /> Export as PDF
                  </DropdownMenuItem>
                )}
                {showLiveShareAction && (
                  <DropdownMenuItem onClick={handleLiveShare}>
                    <Send className="mr-2 h-4 w-4" /> Share to Class
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              onClick={togglePublish}
              disabled={publishing}
              className={normalizedItem.isPublished ? 'text-amber-600' : 'text-emerald-600'}
            >
              {normalizedItem.isPublished ? (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" /> Unpublish
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" /> Publish to Students
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRemove} className="text-red-600 focus:text-red-600">
              <Trash2 className="mr-2 h-4 w-4" /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-3">
        <div className="flex items-center gap-3">
          {normalizedItem.points !== undefined && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                    {normalizedItem.points} pts
                  </div>
                </TooltipTrigger>
                <TooltipContent>Total Points</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {normalizedItem.estimatedMinutes !== undefined && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                    <Clock className="h-3 w-3 text-slate-600" />
                    {normalizedItem.estimatedMinutes}m
                  </div>
                </TooltipTrigger>
                <TooltipContent>Estimated Time</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {normalizedItem.questions && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal text-slate-500">
              {normalizedItem.questions.length} Qs
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-indigo-600"
            onClick={onEdit}
          >
            Configure <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </div>

      {studentPreviewOpen && normalizedItem.questions && (
        <StudentPreviewModal
          questions={normalizedItem.questions}
          onClose={() => setStudentPreviewOpen(false)}
        />
      )}

      <Dialog open={pdfPreviewOpen} onOpenChange={setPdfPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>PDF Export Preview</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="aspect-[1/1.414] w-full overflow-hidden rounded-lg border bg-slate-100 shadow-inner">
              {generatedPdf && (
                <iframe src={generatedPdf.url} className="h-full w-full" title="PDF Preview" />
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPdfPreviewOpen(false)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  if (generatedPdf) {
                    const link = document.createElement('a')
                    link.href = generatedPdf.url
                    link.download = generatedPdf.fileName
                    link.click()
                  }
                }}
              >
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Student-like question preview (one at a time) */
export function StudentPreviewModal({
  questions,
  onClose,
}: {
  questions: QuizQuestion[]
  onClose: () => void
}) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [showResults, setShowResults] = useState(false)
  const q = questions[currentIdx]

  if (!questions.length) return null

  if (showResults) {
    const correct = questions.filter(qq => {
      const a = answers[qq.id]?.toLowerCase()
      const ca = Array.isArray(qq.correctAnswer)
        ? qq.correctAnswer[0]?.toLowerCase()
        : typeof qq.correctAnswer === 'string'
          ? qq.correctAnswer.toLowerCase()
          : ''
      return a && ca && a === ca
    }).length
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
          <h3 className="mb-4 text-xl font-bold">Preview Results</h3>
          <p className="mb-2 text-center text-3xl font-bold">
            {correct}/{questions.length}
          </p>
          <p className="text-muted-foreground mb-6 text-center">
            This is how a student would see their results
          </p>
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {questions.map((qq, i) => {
              const a = answers[qq.id]?.toLowerCase()
              const ca = Array.isArray(qq.correctAnswer)
                ? qq.correctAnswer[0]?.toLowerCase()
                : typeof qq.correctAnswer === 'string'
                  ? qq.correctAnswer.toLowerCase()
                  : ''
              const isCorrect = !!(a && ca && a === ca)
              return (
                <div
                  key={qq.id}
                  className={`rounded-lg border p-3 text-sm ${isCorrect ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}
                >
                  <span className="font-medium">Q{i + 1}:</span> {qq.question.slice(0, 80)}
                  <span
                    className={`ml-2 font-bold ${isCorrect ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {isCorrect ? '\u2713' : '\u2717'}
                  </span>
                </div>
              )
            })}
          </div>
          <Button onClick={onClose} className="mt-4 w-full">
            Close Preview
          </Button>
        </div>
      </div>
    )
  }

  const isLast = currentIdx === questions.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <Badge variant="outline">
            Question {currentIdx + 1} of {questions.length}
          </Badge>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mb-6 space-y-4">
          <h3 className="text-lg font-medium">{q.question}</h3>
          {q.type === 'mcq' && q.options && (
            <div className="space-y-2">
              {q.options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors',
                    answers[q.id] === opt
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  )}
                >
                  {String.fromCharCode(65 + idx)}. {opt}
                </button>
              ))}
            </div>
          )}
          {q.type === 'truefalse' && (
            <div className="flex gap-4">
              {['True', 'False'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                  className={cn(
                    'flex-1 rounded-lg border p-3 transition-colors',
                    answers[q.id] === opt
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
          {(q.type === 'shortanswer' || q.type === 'essay' || q.type === 'fillblank') && (
            <Textarea
              value={answers[q.id] || ''}
              onChange={(e: any) => setAnswers({ ...answers, [q.id]: e.target.value })}
              placeholder="Type your answer here..."
              rows={q.type === 'essay' ? 4 : 1}
            />
          )}
        </div>

        <div className="flex justify-between border-t pt-4">
          <Button
            variant="outline"
            disabled={currentIdx === 0}
            onClick={() => setCurrentIdx(currentIdx - 1)}
          >
            Previous
          </Button>
          {isLast ? (
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => setShowResults(true)}
            >
              Finish Preview
            </Button>
          ) : (
            <Button onClick={() => setCurrentIdx(currentIdx + 1)}>Next</Button>
          )}
        </div>
      </div>
    </div>
  )
}

export interface TreeItemProps {
  children: React.ReactNode
  depth: number
  isLast?: boolean
  className?: string
}

export function TreeItem({ children, depth, isLast, className }: TreeItemProps) {
  const indent = depth * 20
  return (
    <div
      className={cn('relative w-full min-w-0', className)}
      style={{ marginLeft: indent, width: `calc(100% - ${indent}px)` }}
    >
      {children}
    </div>
  )
}

export function DroppableHomeworkZone({
  nodeId,
  lessonId,
  children,
  className,
}: {
  nodeId: string
  lessonId: string
  children: React.ReactNode
  className?: string
}) {
  const id = `drop-hw-${nodeId}::${lessonId}`
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && 'bg-emerald-100 ring-1 ring-emerald-400')}
    >
      {children}
    </div>
  )
}

export function DroppableTaskZone({
  nodeId,
  lessonId,
  children,
  className,
}: {
  nodeId: string
  lessonId: string
  children: React.ReactNode
  className?: string
}) {
  const id = `drop-task-${nodeId}::${lessonId}`
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && 'bg-orange-100 ring-1 ring-orange-400')}
    >
      {children}
    </div>
  )
}

export function DroppableAssessmentZone({
  nodeId,
  lessonId,
  children,
  className,
}: {
  nodeId: string
  lessonId: string
  children: React.ReactNode
  className?: string
}) {
  const id = `drop-assessment-${nodeId}::${lessonId}`
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && 'bg-purple-100 ring-1 ring-purple-400')}
    >
      {children}
    </div>
  )
}

export interface ResizablePanelProps {
  children: React.ReactNode
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  actionButton?: React.ReactNode
}

export function ResizablePanel({
  children,
  defaultWidth = 192,
  minWidth = 150,
  maxWidth = 400,
  actionButton,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeDirection, setResizeDirection] = useState<'left' | 'right' | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return
      const deltaX = e.clientX - startXRef.current
      const newWidth =
        resizeDirection === 'left' ? startWidthRef.current - deltaX : startWidthRef.current + deltaX
      setWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      setResizeDirection(null)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, minWidth, maxWidth, resizeDirection])

  const handleResizeStart = (direction: 'left' | 'right') => (e: React.MouseEvent) => {
    setResizeDirection(direction)
    setIsResizing(true)
    startXRef.current = e.clientX
    startWidthRef.current = panelRef.current?.offsetWidth || defaultWidth
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={panelRef}
        className="relative flex-shrink-0 border-l pl-4"
        style={{ width: `${width}px` }}
      >
        {children}
        {/* Left resize handle */}
        <div
          className={cn(
            'group absolute bottom-0 left-0 top-0 z-10 flex w-1 cursor-col-resize items-center justify-center transition-all hover:w-2 hover:bg-blue-400/30',
            isResizing && resizeDirection === 'left' && 'w-2 bg-blue-500/40'
          )}
          onMouseDown={handleResizeStart('left')}
          title="Drag left to shrink, right to expand"
        >
          <div className="h-8 w-1 rounded-full bg-slate-300 group-hover:bg-slate-400" />
        </div>
      </div>
      {/* Action button directly under the panel */}
      {actionButton && (
        <div style={{ width: `${width}px` }} className="pl-4">
          {actionButton}
        </div>
      )}
    </div>
  )
}

export interface DifficultyBadgeProps {
  mode: DifficultyMode
  fixedDifficulty?: DifficultyLevel
  showLabel?: boolean
  size?: 'sm' | 'xs'
}

export function DifficultyBadge({
  mode,
  fixedDifficulty,
  showLabel = true,
  size = 'xs',
}: DifficultyBadgeProps) {
  if (mode === 'all') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-gray-400 bg-gray-100 text-gray-700',
          size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
        )}
      >
        <Layers2 className={cn(size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
        {showLabel && 'All Levels'}
      </span>
    )
  }

  if (mode === 'fixed' && fixedDifficulty) {
    const colors = {
      beginner: 'bg-green-100 text-green-700 border-green-400',
      intermediate: 'bg-blue-100 text-blue-700 border-blue-400',
      advanced: 'bg-purple-100 text-purple-700 border-purple-400',
    }
    const icons = {
      beginner: SignalLow,
      intermediate: Signal,
      advanced: SignalHigh,
    }
    const Icon = icons[fixedDifficulty]

    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border',
          colors[fixedDifficulty],
          size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
        )}
        title={`Fixed: ${fixedDifficulty}`}
      >
        <Icon className={cn(size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
        {showLabel && (
          <>
            <span className="opacity-70">🎯</span>
            <span className="capitalize">{fixedDifficulty}</span>
          </>
        )}
      </span>
    )
  }

  // Adaptive mode
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-100 text-amber-700',
        size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
      )}
      title="Adaptive - adjusts to group difficulty"
    >
      <BarChart3 className={cn(size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      {showLabel && <span className="opacity-70">🔄</span>}
      {showLabel && 'Adaptive'}
    </span>
  )
}

// Context to expose sortable drag-handle props inside child renderers
const SortableItemContext = createContext<{
  attributes?: Record<string, any>
  listeners?: Record<string, any>
  onDragStart?: () => void
}>({})

export function DragHandle({ className }: { className?: string }) {
  const ctx = useContext(SortableItemContext)
  return (
    <div
      {...ctx.attributes}
      {...ctx.listeners}
      onMouseDown={ctx.onDragStart}
      className={cn(
        'cursor-grab p-1 text-gray-600 hover:text-gray-600 active:cursor-grabbing',
        className
      )}
    >
      <GripVertical className="h-4 w-4" />
    </div>
  )
}

export interface SortableTreeItemProps extends TreeItemProps {
  id: string
  dragHandle?: boolean
  inlineDragHandle?: boolean
  onDragStart?: () => void
}

export function SortableTreeItem({
  id,
  children,
  depth,
  isLast,
  className,
  dragHandle = true,
  inlineDragHandle = false,
  onDragStart,
}: SortableTreeItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <SortableItemContext.Provider value={{ attributes, listeners, onDragStart }}>
      <div ref={setNodeRef} style={style} className={cn('group relative', className)}>
        <TreeItem depth={depth} isLast={isLast}>
          <div className="flex items-center gap-2">
            {dragHandle && !inlineDragHandle && (
              <div
                {...attributes}
                {...listeners}
                onMouseDown={onDragStart}
                className="cursor-grab p-1 text-gray-600 hover:text-gray-600 active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" />
              </div>
            )}
            <div className="flex-1">{children}</div>
            {inlineDragHandle && (
              <div
                {...attributes}
                {...listeners}
                onMouseDown={onDragStart}
                className="cursor-grab p-1 text-gray-600 hover:text-gray-600 active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" />
              </div>
            )}
          </div>
        </TreeItem>
      </div>
    </SortableItemContext.Provider>
  )
}

export function formatMatchingExplanation(pairs: Array<{ left: string; right: string }>) {
  if (pairs.length === 0) return ''
  return ['Column A | Column B', ...pairs.map(pair => `${pair.left} | ${pair.right}`)].join('\n')
}

export function MatchingPairsEditor({
  pairs,
  onChange,
}: {
  pairs: Array<{ left: string; right: string }>
  onChange: (next: Array<{ left: string; right: string }>) => void
}) {
  const updatePair = (index: number, field: 'left' | 'right', value: string) => {
    const next = pairs.map((pair, idx) => (idx === index ? { ...pair, [field]: value } : pair))
    onChange(next)
  }

  const addPair = () => onChange([...pairs, { left: '', right: '' }])
  const removePair = (index: number) => onChange(pairs.filter((_, idx) => idx !== index))

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground grid grid-cols-2 gap-3 text-xs font-medium">
        <span>Column A</span>
        <span>Column B</span>
      </div>
      <div className="space-y-2">
        {pairs.map((pair, idx) => (
          <div
            key={`pair-${idx}`}
            className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2"
          >
            <Input
              value={pair.left}
              onChange={(e: any) => updatePair(idx, 'left', e.target.value)}
              placeholder={`Left ${idx + 1}`}
            />
            <div className="text-muted-foreground text-xs">↔</div>
            <Input
              value={pair.right}
              onChange={(e: any) => updatePair(idx, 'right', e.target.value)}
              placeholder={`Right ${idx + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => removePair(idx)}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addPair}>
        <Plus className="mr-1 h-3 w-3" /> Add pair
      </Button>
      <div className="text-muted-foreground text-xs">
        Use the arrow as a visual cue for linking pairs. Students will match Column A to Column B.
      </div>
    </div>
  )
}

export function ManualQuestionComposer({
  onImport,
}: {
  onImport: (questions: QuizQuestion[]) => void
}) {
  const [questionText, setQuestionText] = useState('')
  const handleAdd = async () => {
    const trimmed = questionText.trim()
    if (!trimmed) return

    const question: QuizQuestion = {
      id: `q-${generateId()}`,
      type: 'shortanswer',
      question: trimmed,
      points: 1,
      explanation: '',
    }
    onImport([question])
    setQuestionText('')
    toast.success('Question added')
  }

  return (
    <div className="bg-muted/20 space-y-2 rounded border p-2.5">
      <Label className="text-xs font-medium">Write a new question</Label>
      <Textarea
        value={questionText}
        onChange={(e: any) => setQuestionText(e.target.value)}
        placeholder="Type a question here to add it directly and save to question bank."
        rows={2}
      />
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!questionText.trim()}
          onClick={handleAdd}
        >
          Add Question
        </Button>
      </div>
    </div>
  )
}

export function QuestionsPreview({ questions }: { questions: QuizQuestion[] }) {
  if (!questions?.length) return <p className="text-muted-foreground text-sm">No questions yet.</p>
  return (
    <div className="mt-2 space-y-3">
      {questions.map((q, idx) => (
        <div key={q.id} className="bg-muted/30 space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-xs">
              Q{idx + 1} · {q.type.toUpperCase()}
            </Badge>
            <span className="text-muted-foreground text-xs">{q.points} pts</span>
          </div>
          <p className="text-sm font-medium">{q.question || '(No question text)'}</p>
          {q.type === 'mcq' && q.options?.length && (
            <ul className="text-muted-foreground list-inside list-disc text-sm">
              {q.options.map((opt, i) => (
                <li key={i}>{opt || `Option ${i + 1}`}</li>
              ))}
            </ul>
          )}
          {q.type === 'truefalse' && (
            <p className="text-muted-foreground text-sm">Options: True / False</p>
          )}
          {q.explanation && (
            <p className="text-muted-foreground mt-2 border-t pt-2 text-xs">
              Explanation: {q.explanation}
            </p>
          )}
          <p className="text-xs text-amber-600">Answer key hidden (instructor only)</p>
        </div>
      ))}
    </div>
  )
}
