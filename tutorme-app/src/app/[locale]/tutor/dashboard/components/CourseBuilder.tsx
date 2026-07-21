'use client'

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
  type ComponentProps,
  Fragment,
} from 'react'

/**
 * Recursively sanitize lesson data by removing blob URLs from sourceDocument.fileUrl.
 * Blob URLs are client-side only and become invalid after page refresh.
 * Returns the sanitized data and a list of paths where blob URLs were removed.
 */
function sanitizeBlobUrls(obj: unknown, path = ''): { sanitized: unknown; removedPaths: string[] } {
  const removedPaths: string[] = []

  if (typeof obj === 'string') {
    if (obj.startsWith('blob:')) {
      removedPaths.push(path || '<root>')
      return { sanitized: '', removedPaths }
    }
    return { sanitized: obj, removedPaths }
  }

  if (Array.isArray(obj)) {
    const sanitized: unknown[] = []
    obj.forEach((item, idx) => {
      const result = sanitizeBlobUrls(item, `${path}[${idx}]`)
      sanitized.push(result.sanitized)
      removedPaths.push(...result.removedPaths)
    })
    return { sanitized, removedPaths }
  }

  if (obj !== null && typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      const newPath = path ? `${path}.${key}` : key
      // Preserve sourceDocument metadata, only clear the blob fileUrl
      if (key === 'sourceDocument' && value !== null && typeof value === 'object') {
        const doc = value as Record<string, unknown>
        const hasBlobUrl = typeof doc.fileUrl === 'string' && doc.fileUrl.startsWith('blob:')
        if (hasBlobUrl) {
          removedPaths.push(`${newPath}.fileUrl`)
          const cleanedDoc = { ...doc, fileUrl: '' }
          const result = sanitizeBlobUrls(cleanedDoc, newPath)
          sanitized[key] = result.sanitized
          removedPaths.push(...result.removedPaths)
          continue
        }
      }
      const result = sanitizeBlobUrls(value, newPath)
      sanitized[key] = result.sanitized
      removedPaths.push(...result.removedPaths)
    }
    return { sanitized, removedPaths }
  }

  return { sanitized: obj, removedPaths }
}

// Editable Likert scale item component
function EditableLikertItem({
  index,
  label,
  onChange,
  onDelete,
  canDelete,
}: {
  index: number
  label: string
  onChange: (index: number, value: string) => void
  onDelete: (index: number) => void
  canDelete: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(label)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSave = () => {
    if (editValue.trim()) {
      onChange(index, editValue.trim())
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setEditValue(label)
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <div className="flex h-8 items-center gap-2 rounded-md border border-blue-300 bg-white px-2">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-xs text-blue-700 outline-none"
        />
      </div>
    )
  }

  return (
    <div className="group flex h-8 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3">
      <button
        type="button"
        onClick={() => {
          setEditValue(label)
          setIsEditing(true)
        }}
        className="flex-1 text-center text-xs font-medium text-blue-700"
      >
        {label}
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete(index)}
          className="flex h-5 w-5 items-center justify-center rounded text-blue-400 opacity-0 transition-opacity hover:bg-blue-100 hover:text-blue-600 group-hover:opacity-100"
          aria-label={`Delete ${label}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

import NextImage from 'next/image'
import { useSession } from 'next-auth/react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
  DropAnimation,
  useDroppable,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DMI_QUESTION_TYPES,
  DMI_QUESTION_TYPE_LABELS,
  type DmiQuestionType,
} from '@/lib/assessment/question-types'
import { deriveExamContext } from '@/lib/assessment/marking-scheme'
import { getAllCourseCategoryOptions } from '@/lib/data/all-categories'
import { deriveSections, deriveTotalMarks } from '@/lib/assessment/sections'
import { reverifyAssessment, type ReverifyItem } from '@/lib/assessment/assessment-gates'
import { toStudentDmiItem } from '@/lib/assessment/student-dmi'
import { buildStudentDeployPayload, type RawDeployDmiItem } from '@/lib/assessment/deploy-safety'
import { revealPolicyToDeployMode } from '@/lib/assessment/reveal-policy'
import { dmiOptionLetter, dmiSelectedOptionLetters } from '@/lib/assessment/mcq-answer'
import { nextDmiGate } from '@/lib/assessment/dmi-generate-gate'
import { resolveDocPaneVisibility } from '@/lib/courses/doc-pane-visibility'
import {
  shouldRehydrateBuilder,
  mergeLoadedWithPendingEdits,
} from '@/lib/courses/course-builder-guards'
import { resolvePciComposition, inferDocumentKindFromProvenance } from '@/lib/ai/guardrails'
import { useMarkingScheme } from './hooks/use-marking-scheme'
import { useDmiEditor } from './hooks/use-dmi-editor'
import { usePci } from './hooks/use-pci'
import { getThread, type PciTarget } from './hooks/pci-reducer'
import { parsePciTranscript, type PciMessage } from '@/lib/assessment/pci'
import { PCI_SPEC_FIELDS } from '@/lib/assessment/pci-spec'
import { PciQuestionnaire } from './PciQuestionnaire'
import { PciSpecSoFar } from './PciSpecSoFar'
import { TestTaskChat, type TestTaskChatState, type TestTaskChatMsg } from './TestTaskChat'
import { splitDocIntoSections } from '@/lib/documents/split-sections'
import { assessmentDmiReadiness } from '@/lib/assessment/dmi-readiness'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SlidingPillTabsList } from '@/components/sliding-pill-tabs'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { PanelErrorBoundary } from '@/components/ui/panel-error-boundary'
import { PDFViewer } from '@/components/pdf/PDFViewer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { scrollElementIntoView } from '@/lib/scroll-into-view'
import { extractTextFromFile } from '@/lib/extract-file-text'
import { toast } from 'sonner'
import { useVideoOverlayStore } from '@/stores/video-overlay-store'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import type { LiveTask } from '@/lib/socket'
import type { LiveStudent, EngagementMetrics } from '@/types/live-session'
import type {
  Video,
  Image,
  Document,
  ImportedLearningResource,
  VisibleDocumentPayload,
  DMIQuestion,
  DMIVersion,
  Task,
  Assessment,
  QuizQuestion,
  Quiz,
  Content,
  DifficultyLevel,
  DifficultyMode,
  DifficultyVariant,
  WithDifficultyVariants,
  Worksheet,
  Lesson,
  CourseBuilderNodeQuiz,
  CourseBuilderNode,
  InsightsSessionOption,
  CourseBuilderInsightsProps,
  CourseBuilderProps,
  CourseBuilderRef,
} from './builder-types'

export type {
  Video,
  Image,
  Document,
  ImportedLearningResource,
  VisibleDocumentPayload,
  DMIQuestion,
  Task,
  Assessment,
  QuizQuestion,
  Quiz,
  Content,
  DifficultyLevel,
  DifficultyMode,
  DifficultyVariant,
  WithDifficultyVariants,
  Worksheet,
  Lesson,
  CourseBuilderNodeQuiz,
  CourseBuilderNode,
  InsightsSessionOption,
  CourseBuilderInsightsProps,
  CourseBuilderProps,
  CourseBuilderRef,
} from './builder-types'

import { AiAssistantPanel } from './AiAssistantPanel'
import { AITeachingAssistant } from '@/components/tutor/AITeachingAssistant'
import { MentionTextarea } from '@/components/class/mention-textarea'
import type { MentionItem } from '@/components/class/mention-textarea'
import {
  MatchingPairsEditor,
  ManualQuestionComposer,
  QuestionsPreview,
  TreeItem,
  DroppableHomeworkZone,
  DroppableTaskZone,
  DroppableAssessmentZone,
  DifficultyBadge,
  SortableTreeItem,
  DragHandle,
  StudentPreviewModal,
  PreviewCard,
} from './builder-components'
import { LessonSelectorDialog, NEW_LESSON_VALUE } from './LessonSelectorDialog'
import {
  AssessmentBuilderModal,
  TaskBuilderModal,
  HomeworkBuilderModal,
  AssessmentBuilderModalWithSelector,
} from './AssessmentBuilderModal'
import { QuizBuilderModal } from './QuizBuilderModal'
import { ContentBuilderModal } from './ContentBuilderModal'
import { AIAssistAgent } from './AIAssistAgent'
import { NodeBuilderModal } from './NodeBuilderModal'
import { LessonBuilderModal } from './LessonBuilderModal'
import {
  generateId as utilsGenerateId,
  DEFAULT_CONTENT,
  DEFAULT_TASK,
  DEFAULT_HOMEWORK,
  DEFAULT_LESSON,
  DEFAULT_QUIZ,
  DEFAULT_NODE_QUIZ,
  DEFAULT_NODE,
  convertQuizToAssessment,
  normalizeCourseBuilderNodesForAssessments,
  normalizeGeneratedQuestionType,
  mapGeneratedCourseBuilderNodesToBuilder,
  AI_SUGGESTIONS,
  CONTENT_TEMPLATES,
  generateQuestionPaperPDF,
  generateTaskTextPDF,
  isTaskSlideOverflowing,
  TASK_TEXT_SNAPSHOT_VERSION,
  resolveSelectedItem,
  stringToColor,
  formatDuration,
  deepCloneSourceDocument,
} from './builder-utils'

// --- Tiered PCI context helpers -------------------------------------------

function findContainingLesson(
  nodes: CourseBuilderNode[],
  predicate: (lesson: Lesson) => boolean
): { node: CourseBuilderNode; lesson: Lesson; nodeIndex: number; lessonIndex: number } | null {
  for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
    const node = nodes[nIdx]
    for (let lIdx = 0; lIdx < node.lessons.length; lIdx++) {
      const lesson = node.lessons[lIdx]
      if (predicate(lesson)) {
        return { node, lesson, nodeIndex: nIdx, lessonIndex: lIdx }
      }
    }
  }
  return null
}

function buildLessonContext(lesson: Lesson): string {
  const parts: string[] = []
  parts.push(`Lesson: ${lesson.title || 'Untitled lesson'}`)
  if (lesson.description?.trim()) {
    parts.push(`Lesson description: ${lesson.description.trim()}`)
  }
  if (lesson.taskSectionDescription?.trim()) {
    parts.push(`Task section description: ${lesson.taskSectionDescription.trim()}`)
  }
  lesson.docs?.forEach((doc, i) => {
    parts.push(`Doc ${i + 1}: ${doc.title || 'Untitled'} (${doc.type})`)
  })
  lesson.content?.forEach((c, i) => {
    if (c.type === 'text' && c.body?.trim()) {
      parts.push(`Content ${i + 1} (${c.title || 'text'}): ${c.body.trim().slice(0, 8000)}`)
    } else if (c.title?.trim()) {
      parts.push(`Content ${i + 1}: [${c.type}] ${c.title.trim()}`)
    }
  })
  return parts.join('\n')
}

function buildCourseContext(
  courseName: string | undefined,
  courseDescription: string | undefined,
  nodes: CourseBuilderNode[]
): string {
  const parts: string[] = []
  parts.push(`Course: ${courseName?.trim() || 'Untitled course'}`)
  if (courseDescription?.trim()) {
    parts.push(`Course description: ${courseDescription.trim()}`)
  }
  nodes.forEach((node, nIdx) => {
    parts.push(`\nNode ${nIdx + 1}: ${node.title || 'Untitled node'}`)
    if (node.description?.trim()) {
      parts.push(`Node description: ${node.description.trim()}`)
    }
    node.lessons.forEach((lesson, lIdx) => {
      parts.push(`  Lesson ${lIdx + 1}: ${lesson.title || 'Untitled lesson'}`)
      if (lesson.description?.trim()) {
        parts.push(`  Lesson description: ${lesson.description.trim()}`)
      }
      lesson.content?.forEach((c, cIdx) => {
        if (c.type === 'text' && c.body?.trim()) {
          parts.push(
            `  Content ${cIdx + 1} (${c.title || 'text'}): ${c.body.trim().slice(0, 4000)}`
          )
        } else if (c.title?.trim()) {
          parts.push(`  Content ${cIdx + 1}: [${c.type}] ${c.title.trim()}`)
        }
      })
    })
  })
  return parts.join('\n')
}

const generateId = utilsGenerateId

/**
 * When a task/assessment lands in a lesson that already has an item of the same
 * name, append " new" until the title is unique. Shared by the "Move to lesson…"
 * flow, cross-lesson drag, and "Move to homework" so the rule is applied
 * consistently everywhere an item is relocated.
 */
function uniqueMovedTitle(title: string | undefined, existingTitles: Set<string>): string {
  let t = (title || '').trim()
  while (existingTitles.has(t)) t = `${t} new`
  return t
}

import {
  Plus,
  Trash2,
  Copy,
  FileText,
  Video as VideoIcon,
  Image as ImageIcon,
  FileQuestion,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Save,
  Wand2,
  BookOpen,
  Layers,
  Upload,
  CheckCircle,
  Clock,
  GraduationCap,
  ListTodo,
  FolderOpen,
  Home,
  BrainCircuit,
  GripVertical,
  MoreVertical,
  X,
  Lightbulb,
  Sparkles,
  History,
  RotateCcw,
  Check,
  Zap,
  PenTool,
  Users,
  MonitorPlay,
  Gamepad2,
  Code,
  Send,
  Play,
  Lock,
  Unlock,
  Shield,
  Loader2,
  BarChart3,
  Signal,
  Radio,
  SignalHigh,
  SignalLow,
  Settings,
  Layers2,
  GripHorizontal,
  CornerDownLeft,
  Eye,
  Search,
  TestTube2,
  PencilRuler,
  Pencil,
  Wrench,
  FileCheck2,
  LayoutPanelTop,
  Brain,
  ClipboardList,
  RefreshCw,
  Type,
  ListChecks,
} from 'lucide-react'
import { ChevronLeft as ChevronLeftIcon } from 'lucide-react'
import { EnhancedWhiteboard } from '@/components/class/enhanced-whiteboard'
import { useCourseBuilderState } from './hooks/useCourseBuilderState'
import {
  InsightsReportView,
  type PollResultBlock,
  type QuestionResultBlock,
} from './builder-parts/InsightsReportView'

// ============================================
// BUILDER MODAL COMPONENTS
// ============================================

// ============================================
// MAIN COURSE BUILDER COMPONENT
// ============================================

// Main Course Builder

// LessonSelectorDialog Removed

// Extended props for modals with lesson selector
// BuilderModalWithCourseBuilderNodesProps Removed

// Types and payload definitions
type PreviewUpdatePayload = Partial<Task> | Partial<Assessment>

/** A warn-only guardrail violation surfaced from the PCI/DMI AI endpoints. */
type GuardrailWarning = {
  ruleId: string
  severity: 'info' | 'warning' | 'error'
  message: string
}

/**
 * Non-blocking banner listing guardrail violations the PCI/DMI endpoints
 * flagged (e.g. an invented retry policy, a paraphrased exam question). Errors
 * render rose, warnings amber. Renders nothing when there are no warnings.
 */
function GuardrailWarningsBanner({ warnings }: { warnings: GuardrailWarning[] }) {
  if (!warnings || warnings.length === 0) return null
  const hasError = warnings.some(w => w.severity === 'error')
  return (
    <div
      className={`mb-px rounded-md border px-2 py-1.5 text-xs ${
        hasError
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}
    >
      <p className="mb-0.5 font-semibold">
        Guardrail {hasError ? 'issues' : 'notes'} — review before relying on this output:
      </p>
      <ul className="list-disc space-y-0.5 pl-4">
        {warnings.map((w, i) => (
          <li key={`${w.ruleId}-${i}`}>
            <span className="font-medium">{w.ruleId}:</span> {w.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

interface PreviewCardProps {
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

// ============================================
// MAIN COURSE BUILDER COMPONENT
// ============================================

import { MonitoringPanel } from './MonitoringPanel'
import { SubmissionsPanel } from './SubmissionsPanel'

// Cache of rendered PDF page images keyed by document URL, so PCI vision messages
// don't re-render the same document on every chat turn.
const pdfPageCache = new Map<string, string[]>()

// Collapsible explainer at the top of a PCI tab. PCI ("how to mark this") is easy
// to confuse with the question content, so this spells out what it is, the flow,
// and concrete things worth telling the assistant — to point tutors the right way.
// Remember the tutor's assessment DMI response-format choice per course, so the
// chooser doesn't re-prompt on every paper in a course that's all one format.
type DmiFormat = 'free_response' | 'multiple_choice'
function readDmiFormatPref(courseKey: string): DmiFormat | null {
  if (typeof window === 'undefined' || !courseKey) return null
  const v = window.localStorage.getItem(`tutor-dmi-format:${courseKey}`)
  return v === 'free_response' || v === 'multiple_choice' ? v : null
}
function writeDmiFormatPref(courseKey: string, value: DmiFormat): void {
  if (typeof window === 'undefined' || !courseKey) return
  try {
    window.localStorage.setItem(`tutor-dmi-format:${courseKey}`, value)
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

function PciGuidance({ kind }: { kind: 'task' | 'assessment' }) {
  const noun = kind === 'assessment' ? 'assessment' : 'task'
  return (
    <details
      data-pci-anchor="guidance"
      className="group mb-3 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-900"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold">
        <Lightbulb className="h-3.5 w-3.5 text-blue-600" />
        What is PCI &amp; what to ask
        <span className="ml-auto text-blue-400 group-open:hidden">show</span>
        <span className="ml-auto hidden text-blue-400 group-open:inline">hide</span>
      </summary>
      <div className="mt-2 space-y-2">
        <p>
          <b>PCI is your marking instruction</b> for this {noun} — <i>how</i> you want answers
          marked, not the questions themselves. Chat your rules below; the assistant turns them into
          a finalized <b>rubric</b>. Save it under <b>Current marking policy</b> (use <b>Edit</b> to
          paste or refine) — it then guides the AI grading suggestions and how an uploaded marking
          scheme is read.
        </p>
        <p className="font-semibold">Things worth telling it:</p>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>&ldquo;Award method marks even if the final answer is wrong.&rdquo;</li>
          <li>&ldquo;Accept any value within &plusmn;0.1, and equivalent fractions.&rdquo;</li>
          <li>&ldquo;Require correct units — deduct 1 mark if missing.&rdquo;</li>
          <li>
            &ldquo;Mark to IB markbands / AP scoring guidelines / Cambridge M&amp;A marks.&rdquo;
          </li>
          <li>&ldquo;One mark per valid point, maximum 4.&rdquo;</li>
        </ul>
        <p className="text-blue-700/80">
          Flow: chat &rarr; the assistant proposes a rubric &rarr; set it as your{' '}
          <b>Current marking policy</b> &rarr; it&rsquo;s saved and used when grading. The answer
          key itself comes from the DMI / an uploaded marking scheme — PCI is the <i>policy</i> on
          top.
        </p>
      </div>
    </details>
  )
}

export const CourseBuilder = forwardRef<CourseBuilderRef, CourseBuilderProps>(
  function CourseBuilder(
    {
      courseId,
      courseName,
      courseDescription,
      initialLessons,
      hideCourseNameInTabs = false,
      onSave,
      onMakeVisibleToStudents,
      insightsProps,
      isCollapsed = false,
      onMainTabChange,
      initialMainTab,
      mainTab: mainTabProp,
      leftPanelHidden: leftPanelHiddenProp,
      onLeftPanelHiddenChange,
      hideDirectorySearch = false,
      directoryMenusAlwaysVisible = false,
      saveMode,
      onSaveModeChange,
      isStudentView = false,
      onSyncToLiveSession,
      onUnsyncedChangesChange,
      focusLessonId,
    },
    ref
  ) {
    const { data: session } = useSession()

    // Tutor avatar from profile — fetched once on mount.
    const [tutorAvatarUrl, setTutorAvatarUrl] = useState<string | null>(null)
    useEffect(() => {
      if (!session?.user?.id) return
      fetch('/api/user/profile', { credentials: 'include' })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data?.profile?.avatarUrl) {
            setTutorAvatarUrl(data.profile.avatarUrl)
          }
        })
        .catch(() => {})
    }, [session?.user?.id])

    // Random preset avatars for test students — assigned once per tab and persisted
    // in a ref so Student 1 and Student 2 keep consistent avatars across remounts.
    const studentAvatarPool = useRef<string[] | null>(null)
    if (studentAvatarPool.current === null) {
      // 20 preset avatars in public/avatars/
      const all = Array.from({ length: 20 }, (_, i) => {
        const num = String(i + 1).padStart(2, '0')
        return `/avatars/avatar-${num}.${i < 10 ? 'jpg' : 'png'}`
      })
      // Shuffle and pick 2
      const shuffled = [...all].sort(() => Math.random() - 0.5)
      studentAvatarPool.current = [shuffled[0], shuffled[1]]
    }

    // Main section tabs (Live, Test PCI vs Builder). Controllable: when the
    // parent passes `mainTab`, that prop is the single source of truth and we
    // never mirror it into local state. Mirroring it (and echoing local changes
    // back up) is what caused the React #185 render loop — see PRs #262/#264.
    // Local state is used only when the component is rendered uncontrolled.
    const isMainTabControlled = mainTabProp !== undefined
    const [mainTabInternal, setMainTabInternal] = useState<'live' | 'builder' | 'test-pci'>(
      initialMainTab ?? 'builder'
    )
    const mainTab = isMainTabControlled
      ? (mainTabProp as 'live' | 'builder' | 'test-pci')
      : mainTabInternal
    const setMainTab = useCallback(
      (next: 'live' | 'builder' | 'test-pci') => {
        if (!isMainTabControlled) setMainTabInternal(next)
        onMainTabChange?.(next)
      },
      [isMainTabControlled, onMainTabChange]
    )

    // Loading state shown while generating a text-only task's PDF snapshot
    // before entering Test/Live so the preview has a real sourceDocument.
    const [preparingTestPreview, setPreparingTestPreview] = useState(false)

    // Global styles for hiding Radix modals during drag
    useEffect(() => {
      const style = document.createElement('style')
      style.innerHTML = `
        body.hide-radix-dialogs-for-drag [data-radix-popper-content-wrapper],
        body.hide-radix-dialogs-for-drag .z-modal-backdrop,
        body.hide-radix-dialogs-for-drag [role="dialog"] {
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `
      document.head.appendChild(style)
      return () => {
        document.head.removeChild(style)
      }
    }, [])

    const resolvedInitialCourseBuilderNodes = useMemo(() => {
      const lessons = initialLessons || []
      const { sanitized: sanitizedLessons, removedPaths } = sanitizeBlobUrls(lessons, 'lessons')
      if (removedPaths.length > 0) {
        console.warn('[CourseBuilder] Removed blob URLs from loaded lessons:', removedPaths)
        toast.error(
          `Some attached documents were not properly saved (blob URLs detected in ${removedPaths.length} location${removedPaths.length === 1 ? '' : 's'}). Please re-upload them.`
        )
      }
      const safeLessons = Array.isArray(sanitizedLessons) ? sanitizedLessons : lessons
      return safeLessons.map((lesson: any, idx: number) => ({
        id: `node-${lesson.id || idx}`,
        title: lesson.title || `Lesson ${idx + 1}`,
        description: lesson.description || '',
        order: lesson.order || idx,
        isPublished: lesson.isPublished || false,
        difficultyMode: lesson.difficultyMode || 'all',
        variants: lesson.variants || {},
        lessons: [lesson],
        quizzes: [],
      }))
    }, [initialLessons])
    const initialCourseBuilderNodesKey = useMemo(() => {
      try {
        return JSON.stringify(resolvedInitialCourseBuilderNodes)
      } catch {
        return String(resolvedInitialCourseBuilderNodes?.length ?? 0)
      }
    }, [resolvedInitialCourseBuilderNodes])
    const lastInitialCourseBuilderNodesKeyRef = useRef<string | null>(null)
    // The course whose loaded data we last hydrated the builder from, so a late/
    // async initial for the SAME course can't clobber in-progress edits.
    const lastHydratedCourseIdRef = useRef<string | null>(null)
    // The course for which we've already absorbed the FIRST real (non-empty) load.
    // Until this is set, the builder's lessons don't yet reflect the DB, so the
    // first real load is MERGED in (not skipped) to preserve any lessons the tutor
    // added during the load window while still capturing the full DB baseline.
    const mergedRealLoadCourseIdRef = useRef<string | null>(null)
    const [builderNodes, setBuilderNodes] = useState<CourseBuilderNode[]>([])
    const [liveNodes, setLiveNodes] = useState<CourseBuilderNode[]>([])

    const cloneNodes = useCallback((value: CourseBuilderNode[]) => {
      if (typeof structuredClone === 'function') {
        return structuredClone(value)
      }
      return JSON.parse(JSON.stringify(value)) as CourseBuilderNode[]
    }, [])

    // Live shows the synced snapshot (liveNodes). But a session opened directly
    // in 'live' mode may never run the switch-triggered sync, leaving liveNodes
    // empty and the lessons "missing" — fall back to builderNodes (the loaded
    // course lessons) whenever the snapshot is empty.
    const nodes = useMemo(
      () => (mainTab === 'live' ? (liveNodes.length > 0 ? liveNodes : builderNodes) : builderNodes),
      [mainTab, liveNodes, builderNodes]
    )

    // Always-current ref to `nodes` so deferred callbacks (e.g. reveal-after-load
    // timeouts) don't read stale state captured before setCourseBuilderNodes ran.
    const nodesRef = useRef(nodes)
    useEffect(() => {
      nodesRef.current = nodes
    }, [nodes])

    const setCourseBuilderNodes = useCallback(
      (updater: React.SetStateAction<CourseBuilderNode[]>) => {
        if (mainTab === 'live') {
          setLiveNodes(updater)
        } else {
          setBuilderNodes(updater)
        }
      },
      [mainTab]
    )
    const [expandedCourseBuilderNodes, setExpandedCourseBuilderNodes] = useState<Set<string>>(
      new Set()
    )

    // When a live session is opened with an assigned lesson, expand + scroll to
    // that lesson exactly once (the existing expand→scroll effect handles the
    // scroll). Guarded by a ref so a tutor's later manual collapse isn't undone.
    const didFocusLessonRef = useRef(false)
    useEffect(() => {
      if (didFocusLessonRef.current) return
      if (!focusLessonId || mainTab !== 'live' || nodes.length === 0) return
      const target = nodes.find(
        n => n.id === focusLessonId || n.lessons.some(l => l.id === focusLessonId)
      )
      if (!target) return
      didFocusLessonRef.current = true
      setExpandedCourseBuilderNodes(prev => new Set(prev).add(target.id))
    }, [focusLessonId, mainTab, nodes])

    const [searchQuery, setSearchQuery] = useState('')
    const [selectedItem, setSelectedItem] = useState<{ type: string; id: string } | null>(null)
    const [outlineModalOpen, setOutlineModalOpen] = useState(false)
    const [aiPanelOpen, setAiPanelOpen] = useState(false)
    const [importTarget, setImportTarget] = useState<{ nodeId: string; lessonId: string } | null>(
      null
    )
    const [courseAssets, setCourseAssets] = useState<
      {
        id: string
        name: string
        content?: string
        url?: string
        fileKey?: string
        mimeType?: string
        folder?: string
      }[]
    >([])
    const assetsLoadedRef = useRef(false)
    const skipNextAssetsSaveRef = useRef(false)
    const [loadAsModalOpen, setLoadAsModalOpen] = useState(false)
    const [isSplittingTasks, setIsSplittingTasks] = useState(false)
    const [isSplittingTaskExtensions, setIsSplittingTaskExtensions] = useState(false)
    const [assetToLoad, setAssetToLoad] = useState<{
      name: string
      content?: string
      url?: string
      fileKey?: string
      mimeType?: string
      folder?: string
    } | null>(null)
    const [assetsViewOpen, setAssetsViewOpen] = useState(false)
    const [isDraggingFromModal, setIsDraggingFromModal] = useState(false)
    const [assetPickerTarget, setAssetPickerTarget] = useState<'task' | 'assessment' | null>(null)
    const [assetViewSearch, setAssetViewSearch] = useState('')
    const [assetViewFolder, setAssetViewFolder] = useState<string>('All')
    type WhiteboardPages = NonNullable<ComponentProps<typeof EnhancedWhiteboard>['pages']>
    type WhiteboardPage = WhiteboardPages[number]
    const createDefaultWhiteboardPages = (): WhiteboardPages => [
      {
        id: 'page-1',
        name: 'Page 1',
        strokes: [],
        texts: [],
        shapes: [],
        formulas: [],
        graphs: [],
        backgroundColor: '#ffffff',
        backgroundStyle: 'solid',
      },
    ]
    const [tutorBoardPages, setTutorBoardPages] = useState<WhiteboardPage[]>(
      createDefaultWhiteboardPages
    )
    const [tutorBoardPageIndex, setTutorBoardPageIndex] = useState(0)

    // Delta-first mirroring: send periodic checkpoints (for late joiners / resync),
    // not full snapshots on every small state change.
    useEffect(() => {
      if (!insightsProps?.socket || !insightsProps?.sessionId) return

      const socket = insightsProps.socket
      const roomId = insightsProps.sessionId
      const MIN_INTERVAL_MS = 2000
      const DEBOUNCE_MS = 1200

      let cancelled = false
      let timeout: ReturnType<typeof setTimeout> | null = null
      let lastSentAt = 0

      const schedule = () => {
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(() => {
          if (cancelled) return
          const now = Date.now()
          if (now - lastSentAt < MIN_INTERVAL_MS) {
            schedule()
            return
          }
          lastSentAt = now
          socket.emit('tutor:whiteboard:update', {
            roomId,
            board: { pages: tutorBoardPages, pageIndex: tutorBoardPageIndex, updatedAt: now },
          })
        }, DEBOUNCE_MS)
      }

      schedule()
      return () => {
        cancelled = true
        if (timeout) clearTimeout(timeout)
      }
    }, [tutorBoardPages, tutorBoardPageIndex, insightsProps?.socket, insightsProps?.sessionId])

    // On join, request the latest snapshot to avoid waiting for next checkpoint.
    useEffect(() => {
      if (!insightsProps?.socket || !insightsProps?.sessionId) return
      insightsProps.socket.emit('whiteboard:state:request', {
        roomId: insightsProps.sessionId,
        target: 'tutorBoard',
      })
    }, [insightsProps?.socket, insightsProps?.sessionId])
    const designatedFolder = useMemo(() => {
      // Search published courses AND drafts — a course still in draft holds the
      // category chosen at creation, and the Board/Subject must resolve from it.
      const allCourses = [
        ...((insightsProps as any)?.courses ?? []),
        ...((insightsProps as any)?.draftCourses ?? []),
      ]
      const liveCourse = allCourses.find((c: any) => c.id === courseId)
      if (liveCourse && (liveCourse as any).categories?.length > 0) {
        return (liveCourse as any).categories[0]
      }
      return courseName?.trim() || 'Uncategorized'
    }, [
      (insightsProps as any)?.courses,
      (insightsProps as any)?.draftCourses,
      courseId,
      courseName,
    ])

    // Auto-select the designated folder when course changes so users immediately see their relevant assets
    useEffect(() => {
      setAssetViewFolder(designatedFolder !== 'Uncategorized' ? designatedFolder : 'All')
    }, [courseId, designatedFolder])

    // Board & Subject for the PCI Guided form (Model A: the course category is
    // the shared source of truth). `courseCategoryOverride` reflects a change the
    // tutor makes here immediately, before the `courses` prop refetches; the
    // change is also persisted back to the course so Course details picks it up.
    const liveCourseCategories = useMemo(() => {
      const allCourses = [
        ...((insightsProps as any)?.courses ?? []),
        ...((insightsProps as any)?.draftCourses ?? []),
      ]
      const lc = allCourses.find((c: any) => c.id === courseId)
      return Array.isArray(lc?.categories) ? (lc.categories as string[]) : []
    }, [(insightsProps as any)?.courses, (insightsProps as any)?.draftCourses, courseId])
    const [courseCategoryOverride, setCourseCategoryOverride] = useState<string | null>(null)
    const [pciBoardOverride, setPciBoardOverride] = useState<string | null>(null)
    const pciCategory =
      courseCategoryOverride ?? (designatedFolder !== 'Uncategorized' ? designatedFolder : '')
    const pciCategoryOptions = useMemo(() => getAllCourseCategoryOptions(), [])
    // `pciBoard` (the exam Board — AP, IB, SAT…) is derived further down, once the
    // loaded assessment document is available, so it can be auto-detected from the
    // paper itself rather than the course folder. Board applies to assessments only.

    const [assetFoldersList, setAssetFoldersList] = useState<string[]>(() => {
      if (typeof window !== 'undefined') {
        try {
          const saved = localStorage.getItem('tutor-asset-folders')
          return saved ? JSON.parse(saved) : []
        } catch {
          return []
        }
      }
      return []
    })

    const [newFolderName, setNewFolderName] = useState('')
    const [isCreatingFolder, setIsCreatingFolder] = useState(false)
    const [editingFolder, setEditingFolder] = useState<string | null>(null)
    const [editFolderName, setEditFolderName] = useState('')

    // Compute the full list of folders combining custom folders and published course categories
    const computedAssetFolders = useMemo(() => {
      const folders = new Set<string>(assetFoldersList)

      // Add custom folders that assets might already be in
      courseAssets.forEach(a => {
        if (a.folder) folders.add(a.folder)
      })

      // Add designated folder if not already present
      if (designatedFolder !== 'Uncategorized') folders.add(designatedFolder)

      // Add categories from published courses
      if (Array.isArray((insightsProps as any)?.courses)) {
        ;(insightsProps as any).courses.forEach((c: any) => {
          if (c.isPublished && Array.isArray(c.categories)) {
            c.categories.forEach((cat: any) => folders.add(cat))
          }
        })
      }

      return ['All', ...Array.from(folders).sort()]
    }, [courseAssets, assetFoldersList, (insightsProps as any)?.courses, designatedFolder])
    const [loadAsStep, setLoadAsStep] = useState<'main' | 'task-options' | 'assessment-options'>(
      'main'
    )
    const [loadTaskMode, setLoadTaskMode] = useState<'single' | 'multi'>('single')
    const [leftPanelHiddenInternal, setLeftPanelHiddenInternal] = useState(false)
    const leftPanelHidden = leftPanelHiddenProp ?? leftPanelHiddenInternal
    const setLeftPanelHidden = useCallback(
      (value: boolean) => {
        if (onLeftPanelHiddenChange) {
          onLeftPanelHiddenChange(value)
        } else {
          setLeftPanelHiddenInternal(value)
        }
      },
      [onLeftPanelHiddenChange]
    )
    const [rightPanelHidden, setRightPanelHidden] = useState(false)
    const [rightPanelWidth] = useState(400)
    const [leftPanelWidth, setLeftPanelWidth] = useState(400)
    const [viewportWidth, setViewportWidth] = useState(1920)
    // Disable width transition on initial mount to prevent expanding animation
    const [panelsMounted, setPanelsMounted] = useState(false)
    useEffect(() => {
      // Small delay to ensure initial render is complete before enabling transitions
      const timer = setTimeout(() => setPanelsMounted(true), 50)
      return () => clearTimeout(timer)
    }, [])
    // Peek animation state for side panel toggles
    const [isLeftPeeking, setIsLeftPeeking] = useState(false)
    const [isRightPeeking, setIsRightPeeking] = useState(false)
    useEffect(() => {
      const interval = setInterval(() => {
        setIsLeftPeeking(true)
        setIsRightPeeking(true)
        setTimeout(() => {
          setIsLeftPeeking(false)
          setIsRightPeeking(false)
        }, 600)
      }, 8000)
      return () => clearInterval(interval)
    }, [])

    useEffect(() => {
      const handleResize = () => setViewportWidth(window.innerWidth)
      if (typeof window !== 'undefined') {
        setViewportWidth(window.innerWidth)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
      }
    }, [])

    // The builder is rendered inside the inset dashboard area (a fixed sidebar +
    // margins take ~272px), NOT the full window — so sizing the panels from
    // window.innerWidth overshot the real container by ~270px and pushed the
    // right panel off the edge (clipped by the ancestor overflow-hidden). Measure
    // the actual layout row instead so the three fixed-width panels tile exactly,
    // in every host (dashboard, live/insights) and nav state.
    const layoutRowRef = useRef<HTMLDivElement | null>(null)
    const [layoutRowWidth, setLayoutRowWidth] = useState(0)
    useEffect(() => {
      const el = layoutRowRef.current
      if (!el || typeof ResizeObserver === 'undefined') return
      const update = () => setLayoutRowWidth(el.clientWidth)
      update()
      const ro = new ResizeObserver(update)
      ro.observe(el)
      return () => ro.disconnect()
    }, [])

    // clientWidth includes the row's own horizontal padding (pl-[17px] pr-4 = 33px).
    // Fall back to the window measure only until the observer takes its first
    // reading (avoids a 1-frame flash of a negative width during hydration).
    const availableRowWidth = (layoutRowWidth > 0 ? layoutRowWidth : viewportWidth) - 33
    // A hidden side panel collapses to a peek pill and reclaims its width for the
    // center column. The panel's own outer width below uses the same effective
    // value so the flex row stays exact; both animate via a width transition.
    const effLeftPanelWidth = leftPanelHidden ? 0 : leftPanelWidth
    const effRightPanelWidth = rightPanelHidden ? 0 : rightPanelWidth
    const centerColWidth = Math.max(
      320,
      availableRowWidth - effLeftPanelWidth - 24 - effRightPanelWidth - 24
    )

    const [leftPanelResizing, setLeftPanelResizing] = useState(false)
    const leftPanelRef = useRef<HTMLDivElement>(null)
    const [assetsOpen, setAssetsOpen] = useState(true)
    const [mediaOpen, setMediaOpen] = useState(true)
    const [docsOpen, setDocsOpen] = useState(true)
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
    const [collapsedTaskExtensions, setCollapsedTaskExtensions] = useState<Set<string>>(new Set())

    const nodeRefs = useRef<Record<string, HTMLElement | null>>({})
    const prevExpandedNodesRef = useRef<Set<string>>(new Set())
    useEffect(() => {
      expandedCourseBuilderNodes.forEach(id => {
        if (!prevExpandedNodesRef.current.has(id)) {
          const el = nodeRefs.current[id]
          if (el) scrollElementIntoView(el, { margin: 16 })
        }
      })
      prevExpandedNodesRef.current = new Set(expandedCourseBuilderNodes)
    }, [expandedCourseBuilderNodes])

    const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
    const prevCollapsedSectionsRef = useRef<Set<string>>(new Set())
    useEffect(() => {
      prevCollapsedSectionsRef.current.forEach(key => {
        if (!collapsedSections.has(key)) {
          const el = sectionRefs.current[key]
          if (el) scrollElementIntoView(el, { margin: 16 })
        }
      })
      prevCollapsedSectionsRef.current = new Set(collapsedSections)
    }, [collapsedSections])

    const extensionRefs = useRef<Record<string, HTMLElement | null>>({})
    const prevCollapsedExtensionsRef = useRef<Set<string>>(new Set())
    useEffect(() => {
      prevCollapsedExtensionsRef.current.forEach(id => {
        if (!collapsedTaskExtensions.has(id)) {
          const el = extensionRefs.current[id]
          if (el) scrollElementIntoView(el, { margin: 16 })
        }
      })
      prevCollapsedExtensionsRef.current = new Set(collapsedTaskExtensions)
    }, [collapsedTaskExtensions])

    const objectUrlsRef = useRef<string[]>([])

    // State for lesson selection dialog
    const [lessonSelectDialog, setLessonSelectDialog] = useState<{
      isOpen: boolean
      type: 'task' | 'assessment' | null
      title: string
    }>({ isOpen: false, type: null, title: '' })

    // Loading a document from its own kebab menu asks which lesson to load into
    // (existing or new) before the "Load as…" modal, instead of forcing Lesson 1.
    const [assetLessonPickerOpen, setAssetLessonPickerOpen] = useState(false)
    const [assetLoadTarget, setAssetLoadTarget] = useState<{
      nodeId: string
      lessonId: string
    } | null>(null)

    // State for editable PCI tabs
    const [testPciTabs, setTestPciTabs] = useState(() =>
      insightsProps
        ? [
            { id: 'classroom', label: 'Classroom' },
            { id: 'student1', label: 'Whiteboards' },
          ]
        : [
            { id: 'classroom', label: 'Classroom' },
            { id: 'student1', label: 'Test Student 1' },
            { id: 'student2', label: 'Test Student 2' },
          ]
    )

    const [editingTabId, setEditingTabId] = useState<string | null>(null)
    const [renamingItemId, setRenamingItemId] = useState<string | null>(null)

    // Builder state for Task and Assessment
    // Task content is always preserved. Extensions have their own content.
    // When activeExtensionId is null, we show/edit taskContent/taskPci
    // When activeExtensionId is set, we show/edit that extension's content
    const [taskBuilder, setTaskBuilder] = useState<{
      title: string
      taskContent: string
      taskPci: string
      details: string
      /** Append-only PCI approval audit log (TASK-18). */
      pciHistory?: import('@/lib/assessment/pci').PciAuditRecord[]
      /** Current approved structured PCI spec (TASK-6). */
      pciSpec?: import('@/lib/assessment/pci-spec').PciSpec
      sourceDocument?: {
        fileName: string
        fileUrl: string
        fileKey?: string
        mimeType: string
        uploadedAt: string
        extractedText?: string
      }
      extensions: {
        id: string
        name: string
        description?: string
        content: string
        pci: string
        sourceDocument?: any
      }[]
      activeExtensionId: string | null
    }>({
      title: '',
      taskContent: '', // Base task content (never overwritten by extensions)
      taskPci: '', // Base task PCI (never overwritten by extensions)
      details: '',
      // Extensions have their own content stored separately
      extensions: [],
      activeExtensionId: null, // null = viewing task, string = viewing extension
    })

    const [assessmentBuilder, setAssessmentBuilder] = useState<{
      title: string
      taskContent: string
      taskPci: string
      // Current approved structured PCI spec (TASK-6) — persisted at deploy to
      // BuilderTask.pciSpec, mirroring tasks, so the grader gets it too.
      pciSpec?: import('@/lib/assessment/pci-spec').PciSpec
      details: string
      sourceDocument?: {
        fileName: string
        fileUrl: string
        fileKey?: string
        mimeType: string
        uploadedAt: string
        extractedText?: string
      }
      extensions: {
        id: string
        name: string
        description?: string
        content: string
        pci: string
        sourceDocument?: any
      }[]
      activeExtensionId: string | null
    }>({
      title: '',
      taskContent: '',
      taskPci: '',
      details: '',
      extensions: [],
      activeExtensionId: null,
    })

    // The PCI assistant chat state + handlers live in usePci (called further down,
    // after its deps such as autoCreateTask are defined). The loaders and the
    // blank-slate reset need its dispatchers before that point, so bridge them
    // through refs that are pointed at the hook once it's created.
    const loadPciMessagesRef = useRef<(target: PciTarget, messages: PciMessage[]) => void>(() => {})
    const resetPciRef = useRef<() => void>(() => {})
    const taskPciScrollRef = useRef<HTMLDivElement>(null)
    // Ref for the task text editor so we can check whether a keystroke would
    // overflow the locked 1100 x 620 slide canvas and reject it.
    const taskTextareaRef = useRef<HTMLTextAreaElement>(null)

    // Whether the "Current PCI" box is in edit mode (tutor typing the policy
    // directly instead of via the assistant chat).
    const [editingCurrentPci, setEditingCurrentPci] = useState(false)
    // Which source's guided PCI questionnaire is open ('task' | 'assessment' | null).
    const [pciFormSource, setPciFormSource] = useState<'task' | 'assessment' | null>(null)
    // Directly set the saved PCI (the marking policy used by grading) for the
    // active context — the active task extension, the base task, or the
    // assessment. Mirrors where applyTaskPciDraft / applyAssessmentPciDraft write.
    const setCurrentPci = (
      source: 'task' | 'assessment',
      text: string,
      audit?: import('@/lib/assessment/pci').PciAuditRecord
    ) => {
      if (source === 'task') {
        setTaskBuilder(prev => {
          const base = prev.activeExtensionId
            ? {
                ...prev,
                extensions: prev.extensions.map(ext =>
                  ext.id === prev.activeExtensionId ? { ...ext, pci: text } : ext
                ),
              }
            : { ...prev, taskPci: text }
          // TASK-18: record the approval (transcript + approved text) on a real
          // "Apply to PCI" — not on a manual edit/clear (which pass no audit).
          // TASK-6: `pciSpec` holds the current approved structured spec.
          return audit
            ? { ...base, pciHistory: [...(prev.pciHistory ?? []), audit], pciSpec: audit.spec }
            : base
        })
      } else {
        // TASK-6: persist the structured spec on a real "Apply to PCI" (audit
        // present); a manual edit/clear passes no audit and leaves it as-is.
        setAssessmentBuilder(prev =>
          audit ? { ...prev, taskPci: text, pciSpec: audit.spec } : { ...prev, taskPci: text }
        )
      }
    }

    // AI Assist Agent state - separate for task and assessment
    const [aiAssistOpen, setAiAssistOpen] = useState(false)
    const [aiAssistContext, setAiAssistContext] = useState<'task' | 'assessment'>('task')
    const [taskAiMessages, setTaskAiMessages] = useState<
      { role: 'user' | 'assistant'; content: string }[]
    >([])
    const [assessmentAiMessages, setAssessmentAiMessages] = useState<
      { role: 'user' | 'assistant'; content: string }[]
    >([])

    // Uploaded files tracking
    const [taskUploadedFiles, setTaskUploadedFiles] = useState<{ id: string; name: string }[]>([])
    const [assessmentUploadedFiles, setAssessmentUploadedFiles] = useState<
      { id: string; name: string }[]
    >([])
    const [taskSourceDocument, setTaskSourceDocument] = useState<
      ImportedLearningResource | undefined
    >(undefined)
    const [assessmentSourceDocument, setAssessmentSourceDocument] = useState<
      ImportedLearningResource | undefined
    >(undefined)
    // When a DMI is generated from *study material* the tutor's upload stays
    // visible in the builder, but must NOT be deployed to students (they get the
    // generated questions as Classroom content instead). This flag records that
    // "reference-only" state without wiping the document — wiping it previously
    // produced a "No document selected" preview for study material, and for any
    // question paper misclassified as study material (e.g. a large SAT paper
    // whose server-side text extraction fell back to images).
    const [assessmentSourceReferenceOnly, setAssessmentSourceReferenceOnly] = useState(false)

    // Test PCI state
    const [testPciInputs, setTestPciInputs] = useState<Record<string, string>>({
      classroom: '',
      student1: '',
      student2: '',
    })
    const [testPciViewMode, setTestPciViewMode] = useState<string>('pdf')
    const [testPciContent, setTestPciContent] = useState<Record<string, string>>({
      classroom: '',
      student1: '',
      student2: '',
    })
    // AI scoring results for Test PCI
    const [testPciScores, setTestPciScores] = useState<
      Record<string, { score: number; feedback: string }[]>
    >({
      classroom: [],
      student1: [],
      student2: [],
    })
    const [testPciLoading, setTestPciLoading] = useState(false)
    const [testPciActiveTab, setTestPciActiveTab] = useState('classroom')
    // Which question the sample answer is being graded against. '' = grade
    // against the whole scheme (policy test across all questions).
    const [testPciQuestionId, setTestPciQuestionId] = useState<string>('')
    const [isMirroringToStudents, setIsMirroringToStudents] = useState(true)

    // Course sync mode: auto | manual | ask (from localStorage)
    const [syncMode, setSyncMode] = useState<'auto' | 'manual' | 'ask'>('auto')
    const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false)
    const [askToastShown, setAskToastShown] = useState(false)
    const syncDebounceRef = useRef<NodeJS.Timeout | null>(null)

    // Load sync mode from localStorage on mount
    useEffect(() => {
      try {
        const raw = localStorage.getItem('tutor-sync-mode')
        if (raw && ['auto', 'manual', 'ask'].includes(raw)) {
          setSyncMode(raw as 'auto' | 'manual' | 'ask')
        }
      } catch {
        // ignore
      }
    }, [])

    const openVideoOverlay = useVideoOverlayStore(s => s.openOverlay)
    // Students whose whiteboards the tutor is currently viewing (multi-view grid).
    const [monitorSelectedStudents, setMonitorSelectedStudents] = useState<
      { id: string; name: string }[]
    >([])
    const toggleMonitorStudent = useCallback((id: string, name: string) => {
      setMonitorSelectedStudents(prev =>
        prev.some(s => s.id === id) ? prev.filter(s => s.id !== id) : [...prev, { id, name }]
      )
    }, [])
    const addMonitorStudent = useCallback((id: string, name: string) => {
      setMonitorSelectedStudents(prev =>
        prev.some(s => s.id === id) ? prev : [...prev, { id, name }]
      )
    }, [])
    const removeMonitorStudent = useCallback((id: string) => {
      setMonitorSelectedStudents(prev => prev.filter(s => s.id !== id))
    }, [])
    const [liveRightPanelTab, setLiveRightPanelTab] = useState<'submissions' | 'insights'>(
      'submissions'
    )
    // Reset to Submissions when leaving Live mode so the pill doesn't stick on Insights
    useEffect(() => {
      if (mainTab !== 'live' && liveRightPanelTab === 'insights') {
        setLiveRightPanelTab('submissions')
      }
    }, [mainTab, liveRightPanelTab])
    // New (unseen) submission count, surfaced by SubmissionsPanel to badge the tab.
    const [newSubmissionCount, setNewSubmissionCount] = useState(0)

    const [testPciSource, setTestPciSource] = useState<'task' | 'assessment'>('task')
    // Persists each Test-tab task-chat preview (keyed by task/extension + student
    // tab) across the remounts that happen when switching Test students, so the
    // conversation isn't lost. A ref: writing it must not trigger a re-render.
    // Also backed by localStorage so test data survives mode switches (Test to Build).
    const testTaskChatStore = useRef<Record<string, TestTaskChatState>>(
      (() => {
        try {
          const saved = localStorage.getItem('tutor-test-chat-store-v1')
          return saved ? JSON.parse(saved) : {}
        } catch {
          return {}
        }
      })()
    )
    // Shared state for the Classroom tab — aggregates messages from all student tabs
    // plus tutor messages sent from the classroom view. Keyed by extension id.
    // Must be useState (not ref) so changes trigger re-renders of the Classroom tab.
    // Also backed by localStorage for durability across mode switches.
    const [classroomMessages, setClassroomMessages] = useState<Record<string, TestTaskChatMsg[]>>(
      () => {
        try {
          const saved = localStorage.getItem('tutor-classroom-messages-v1')
          return saved ? JSON.parse(saved) : {}
        } catch {
          return {}
        }
      }
    )
    // Persist classroomMessages to localStorage whenever it changes
    useEffect(() => {
      try {
        localStorage.setItem('tutor-classroom-messages-v1', JSON.stringify(classroomMessages))
      } catch {
        // ignore
      }
    }, [classroomMessages])

    // Current extension key for the Test/Classroom chat preview.
    const getCurrentExtKey = () => {
      const previewExt = taskBuilder.activeExtensionId
        ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)
        : null
      return previewExt ? previewExt.id : 'base'
    }

    // Append a tutor-facing SAI message to the classroom chat stream.
    const appendClassroomAiMessage = (content: string, name = 'SAI') => {
      const key = getCurrentExtKey()
      setClassroomMessages(prev => ({
        ...prev,
        [key]: [
          ...(prev[key] ?? []),
          { role: 'ai' as const, name, content, timestamp: Date.now() },
        ],
      }))
    }

    // Emit student-interaction events that the tutor-facing classroom AI may use to
    // generate automated reports. New event types intentionally no-op until guardrails
    // are defined for them.
    const emitClassroomAiEvent = (
      eventType: 'student-answer' | 'student-ask' | 'task-complete',
      payload: Record<string, unknown>
    ) => {
      void eventType
      void payload
    }

    // Generate the session AI's initial summary whenever a task is loaded into Test mode.
    useEffect(() => {
      if (mainTab !== 'test-pci' || testPciSource !== 'task') return
      const key = getCurrentExtKey()
      if (
        classroomMessages[key]?.some(m => m.role === 'ai' && m.content.startsWith('Session ready.'))
      )
        return
      const summary = [
        'Session ready.',
        '',
        `Task: ${taskBuilder.title?.trim() || 'Untitled task'}`,
        `Course: ${courseName?.trim() || 'Test Course'}`,
        'Enrolled Students: 2',
        `Date: ${new Date().toLocaleDateString()}`,
        'Session Number: 1',
        'Attendance: 100%',
      ].join('\n')
      appendClassroomAiMessage(summary, 'SAI')
    }, [
      mainTab,
      testPciSource,
      taskBuilder.activeExtensionId,
      taskBuilder.extensions,
      taskBuilder.title,
      courseName,
      classroomMessages,
    ])
    // Test-tab-only DEBUG control: grade against all available bases (default) or
    // isolate one (PCI / rubric / model answer) to see its effect alone. Never
    // affects student/production grading — only the tutor's test-grade requests.
    const [testPciBasis, setTestPciBasis] = useState<'all' | 'pci' | 'rubric' | 'model'>('all')
    // Per-question test answers + results for the assessment Test tab, so the
    // tutor tests grading by answering the DMI questions themselves (like a
    // student) instead of a separate free-text box. Keyed `${studentTab}:${itemId}`.
    const [testDmiAnswers, setTestDmiAnswers] = useState<Record<string, string>>({})
    const [testDmiResults, setTestDmiResults] = useState<
      Record<string, { loading?: boolean; score?: number | null; feedback?: string }>
    >({})
    // How the last-generated DMI was classified (per source). Lets the tutor
    // override a confidently-wrong call — e.g. numbered study notes read as a
    // question paper — via the "Detected as …" banner, which regenerates.
    const [dmiDocumentKind, setDmiDocumentKind] = useState<{
      task?: 'question_paper' | 'study_material'
      assessment?: 'question_paper' | 'study_material'
    }>({})
    const [alertDialog, setAlertDialog] = useState<{
      open: boolean
      title: string
      message: string
    }>({
      open: false,
      title: '',
      message: '',
    })
    const [sessionScheduledAt] = useState<string | null>(null)
    const [taskDmiItems, setTaskDmiItems] = useState<DMIQuestion[]>([])
    const [assessmentDmiItems, setAssessmentDmiItems] = useState<DMIQuestion[]>([])

    // DMI Version history
    const [taskDmiVersions, setTaskDmiVersions] = useState<DMIVersion[]>([])
    const [assessmentDmiVersions, setAssessmentDmiVersions] = useState<DMIVersion[]>([])
    const [showDmiVersionList, setShowDmiVersionList] = useState(false)
    const [previewDmiVersion, setPreviewDmiVersion] = useState<DMIVersion | null>(null)
    // Floating "view DMI" modal available from the Classroom (live) view.
    const [showLiveDmiModal, setShowLiveDmiModal] = useState(false)
    // Answer key hidden by default — the tutor's screen is shared with students
    // during live, so reveal answers/rubrics only on explicit toggle.
    const [showLiveDmiAnswers, setShowLiveDmiAnswers] = useState(false)
    const [dmiGenerating, setDmiGenerating] = useState(false)
    // Opt-in: when a PDF paper contains diagrams/figures, also send rendered page
    // images to the vision model so it can SEE figures a question refers to (the
    // extracted text can't carry them). Off by default — keeps text-only speed and
    // cost unless the tutor turns it on for a diagram-heavy paper.
    const [dmiAnalyzeFigures, setDmiAnalyzeFigures] = useState(false)
    // When generate-dmi detects study material (no explicit questions), we ask
    // the tutor which question types + counts to generate before continuing.
    const [dmiSpecDialog, setDmiSpecDialog] = useState<{ type: 'task' | 'assessment' } | null>(null)
    const [dmiSpecRows, setDmiSpecRows] = useState<Array<{ type: DmiQuestionType; count: number }>>(
      []
    )
    // "Is this a question paper?" confirmation — shown when generate-dmi can't be
    // confident of the document kind (model unsure, or its call conflicts with the
    // text signals). `signal` is the code-level paper-signal strength, for a hint.
    const [dmiKindDialog, setDmiKindDialog] = useState<{
      type: 'task' | 'assessment'
      signal: 'strong' | 'weak' | 'none' | null
    } | null>(null)
    // Assessment response-format chooser + MCQ configuration. For a multiple-
    // choice paper we skip the AI entirely (no tokens spent reading it): the
    // tutor configures the sections + question counts and the DMI is built
    // locally, then they click the correct option for each question.
    const [dmiFormatDialog, setDmiFormatDialog] = useState<{
      type: 'task' | 'assessment'
    } | null>(null)
    // Content-source chooser: shown when a PDF is attached AND the text box was
    // edited away from the document's own extraction (the two sources disagree).
    const [dmiSourceDialog, setDmiSourceDialog] = useState<{
      type: 'task' | 'assessment'
    } | null>(null)
    // The tutor's content-source pick has to survive the whole DMI resolve chain
    // (source → format → kind → spec), every stage of which re-invokes
    // handleGenerateDMI. Threading it as a param alone fails: each downstream
    // dialog handler drops the arg, which re-opens the source chooser in an
    // endless loop. So we hold it in a ref and reset it only when a fresh,
    // user-initiated generate begins.
    const dmiContentSourceRef = useRef<'document' | 'text' | null>(null)
    const [mcqConfigDialog, setMcqConfigDialog] = useState<{
      type: 'task' | 'assessment'
    } | null>(null)
    const [mcqSections, setMcqSections] = useState<Array<{ name: string; count: number }>>([
      { name: '', count: 10 },
    ])
    const [mcqChoices, setMcqChoices] = useState(4)
    const [mcqMarks, setMcqMarks] = useState(1)
    // "Edit marks & answers" review modal — lets the tutor set per-question marks
    // and vet/approve the AI-generated answers before deploying.
    const [dmiEditor, setDmiEditor] = useState<{ source: 'task' | 'assessment' } | null>(null)
    // "Upload marking scheme": parse an uploaded scheme and fill each question's
    // answer/rubric by matching question numbers.
    // Tutor's answer-reveal policy applied to deploys: when students may see the
    // correct answers. Default 'instant' preserves the existing live-feedback
    // behaviour; the tutor can switch to reveal-after-submit or hidden.
    const [deployAnswerReveal, setDeployAnswerReveal] = useState<
      'instant' | 'after_submit' | 'hidden' | 'student_choice'
    >('instant')
    // When the tutor clicks Deploy, a dialog first asks how/when students see
    // answers, then runs the actual deploy with the chosen mode.
    const [deployDialog, setDeployDialog] = useState<{
      run: (reveal: 'instant' | 'after_submit' | 'hidden' | 'student_choice') => void
    } | null>(null)
    // Any Deploy action routes through this: it opens the answer-reveal dialog,
    // then runs the real deploy with the chosen mode applied to the payload.
    const deployTaskWithDialog = useCallback(
      (payload: LiveTask) => {
        // Attach the tutor's PCI (free-text `instructions` + finalized structured
        // spec) so the server can persist it for the live tutor + grader. Looked
        // up from the source task when the caller didn't supply it. Deploy-only —
        // the server never broadcasts it to students.
        let src: Task | undefined
        let srcLessonId: string | undefined
        for (const mod of nodes) {
          for (const lesson of mod.lessons) {
            const found = lesson.tasks?.find(t => t.id === payload.id)
            if (found) {
              src = found
              srcLessonId = lesson.id
              break
            }
            // Also match assessments/homework so their deploys carry the lesson.
            if (
              lesson.assessments?.some(a => a.id === payload.id) ||
              lesson.homework?.some(h => h.id === payload.id)
            ) {
              srcLessonId = lesson.id
              break
            }
          }
          if (srcLessonId) break
        }
        // Deploy-safety: strip the answer key out of the student-facing dmiItems
        // and carry it separately as `answerKey` (server-only, for grading). Every
        // deploy path routes through here, so this is the single guarantee that
        // answers/rubrics never reach students. Block if anything still leaks.

        // ASMT-12 gradability gate (assessment-only): the assessment must be
        // internally consistent and fully gradable before deploy — no duplicate
        // question numbers, every open (short/long) question has a rubric
        // pathway, and every closed (mcq/…) question has an answer key. Runs on
        // the RAW items (which still carry answers/rubrics). This blocks, e.g.,
        // deploying a configured MCQ paper before all correct options are set.
        if (payload.source === 'assessment') {
          const issues = reverifyAssessment((payload.dmiItems ?? []) as unknown as ReverifyItem[])
          if (issues.length > 0) {
            const shown = issues
              .slice(0, 3)
              .map(i => i.message)
              .join(' ')
            const more = issues.length > 3 ? ` (+${issues.length - 3} more)` : ''
            toast.error(`Cannot deploy — ${shown}${more}`)
            return
          }
        }

        const {
          dmiItems: safeDmiItems,
          answerKey,
          leaks,
        } = buildStudentDeployPayload(
          payload.dmiItems as unknown as RawDeployDmiItem[] | undefined,
          payload.answerKey
        )
        if (leaks.length > 0) {
          console.error('[deploy] evaluation-layer leak blocked:', leaks)
          toast.error('Answer data was present in the student view. Deploy blocked.')
          return
        }

        const enriched: LiveTask = {
          ...payload,
          dmiItems: safeDmiItems,
          answerKey,
          pci:
            payload.pci ?? (typeof src?.instructions === 'string' ? src.instructions : undefined),
          pciSpec: payload.pciSpec ?? src?.pciSpec,
          // The lesson this material was deployed from, so the server tags it with
          // the real lesson (not "Lesson 1").
          lessonId: payload.lessonId ?? srcLessonId,
        }
        setDeployDialog({
          run: reveal => insightsProps?.onDeployTask?.({ ...enriched, answerReveal: reveal }),
        })
      },
      [insightsProps, nodes]
    )

    // Active tab tracking for Enter button
    const [taskBuilderActiveTab, setTaskBuilderActiveTab] = useState<'content' | 'pci'>('content')
    const [assessmentBuilderActiveTab, setAssessmentBuilderActiveTab] = useState<'content' | 'pci'>(
      'content'
    )

    // Main builder tab (task vs assessment)
    const [mainBuilderTab, setMainBuilderTab] = useState<'task' | 'assessment'>('task')

    // NOTE: we deliberately do NOT auto-notify the parent of `mainTab` from an
    // effect. The parent (route) is the source of truth; it flows `mainTab` down
    // as a prop and we mirror it locally via the sync effect below. Every genuine
    // LOCAL change already notifies the parent directly at its action site (the
    // Tabs onValueChange and the DMI-load handler both call onMainTabChange).
    // An automatic effect that pushed local→parent raced the parent→local sync
    // one render apart and ping-ponged the tab forever (React #185 — first
    // builder↔test-pci, then test-pci↔live). Direct-notify-only breaks the race.

    // Blank-slate the builder only on the FIRST entry into the Build tab — NOT on
    // every Build click. Re-running it on each visit wiped an in-progress DMI
    // (version history + items) the moment a tutor switched to Test/Classroom and
    // back, because the DMI lives in local state and is only auto-saved once a
    // task is loaded. Resetting once preserves work across tab navigation.
    const didBlankSlateRef = useRef(false)
    useEffect(() => {
      if (mainTab !== 'builder') return
      if (didBlankSlateRef.current) return
      didBlankSlateRef.current = true
      setLoadedTaskId(null)
      setLoadedAssessmentId(null)
      setTaskBuilder({
        title: '',
        taskContent: '',
        taskPci: '',
        details: '',
        extensions: [],
        activeExtensionId: null,
      })
      setAssessmentBuilder({
        title: '',
        taskContent: '',
        taskPci: '',
        details: '',
        extensions: [],
        activeExtensionId: null,
      })
      setTaskBuilderActiveTab('content')
      setAssessmentBuilderActiveTab('content')
      setMainBuilderTab('task')
      setSelectedItem(null)
      setTaskSourceDocument(undefined)
      setAssessmentSourceDocument(undefined)
      setAssessmentSourceReferenceOnly(false)
      setTaskDmiItems([])
      setAssessmentDmiItems([])
      setTaskDmiVersions([])
      setAssessmentDmiVersions([])
      setShowDmiVersionList(false)
      setPreviewDmiVersion(null)
      resetPciRef.current()
      setAiAssistOpen(false)
      setTaskAiMessages([])
      setAssessmentAiMessages([])
      setTaskUploadedFiles([])
      setAssessmentUploadedFiles([])
    }, [mainTab])

    // Depend on a STABLE boolean, not the insightsProps object. The parent
    // recreates insightsProps on every render, so depending on the object made
    // this effect re-run every render and, because it setStates a fresh array,
    // it looped infinitely (React #185 "Maximum update depth exceeded" — seen
    // when loading a DMI, which switches to the test-pci tab). The body only
    // needs to know whether insights mode is active.
    const insightsActive = !!insightsProps
    useEffect(() => {
      if (!insightsActive) return
      const next =
        mainTab === 'test-pci'
          ? [
              { id: 'classroom', label: 'Classroom' },
              { id: 'student1', label: 'Test Student 1' },
              { id: 'student2', label: 'Test Student 2' },
            ]
          : mainTab === 'live'
            ? [
                { id: 'classroom', label: 'Classroom' },
                { id: 'student1', label: 'Whiteboards' },
                { id: 'student-monitor', label: 'Monitor' },
                { id: 'insights', label: 'Insights' },
              ]
            : null
      if (!next) return
      // Bail if the tab set is unchanged so we never setState a fresh array on
      // every run (the other half of the loop).
      setTestPciTabs(prev =>
        prev.length === next.length &&
        prev.every((t, i) => t.id === next[i].id && t.label === next[i].label)
          ? prev
          : next
      )
    }, [insightsActive, mainTab])

    const visibleTestPciTabs = useMemo(
      () => (mainTab === 'live' ? testPciTabs.filter(tab => tab.id !== 'insights') : testPciTabs),
      [mainTab, testPciTabs]
    )

    useEffect(() => {
      if (mainTab !== 'live') return
      if (testPciActiveTab === 'insights') {
        setTestPciActiveTab('classroom')
      }
    }, [mainTab, testPciActiveTab])

    // Live session context
    const [sessionContext, setSessionContext] = useState<{
      topic: string | null
      objectives: string[] | null
      category: string | null
      nationality: string | null
      languageOfInstruction: string | null
      roomUrl: string | null
      token: string | null
      // 1-on-1 (<=2 seats): both sides transmit, so the tutor's video renders the
      // other participant's camera (see DailyVideoFrame twoWay).
      twoWay: boolean
    } | null>(null)
    // Student roster is maintained upstream in insights/page.tsx (socket handlers)
    // and passed via insightsProps.students so it survives remounts.
    const activeSession = insightsProps?.sessionId
      ? insightsProps.sessions?.find(s => s.id === insightsProps.sessionId)
      : null
    const isSessionActive = activeSession?.status === 'active'

    // Load tutor's default mirroring preferences from localStorage
    useEffect(() => {
      if (!isSessionActive) return
      try {
        const raw = localStorage.getItem('tutor-mirror-preferences')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.defaultMirrorClass) {
            setIsMirroringToStudents(true)
            setTestPciActiveTab('classroom')
          } else if (parsed.defaultMirrorBoard) {
            setIsMirroringToStudents(true)
            setTestPciActiveTab('student1')
          }
        }
      } catch {
        // ignore
      }
    }, [isSessionActive])

    const [importTypeModalData, setImportTypeModalData] = useState<{
      target: { nodeId: string; lessonId: string }
      items: { questionText: string; pciText: string }[]
    } | null>(null)

    // PPT Upload Option Dialog state
    const [pptUploadDialog, setPptUploadDialog] = useState<{
      isOpen: boolean
      file: File | null
      target: 'task' | 'assessment' | null
    }>({ isOpen: false, file: null, target: null })

    // Track currently loaded item for saving back
    const [loadedTaskId, setLoadedTaskId] = useState<string | null>(null)
    const [loadedAssessmentId, setLoadedAssessmentId] = useState<string | null>(null)

    const canMirrorToStudents = !!(
      insightsProps?.sessionId &&
      insightsProps?.socket &&
      !isStudentView &&
      isSessionActive &&
      isMirroringToStudents
    )

    // Sync tutor's active state to students for "Screen Mirroring"
    useEffect(() => {
      if (!canMirrorToStudents) {
        return
      }

      const activeTab =
        testPciActiveTab === 'student1'
          ? 'whiteboards'
          : testPciActiveTab === 'classroom'
            ? 'classroom'
            : null

      if (!activeTab) return

      // Only sync activeTaskId if the task has been deployed to the session
      const deployedTaskIds = new Set(insightsProps?.liveTasks?.map((t: any) => t.id) ?? [])
      const candidateTaskId = loadedTaskId || loadedAssessmentId || null
      const activeTaskId =
        candidateTaskId && deployedTaskIds.has(candidateTaskId) ? candidateTaskId : null

      const statePayload = {
        activeTab,
        activeTaskId,
      }
      if (!insightsProps?.socket || !insightsProps?.sessionId) {
        return
      }
      insightsProps.socket.emit('insight:send', {
        roomId: insightsProps.sessionId,
        type: 'tutor:state_sync',
        payload: statePayload,
      })
    }, [
      testPciActiveTab,
      loadedTaskId,
      loadedAssessmentId,
      insightsProps?.sessionId,
      insightsProps?.socket,
      isStudentView,
      isSessionActive,
      canMirrorToStudents,
    ])

    const [extractedTextFontSizeMap, setExtractedTextFontSizeMap] = useState<
      Record<string, number>
    >({})
    const activeItemId = mainBuilderTab === 'assessment' ? loadedAssessmentId : loadedTaskId
    const extractedTextFontSize = activeItemId ? (extractedTextFontSizeMap[activeItemId] ?? 18) : 18
    const setExtractedTextFontSize = (val: number) => {
      if (activeItemId) setExtractedTextFontSizeMap(prev => ({ ...prev, [activeItemId]: val }))
    }
    // In the LIVE view the poll/question composer targets this task. When no
    // task is loaded in the builder (the common case — the tutor is just running
    // the live session), fall back to the most-recently-deployed live task so the
    // composer has a real target and the Send button isn't permanently disabled.
    const loadedInsightsTaskId = mainBuilderTab === 'assessment' ? loadedAssessmentId : loadedTaskId
    // Fall back to the most-recently-deployed live task whenever one exists, so
    // the poll/question composer has a target and its Send button is active —
    // the composer only shows in a live session, so gating on the exact mainTab
    // value was too strict and left Send permanently disabled.
    const activeInsightsTaskId =
      loadedInsightsTaskId ??
      insightsProps?.liveTasks?.[(insightsProps.liveTasks?.length ?? 0) - 1]?.id ??
      null
    const activeInsightsTask = activeInsightsTaskId
      ? (nodes
          .flatMap(n => n.lessons.flatMap(l => [...l.tasks, ...(l.homework || [])]))
          .find(item => item.id === activeInsightsTaskId) ?? null)
      : null

    // Insights panel state (per item)
    const [insightsTabMap, setInsightsTabMap] = useState<
      Record<string, 'analytics' | 'poll' | 'question'>
    >({})
    const [pollPromptMap, setPollPromptMap] = useState<Record<string, string>>({})
    // Poll option set per task: 'letters' (A–E), 'tf' (True/False), 'yn' (Yes/No)
    const [pollOptionModeMap, setPollOptionModeMap] = useState<
      Record<string, '1-10' | 'likert' | 'ae' | 'tf' | 'yn'>
    >({})
    const [pollCustomOptionsMap, setPollCustomOptionsMap] = useState<Record<string, string>>({})
    // Custom Likert scale labels per task (global defaults, editable)
    const [pollLikertLabelsMap, setPollLikertLabelsMap] = useState<Record<string, string[]>>({})
    const DEFAULT_LIKERT_LABELS = [
      'Strongly Disagree',
      'Disagree',
      'Neutral',
      'Agree',
      'Strongly Agree',
    ]
    const [questionPromptMap, setQuestionPromptMap] = useState<Record<string, string>>({})
    const [showAIPollMap, setShowAIPollMap] = useState<Record<string, boolean>>({})
    const [pollComposeModeMap, setPollComposeModeMap] = useState<Record<string, boolean>>({})
    const [speedDialOpenMap, setSpeedDialOpenMap] = useState<Record<string, boolean>>({})
    const [showAIQuestionMap, setShowAIQuestionMap] = useState<Record<string, boolean>>({})

    const currentInsightsId =
      mainBuilderTab === 'task' && taskBuilder.activeExtensionId
        ? taskBuilder.activeExtensionId
        : activeInsightsTaskId || 'default'
    const insightsTab = insightsTabMap[currentInsightsId] ?? 'analytics'

    // Real poll/question results for the active task, derived from the live
    // (socket-updated) task's responses — not authored builder content. Feeds
    // InsightsReportView so the Insights tab reflects actual student answers.
    const studentNameById = useMemo(() => {
      const map = new Map<string, string>()
      for (const s of insightsProps?.students ?? []) map.set(s.id, s.name)
      return map
    }, [insightsProps?.students])

    const activeLiveTask = useMemo(
      () => (insightsProps?.liveTasks ?? []).find(t => t.id === currentInsightsId) ?? null,
      [insightsProps?.liveTasks, currentInsightsId]
    )

    // Tutor closes a poll/question: server locks it and no more answers land.
    const handleCloseInsight = useCallback(
      (kind: 'poll' | 'question', insightId: string) => {
        const socket = insightsProps?.socket
        const roomId = insightsProps?.sessionId
        const taskId = activeLiveTask?.id
        if (!socket || !roomId || !taskId) return
        socket.emit('insight:close', { roomId, taskId, type: kind, insightId })
      },
      [insightsProps?.socket, insightsProps?.sessionId, activeLiveTask?.id]
    )

    // ALL polls for the active task (newest first) so sending a new poll no
    // longer hides the previous ones. Each option's tally is by 0-based index,
    // labelled from the poll's optionLabels (True/False, Yes/No, custom) with an
    // A/B/C… fallback for legacy polls.
    const getPollPlaceholder = (mode: string): string => {
      if (mode === '1-10') return 'On a scale of 1 to 10, how difficult did you find this task?'
      if (mode === 'likert') return 'Did you find this task difficult?'
      if (mode === 'tf') return 'The explanation to your answer was clear and concise?'
      if (mode === 'yn') return 'Did you complete all your homework tasks?'
      return 'Type your poll question here...'
    }

    const pollResults = useMemo<PollResultBlock[]>(() => {
      const polls = activeLiveTask?.polls ?? []
      return polls
        .map(poll => {
          const total = poll.responses.length
          const optionCount = poll.options?.length ?? 0
          return {
            id: poll.id,
            question: poll.question,
            totalResponses: total,
            closed: poll.status === 'closed',
            options: Array.from({ length: optionCount }, (_, i) => {
              const responders = poll.responses.filter(r => r.value === i)
              return {
                label: poll.optionLabels?.[i] ?? `Option ${String.fromCharCode(65 + i)}`,
                count: responders.length,
                percent: total > 0 ? Math.round((responders.length / total) * 100) : 0,
                students: responders.map(r => studentNameById.get(r.studentId) || 'Student'),
              }
            }),
          }
        })
        .reverse()
    }, [activeLiveTask, studentNameById])

    // ALL questions for the active task (newest first), each with its answers.
    const questionResults = useMemo<QuestionResultBlock[]>(() => {
      const questions = activeLiveTask?.questions ?? []
      return questions
        .map(q => ({
          id: q.id,
          prompt: q.prompt,
          closed: (q as { status?: string }).status === 'closed',
          answers: q.responses.map(r => ({
            studentName: studentNameById.get(r.studentId) || 'Student',
            answer: r.answer,
          })),
        }))
        .reverse()
    }, [activeLiveTask, studentNameById])

    const setInsightsTab = (val: 'analytics' | 'poll' | 'question') =>
      setInsightsTabMap(prev => ({ ...prev, [currentInsightsId]: val }))

    const showAIPoll = showAIPollMap[currentInsightsId] ?? false
    const setShowAIPoll = (val: boolean) =>
      setShowAIPollMap(prev => ({ ...prev, [currentInsightsId]: val }))

    const pollComposeMode = pollComposeModeMap[currentInsightsId] ?? true
    const setPollComposeMode = (val: boolean) =>
      setPollComposeModeMap(prev => ({ ...prev, [currentInsightsId]: val }))

    const speedDialOpen = speedDialOpenMap[currentInsightsId] ?? false
    const setSpeedDialOpen = (val: boolean) =>
      setSpeedDialOpenMap(prev => ({ ...prev, [currentInsightsId]: val }))

    const showAIQuestion = showAIQuestionMap[currentInsightsId] ?? false
    const setShowAIQuestion = (val: boolean) =>
      setShowAIQuestionMap(prev => ({ ...prev, [currentInsightsId]: val }))

    const pollOptionMode = pollOptionModeMap[currentInsightsId] ?? '1-10'
    const setPollOptionMode = (val: '1-10' | 'likert' | 'ae' | 'tf' | 'yn') =>
      setPollOptionModeMap(prev => ({ ...prev, [currentInsightsId]: val }))

    const pollPrompt = pollPromptMap[currentInsightsId] ?? getPollPlaceholder(pollOptionMode)
    const setPollPrompt = (val: string) =>
      setPollPromptMap(prev => ({ ...prev, [currentInsightsId]: val }))
    const pollCustomOptions = pollCustomOptionsMap[currentInsightsId] ?? ''
    const setPollCustomOptions = (val: string) =>
      setPollCustomOptionsMap(prev => ({ ...prev, [currentInsightsId]: val }))

    // Likert label helpers
    const likertLabels = pollLikertLabelsMap[currentInsightsId] ?? DEFAULT_LIKERT_LABELS
    const setLikertLabel = (index: number, value: string) => {
      setPollLikertLabelsMap(prev => {
        const current = prev[currentInsightsId] ?? [...DEFAULT_LIKERT_LABELS]
        const updated = [...current]
        updated[index] = value
        return { ...prev, [currentInsightsId]: updated }
      })
    }
    const deleteLikertLabel = (index: number) => {
      setPollLikertLabelsMap(prev => {
        const current = prev[currentInsightsId] ?? [...DEFAULT_LIKERT_LABELS]
        if (current.length <= 2) return prev
        const updated = current.filter((_, i) => i !== index)
        return { ...prev, [currentInsightsId]: updated }
      })
    }
    const addLikertLabel = () => {
      setPollLikertLabelsMap(prev => {
        const current = prev[currentInsightsId] ?? [...DEFAULT_LIKERT_LABELS]
        return { ...prev, [currentInsightsId]: [...current, 'New Option'] }
      })
    }

    const resolvePollOptions = (): string[] | undefined => {
      // '1-10' is the DEFAULT mode; without this case it returned undefined and
      // the server fell back to A–E, so students saw the wrong options.
      if (pollOptionMode === '1-10') return Array.from({ length: 10 }, (_, i) => String(i + 1))
      if (pollOptionMode === 'tf') return ['True', 'False']
      if (pollOptionMode === 'yn') return ['Yes', 'No']
      if (pollOptionMode === 'likert') {
        const custom = pollLikertLabelsMap[currentInsightsId]
        return custom && custom.length >= 2 ? custom : DEFAULT_LIKERT_LABELS
      }
      if (pollOptionMode === 'ae') return ['A', 'B', 'C', 'D', 'E']
      return undefined
    }

    // Shared option-set picker rendered above every poll composer. Preset chips
    // + a custom field (one option per line / comma-separated).
    const POLL_OPTION_PRESETS: {
      id: '1-10' | 'likert' | 'ae' | 'tf' | 'yn'
      label: string
    }[] = [
      { id: '1-10', label: '1–10' },
      { id: 'likert', label: 'Likert' },
      { id: 'ae', label: 'A–E' },
      { id: 'tf', label: 'True/False' },
      { id: 'yn', label: 'Yes/No' },
    ]
    const questionPrompt =
      questionPromptMap[currentInsightsId] ?? 'Do you have a question about this task?'
    const setQuestionPrompt = (val: string) =>
      setQuestionPromptMap(prev => ({ ...prev, [currentInsightsId]: val }))

    const mentionItems: MentionItem[] = useMemo(() => {
      const items: MentionItem[] = []
      nodes.forEach((node, nIdx) => {
        const lesson = node.lessons[0]
        if (!lesson) return
        items.push({
          id: lesson.id,
          type: 'lesson',
          label: lesson.title || `Lesson ${nIdx + 1}`,
          subtitle: `Lesson ${nIdx + 1}`,
        })
        lesson.tasks?.forEach((task, tIdx) => {
          items.push({
            id: task.id,
            type: 'task',
            label: task.title || `Task ${tIdx + 1}`,
            subtitle: `Lesson ${nIdx + 1}, Task ${tIdx + 1}`,
          })
          task.extensions?.forEach((ext, eIdx) => {
            items.push({
              id: ext.id,
              type: 'extension',
              label: ext.name || `Extension ${eIdx + 1}`,
              subtitle: `Lesson ${nIdx + 1}, Task ${tIdx + 1}, Extension ${eIdx + 1}`,
            })
          })
          task.dmiItems?.forEach((dmi, dIdx) => {
            items.push({
              id: dmi.id,
              type: 'dmi',
              label: dmi.questionText || `DMI ${dIdx + 1}`,
              subtitle: `Lesson ${nIdx + 1}, Task ${tIdx + 1}, DMI ${dIdx + 1}`,
            })
          })
        })
        const assessments = (lesson.homework || []).filter(h => h.category === 'assessment')
        assessments.forEach((assessment, aIdx) => {
          items.push({
            id: assessment.id,
            type: 'assessment',
            label: assessment.title || `Assessment ${aIdx + 1}`,
            subtitle: `Lesson ${nIdx + 1}, Assessment ${aIdx + 1}`,
          })
          assessment.dmiItems?.forEach((dmi, dIdx) => {
            items.push({
              id: dmi.id,
              type: 'dmi',
              label: dmi.questionText || `DMI ${dIdx + 1}`,
              subtitle: `Lesson ${nIdx + 1}, Assessment ${aIdx + 1}, DMI ${dIdx + 1}`,
            })
          })
        })
      })
      return items
    }, [nodes])

    const selectedContextLabel = useMemo(() => {
      if (loadedTaskId) {
        for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
          const lesson = nodes[nIdx].lessons[0]
          if (!lesson) continue
          const tIdx = lesson.tasks.findIndex(t => t.id === loadedTaskId)
          if (tIdx !== -1) {
            if (taskBuilder.activeExtensionId) {
              const extIdx = taskBuilder.extensions.findIndex(
                e => e.id === taskBuilder.activeExtensionId
              )
              return `Lesson ${nIdx + 1}, Task ${tIdx + 1}, Extension ${extIdx + 1}`
            }
            return `Lesson ${nIdx + 1}, Task ${tIdx + 1}`
          }
        }
      }
      if (loadedAssessmentId) {
        for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
          const lesson = nodes[nIdx].lessons[0]
          if (!lesson) continue
          const hwItem = (lesson.homework || []).find(h => h.id === loadedAssessmentId)
          if (hwItem) {
            const isHomework = hwItem.category === 'homework'
            const list = (lesson.homework || []).filter(h =>
              isHomework ? h.category === 'homework' : h.category !== 'homework'
            )
            const idx = list.findIndex(h => h.id === loadedAssessmentId)
            return `Lesson ${nIdx + 1}, ${isHomework ? 'Homework' : 'Assessment'} ${idx + 1}`
          }
        }
      }
      // Check for quizzes (nodeQuiz)
      for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
        const qIdx = nodes[nIdx].quizzes?.findIndex((q: any) => q.id === selectedItem?.id)
        if (qIdx !== -1 && qIdx !== undefined) return `Lesson ${nIdx + 1}, Quiz ${qIdx + 1}`
      }
      return null
    }, [
      nodes,
      loadedTaskId,
      loadedAssessmentId,
      taskBuilder.activeExtensionId,
      taskBuilder.extensions,
    ])

    const loadTaskIntoBuilder = useCallback(
      (task: Task, activeExtensionId: string | null = null) => {
        // Prioritize description over sourceDocument - description holds edited content
        const content = task.description || task.sourceDocument?.extractedText || ''
        setTaskBuilder({
          title: task.title || '',
          taskContent: content,
          taskPci: task.instructions || '',
          details: task.shortDescription || '',
          // TASK-18: carry the PCI approval audit log so saves preserve/extend it.
          pciHistory: task.pciHistory,
          // TASK-6: carry the current approved structured spec.
          pciSpec: task.pciSpec,
          sourceDocument: task.sourceDocument,
          extensions: (task.extensions || []).map(ext => ({
            ...ext,
            description: ext.description || '',
            sourceDocument: ext.sourceDocument,
          })),
          activeExtensionId,
        })
        setTaskDmiItems(task.dmiItems || [])
        // Rehydrate the DMI source kind so the PCI-chat study-material variant
        // applies for a returning tutor, not just in the generation session.
        setDmiDocumentKind(prev => ({
          ...prev,
          // Backfill pre-fix DMIs (no saved kind) from answer provenance.
          task:
            task.documentKind ??
            inferDocumentKindFromProvenance((task.dmiItems ?? []).map(i => i.answerProvenance)),
        }))
        // Normalize persisted versions so `items` is always an array — a legacy /
        // partially-saved version with a missing items array would otherwise crash
        // the DMI version-list / preview dialogs (rendered at the root, outside the
        // panel error boundary, so it dark-screens the whole app).
        setTaskDmiVersions(
          (task.dmiVersions || []).map(v => ({
            ...v,
            items: Array.isArray(v.items) ? v.items : [],
          }))
        )
        setTestPciSource('task')
        if (task.activeDmiVersionId) {
          setTestPciViewMode(`dmi_${task.activeDmiVersionId}`)
        } else {
          setTestPciViewMode('pdf')
        }
        loadPciMessagesRef.current({ kind: 'task' }, parsePciTranscript(task.instructions || ''))
        for (const ext of task.extensions || []) {
          loadPciMessagesRef.current(
            { kind: 'taskExtension', id: ext.id },
            parsePciTranscript(ext.pci || '')
          )
        }
        setLoadedTaskId(task.id)
        setTaskUploadedFiles(
          task.sourceDocument ? [{ id: 'source', name: task.sourceDocument.fileName }] : []
        )
        setTaskSourceDocument(task.sourceDocument)
        setTaskBuilderActiveTab('content')
      },
      []
    )

    // Load assessment data into assessmentBuilder
    const loadAssessmentIntoBuilder = useCallback((assessment: Assessment) => {
      const content = assessment.description || assessment.sourceDocument?.extractedText || ''
      setAssessmentBuilder({
        title: assessment.title || '',
        taskContent: content,
        taskPci: assessment.instructions || '',
        pciSpec: assessment.pciSpec,
        details: '',
        sourceDocument: assessment.sourceDocument,
        extensions: [],
        activeExtensionId: null,
      })
      setAssessmentDmiItems(assessment.dmiItems || [])
      // Rehydrate the DMI source kind so the PCI-chat study-material variant
      // applies for a returning tutor, not just in the generation session.
      setDmiDocumentKind(prev => ({
        ...prev,
        // Backfill pre-fix DMIs (no saved kind) from answer provenance.
        assessment:
          assessment.documentKind ??
          inferDocumentKindFromProvenance((assessment.dmiItems ?? []).map(i => i.answerProvenance)),
      }))
      // Normalize so every version's `items` is an array (see task note above).
      setAssessmentDmiVersions(
        (assessment.dmiVersions || []).map(v => ({
          ...v,
          items: Array.isArray(v.items) ? v.items : [],
        }))
      )
      setTestPciSource('assessment')
      if (assessment.activeDmiVersionId) {
        setTestPciViewMode(`dmi_${assessment.activeDmiVersionId}`)
      } else {
        setTestPciViewMode('pdf')
      }
      setLoadedAssessmentId(assessment.id)
      setAssessmentUploadedFiles(
        assessment.sourceDocument
          ? [{ id: 'source', name: assessment.sourceDocument.fileName }]
          : []
      )
      setAssessmentSourceDocument(assessment.sourceDocument)
      setAssessmentSourceReferenceOnly(false)
      setAssessmentBuilderActiveTab('content')
    }, [])

    // Load tutor assets from API on mount
    useEffect(() => {
      const loadAssets = async () => {
        try {
          const res = await fetch('/api/tutor/assets', { credentials: 'include' })
          if (res.ok) {
            const data = await res.json()
            assetsLoadedRef.current = true
            if (data.assets && Array.isArray(data.assets)) {
              skipNextAssetsSaveRef.current = true
              setCourseAssets(prev => {
                const merged = new Map<string, any>()
                prev.forEach(a => merged.set(a.id, a))
                data.assets.forEach((a: any) => {
                  merged.set(a.id, {
                    ...a,
                    fileKey: a.fileKey || undefined,
                    folder:
                      (a.metadata?.folder as string) ||
                      (a.metadata?.folderName as string) ||
                      undefined,
                  })
                })
                return Array.from(merged.values())
              })
            }
          }
        } catch (error) {
          console.error('Failed to load tutor assets:', error)
        }
      }
      loadAssets()
    }, [])

    useEffect(() => {
      if (!insightsProps?.sessionId) return
      let cancelled = false
      const loadSession = async () => {
        try {
          const res = await fetch(`/api/tutor/classes/${insightsProps.sessionId}`, {
            credentials: 'include',
          })
          if (!res.ok) return
          const data = await res.json()
          if (cancelled) return
          setSessionContext({
            topic: data?.session?.topic ?? null,
            objectives: data?.session?.objectives ?? null,
            category: data?.session?.category ?? null,
            nationality: data?.session?.nationality ?? null,
            languageOfInstruction: data?.session?.languageOfInstruction ?? null,
            roomUrl: data?.session?.roomUrl ?? null,
            token: data?.session?.token ?? null,
            twoWay: (data?.session?.maxStudents ?? 0) <= 2,
          })
          // Student roster maintained upstream in insights/page.tsx
        } catch {
          // ignore
        }
      }
      loadSession()
      return () => {
        cancelled = true
      }
    }, [insightsProps?.sessionId])

    // Student roster is maintained upstream in insights/page.tsx via socket
    // onStudentJoined / onStudentLeft / onRoomState so it survives CourseBuilder remounts.

    // Countdown timer removed — kept in CourseBuilderInsightsRoute header instead

    // Save tutor assets to API when they change (debounced)
    const saveAssetsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const saveAssetsToApi = useCallback(
      async (assets: typeof courseAssets) => {
        try {
          const payloadAssets = assets.map(a => ({
            ...a,
            metadata: a.folder ? { folder: a.folder } : undefined,
          }))

          const res = await fetchWithCsrf('/api/tutor/assets', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assets: payloadAssets }),
          })

          if (!res.ok) {
            console.error('Failed to save tutor assets')
          }
        } catch (error) {
          console.error('Error saving tutor assets:', error)
        }
      },
      // No reactive deps: the callback only reads its `assets` argument and the
      // module-level fetchWithCsrf. A stale `[insightsProps]` here re-created the
      // callback every render and needlessly re-armed the debounced save timer.
      []
    )

    // Debounced assets save
    useEffect(() => {
      if (!assetsLoadedRef.current) return
      if (skipNextAssetsSaveRef.current) {
        skipNextAssetsSaveRef.current = false
        return
      }
      if (saveAssetsTimeoutRef.current) {
        clearTimeout(saveAssetsTimeoutRef.current)
      }
      saveAssetsTimeoutRef.current = setTimeout(() => {
        saveAssetsToApi(courseAssets)
      }, 2000) // Save after 2 seconds of inactivity

      return () => {
        if (saveAssetsTimeoutRef.current) {
          clearTimeout(saveAssetsTimeoutRef.current)
        }
      }
    }, [courseAssets, saveAssetsToApi])

    // Auto-save task on the fly (debounced)
    useEffect(() => {
      if (!canEdit) return
      if (!loadedTaskId) return

      const timeoutId = setTimeout(() => {
        // Equality-guarded write: if nothing about the loaded task actually
        // changed, return `prev` unchanged so `nodes` keeps its identity. A new
        // identity would trip the live-session edit detector (setHasUnsyncedChanges
        // -> onUnsyncedChangesChange -> parent re-render -> new insightsProps ->
        // re-render -> re-arm), which with DMI items present never converges and
        // throws React #185 (max update depth).
        setCourseBuilderNodes(prev => {
          let changed = false
          const next = prev.map(mod => ({
            ...mod,
            lessons: mod.lessons.map(lesson => ({
              ...lesson,
              tasks: lesson.tasks.map(task => {
                if (task.id !== loadedTaskId) return task
                const nextActiveDmiVersionId =
                  testPciSource === 'task' && testPciViewMode.startsWith('dmi_')
                    ? testPciViewMode.replace('dmi_', '')
                    : task.activeDmiVersionId
                if (
                  task.title === taskBuilder.title &&
                  task.shortDescription === taskBuilder.details &&
                  task.description === taskBuilder.taskContent &&
                  task.instructions === taskBuilder.taskPci &&
                  task.extensions === taskBuilder.extensions &&
                  task.dmiItems === taskDmiItems &&
                  task.documentKind === (dmiDocumentKind.task ?? task.documentKind) &&
                  task.dmiVersions === taskDmiVersions &&
                  task.activeDmiVersionId === nextActiveDmiVersionId &&
                  task.sourceDocument === taskBuilder.sourceDocument
                ) {
                  return task
                }
                changed = true
                return {
                  ...task,
                  title: taskBuilder.title,
                  shortDescription: taskBuilder.details,
                  description: taskBuilder.taskContent,
                  instructions: taskBuilder.taskPci,
                  // TASK-18: persist the PCI approval audit log with the task.
                  pciHistory: taskBuilder.pciHistory,
                  // TASK-6: persist the current approved structured spec.
                  pciSpec: taskBuilder.pciSpec,
                  extensions: taskBuilder.extensions,
                  dmiItems: taskDmiItems,
                  // Preserve the persisted kind when the session hasn't set one.
                  documentKind: dmiDocumentKind.task ?? task.documentKind,
                  dmiVersions: taskDmiVersions,
                  activeDmiVersionId: nextActiveDmiVersionId,
                  sourceDocument: taskBuilder.sourceDocument,
                }
              }),
            })),
          }))
          return changed ? next : prev
        })
      }, 1000) // Auto-save after 1 second of inactivity

      return () => clearTimeout(timeoutId)
    }, [
      taskBuilder.title,
      taskBuilder.details,
      taskBuilder.taskContent,
      taskBuilder.taskPci,
      taskBuilder.extensions,
      taskBuilder.sourceDocument,
      taskDmiItems,
      taskDmiVersions,
      dmiDocumentKind.task,
      testPciSource,
      testPciViewMode,
      loadedTaskId,
    ])

    // Auto-save assessment on the fly (debounced)
    useEffect(() => {
      if (!canEdit) return
      if (!loadedAssessmentId) return

      const timeoutId = setTimeout(() => {
        // Equality-guarded write — see the task auto-save above. Returning `prev`
        // when the assessment is unchanged keeps `nodes` identity stable and
        // prevents the live-session unsynced-changes feedback loop (React #185)
        // that fires once a loaded DMI has items.
        setCourseBuilderNodes(prev => {
          let changed = false
          const next = prev.map(mod => ({
            ...mod,
            lessons: mod.lessons.map(lesson => ({
              ...lesson,
              homework: lesson.homework.map(hw => {
                if (hw.id !== loadedAssessmentId) return hw
                const nextActiveDmiVersionId =
                  testPciSource === 'assessment' && testPciViewMode.startsWith('dmi_')
                    ? testPciViewMode.replace('dmi_', '')
                    : hw.activeDmiVersionId
                if (
                  hw.title === assessmentBuilder.title &&
                  hw.description === assessmentBuilder.taskContent &&
                  hw.instructions === assessmentBuilder.taskPci &&
                  hw.pciSpec === assessmentBuilder.pciSpec &&
                  hw.dmiItems === assessmentDmiItems &&
                  hw.documentKind === (dmiDocumentKind.assessment ?? hw.documentKind) &&
                  hw.dmiVersions === assessmentDmiVersions &&
                  hw.activeDmiVersionId === nextActiveDmiVersionId &&
                  hw.sourceDocument === assessmentBuilder.sourceDocument
                ) {
                  return hw
                }
                changed = true
                return {
                  ...hw,
                  title: assessmentBuilder.title,
                  description: assessmentBuilder.taskContent,
                  instructions: assessmentBuilder.taskPci,
                  pciSpec: assessmentBuilder.pciSpec,
                  dmiItems: assessmentDmiItems,
                  // Preserve the persisted kind when the session hasn't set one.
                  documentKind: dmiDocumentKind.assessment ?? hw.documentKind,
                  dmiVersions: assessmentDmiVersions,
                  activeDmiVersionId: nextActiveDmiVersionId,
                  sourceDocument: assessmentBuilder.sourceDocument,
                }
              }),
            })),
          }))
          return changed ? next : prev
        })
      }, 1000) // Auto-save after 1 second of inactivity

      return () => clearTimeout(timeoutId)
    }, [
      assessmentBuilder.title,
      assessmentBuilder.taskContent,
      assessmentBuilder.taskPci,
      assessmentBuilder.pciSpec,
      assessmentBuilder.sourceDocument,
      assessmentDmiItems,
      assessmentDmiVersions,
      dmiDocumentKind.assessment,
      testPciSource,
      testPciViewMode,
      loadedAssessmentId,
    ])

    // Sync active builder content to classroom tab when in insights mode
    useEffect(() => {
      if (!insightsActive) return
      if (mainTab !== 'test-pci') return

      let contentToDisplay: string | null = null
      if (mainBuilderTab === 'task' && loadedTaskId) {
        const activeTaskExtension = taskBuilder.activeExtensionId
          ? taskBuilder.extensions.find(ext => ext.id === taskBuilder.activeExtensionId)
          : null
        contentToDisplay = activeTaskExtension
          ? activeTaskExtension.content
          : taskBuilder.taskContent
      } else if (mainBuilderTab === 'assessment' && loadedAssessmentId) {
        contentToDisplay = assessmentBuilder.taskContent
      }
      if (contentToDisplay == null) return
      const classroom = contentToDisplay || ''
      // Bail when unchanged so we don't setState a new object every render
      // (depending on the unstable insightsProps object caused React #185).
      setTestPciContent(prev => (prev.classroom === classroom ? prev : { ...prev, classroom }))
    }, [
      mainBuilderTab,
      loadedTaskId,
      taskBuilder.activeExtensionId,
      taskBuilder.taskContent,
      taskBuilder.extensions,
      loadedAssessmentId,
      assessmentBuilder.taskContent,
      insightsActive,
      mainTab,
    ])

    // Dev mode state for saving (declared early for ref access)
    const [devMode, setDevMode] = useState<'single' | 'multi'>('single')
    const [previewDifficulty, setPreviewDifficulty] = useState<
      'all' | 'beginner' | 'intermediate' | 'advanced'
    >('all')

    // State for course properties (name, description)
    const [coursePropsModal, setCoursePropsModal] = useState({
      isOpen: false,
      name: courseName || '',
      description: courseDescription || '',
      isLive: false,
    })

    // Editing is allowed in all modes (tutors can edit even during live sessions)
    const canEdit = true

    // Sync external course description into modal state when course changes
    useEffect(() => {
      setCoursePropsModal(prev => ({
        ...prev,
        name: courseName !== undefined ? courseName : prev.name,
        description: courseDescription !== undefined ? courseDescription : prev.description,
      }))
    }, [courseName, courseDescription])

    const doSave = useCallback(
      (isAutoSave = false) => {
        // If courseName is missing (e.g. builder-draft), prompt for properties
        if (!courseName?.trim() && !coursePropsModal.name?.trim()) {
          setCoursePropsModal(prev => ({ ...prev, isOpen: true }))
          return
        }

        if (onSave) {
          return onSave(
            nodes.map(n => n.lessons[0] || ({} as any)),
            {
              developmentMode: devMode,
              previewDifficulty,
              courseName: coursePropsModal.name || courseName,
              courseDescription: coursePropsModal.description,
              isLive: coursePropsModal.isLive,
              isAutoSave,
            }
          )
        }
      },
      [
        nodes,
        courseName,
        coursePropsModal.name,
        coursePropsModal.description,
        devMode,
        previewDifficulty,
        onSave,
      ]
    )

    // Declared above triggerSync so the sync can record the node ref it produces,
    // preventing the sync's own liveNodes clone from being re-detected as a fresh
    // unsynced edit (which previously caused an infinite save/sync toast loop).
    const prevNodesRef = useRef(nodes)

    const handleSyncToLive = useCallback(() => {
      const cloned = cloneNodes(builderNodes)
      setLiveNodes(cloned)
      return cloned
    }, [builderNodes, cloneNodes, setLiveNodes])

    // When the active tab enters "live", refresh the live snapshot from the
    // current builder content so edits made in Build don't vanish on Live. This
    // covers parent-driven mode changes (the floating Controls panel) where the
    // change does not pass through the Tabs onValueChange below. Direct Tab
    // clicks sync synchronously in onValueChange and bump prevMainTabRef so this
    // effect skips the redundant second sync. No tab state is mirrored here, so
    // there is no prop/local desync to loop on.
    const prevMainTabRef = useRef<'live' | 'builder' | 'test-pci'>(initialMainTab ?? 'builder')
    useEffect(() => {
      if (mainTab === 'live' && prevMainTabRef.current !== 'live') {
        handleSyncToLive()
      }
      prevMainTabRef.current = mainTab
    }, [mainTab, handleSyncToLive])

    // Trigger full sync: save → sync to live → emit to session.
    // isAuto suppresses the save/sync toasts so background auto-sync is silent.
    const triggerSync = useCallback(
      async (isAuto = false) => {
        // Wait for the builder save (PUT of builderData) to commit BEFORE
        // emitting course:sync. The server's course:sync handler re-reads
        // builderData from the DB, so emitting before the save resolves would
        // sync the previous content — making edits appear one save behind.
        await doSave(isAuto)
        const cloned = handleSyncToLive()
        // In live mode `nodes` becomes this clone; record it so the effect below
        // doesn't treat the sync as a new edit and re-arm another auto-sync.
        prevNodesRef.current = cloned
        onSyncToLiveSession?.(isAuto)
        setHasUnsyncedChanges(false)
        setAskToastShown(false)
      },
      [doSave, handleSyncToLive, onSyncToLiveSession]
    )

    // Track when nodes change during an active session to mark unsynced changes
    useEffect(() => {
      if (!isSessionActive) return
      if (!onSyncToLiveSession) return
      if (nodes === prevNodesRef.current) return
      prevNodesRef.current = nodes
      setHasUnsyncedChanges(true)
    }, [nodes, isSessionActive, onSyncToLiveSession])

    // Notify parent route of unsynced-changes state for the floating Controls panel.
    useEffect(() => {
      onUnsyncedChangesChange?.(hasUnsyncedChanges)
    }, [hasUnsyncedChanges, onUnsyncedChangesChange])

    // Auto-sync effect: watches for content changes and syncs based on mode
    useEffect(() => {
      if (!isSessionActive) return
      if (!onSyncToLiveSession) return
      if (!hasUnsyncedChanges) return

      // Clear any existing timer
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current)
        syncDebounceRef.current = null
      }

      if (syncMode === 'auto') {
        // Debounced auto-sync: 3 seconds after last change (silent — no toasts)
        syncDebounceRef.current = setTimeout(() => {
          triggerSync(true)
        }, 3000)
      } else if (syncMode === 'ask' && !askToastShown) {
        // Show confirmation toast once per editing burst
        setAskToastShown(true)
        toast.info('Sync changes to live session?', {
          duration: 10000,
          action: {
            label: 'Sync Now',
            onClick: () => triggerSync(),
          },
          cancel: {
            label: 'Later',
            onClick: () => {
              // Keep hasUnsyncedChanges true, allow re-prompt later
              setAskToastShown(false)
            },
          },
          onDismiss: () => setAskToastShown(false),
        })
      }

      return () => {
        if (syncDebounceRef.current) {
          clearTimeout(syncDebounceRef.current)
        }
      }
    }, [
      hasUnsyncedChanges,
      syncMode,
      isSessionActive,
      onSyncToLiveSession,
      askToastShown,
      triggerSync,
    ])

    // Expose save method via ref
    useImperativeHandle(
      ref,
      () => ({
        save: doSave,
        // When a session is open, the manual Save button must also push the
        // edits into the live session. Otherwise Save persists to the DB but
        // the live view keeps showing stale content (it only refreshes on a
        // course:sync emit). triggerSync saves AND emits course:sync. Gate on
        // sessionId (not status === 'active'), since a stale session list could
        // otherwise silently suppress the sync on an explicit save.
        saveAll: (isAuto = false) =>
          insightsProps?.sessionId && onSyncToLiveSession ? triggerSync(isAuto) : doSave(isAuto),
        syncToLive: handleSyncToLive,
        getLessons: () => nodes.map(n => n.lessons[0]),
        openVideo: () => {
          if (!sessionContext?.roomUrl) return
          openVideoOverlay({
            roomUrl: sessionContext.roomUrl,
            token: sessionContext.token,
            autoRecord: !isStudentView,
            isTutor: true,
            twoWay: sessionContext.twoWay,
          })
        },
        triggerSync: () => {
          if (onSyncToLiveSession) triggerSync()
        },
      }),
      [
        doSave,
        handleSyncToLive,
        nodes,
        insightsProps?.sessionId,
        onSyncToLiveSession,
        triggerSync,
        sessionContext?.roomUrl,
        sessionContext?.token,
        isStudentView,
        openVideoOverlay,
      ]
    )

    const trackObjectUrl = useCallback((url: string) => {
      if (url.startsWith('blob:')) {
        objectUrlsRef.current.push(url)
      }
      return url
    }, [])

    /**
     * Best-effort GCS cleanup for orphaned file keys.
     * Called when documents are replaced or removed client-side.
     */
    const cleanupGcsFiles = useCallback(async (keys: string[]) => {
      if (keys.length === 0) return
      try {
        await fetchWithCsrf('/api/uploads/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys }),
        })
      } catch {
        // Best-effort: ignore cleanup failures
      }
    }, [])

    /**
     * Collect all fileKey values from a task and its extensions.
     */
    const collectTaskFileKeys = useCallback((task: Task): string[] => {
      const keys: string[] = []
      if (task.sourceDocument?.fileKey) keys.push(task.sourceDocument.fileKey)
      for (const ext of task.extensions || []) {
        if (ext.sourceDocument?.fileKey) keys.push(ext.sourceDocument.fileKey)
      }
      return keys
    }, [])

    /**
     * Collect all fileKey values from an assessment/homework.
     */
    const collectAssessmentFileKeys = useCallback((assessment: Assessment): string[] => {
      const keys: string[] = []
      if (assessment.sourceDocument?.fileKey) keys.push(assessment.sourceDocument.fileKey)
      return keys
    }, [])

    /**
     * Collect all fileKey values from a lesson (tasks, assessments, content, docs).
     */
    const collectLessonFileKeys = useCallback(
      (lesson: Lesson): string[] => {
        const keys: string[] = []
        for (const task of lesson.tasks || []) {
          keys.push(...collectTaskFileKeys(task))
        }
        for (const assessment of lesson.homework || []) {
          keys.push(...collectAssessmentFileKeys(assessment))
        }
        for (const content of lesson.content || []) {
          if (content.sourceDocument?.fileKey) keys.push(content.sourceDocument.fileKey)
        }
        return keys
      },
      [collectTaskFileKeys, collectAssessmentFileKeys]
    )

    const cloneTask = (task: Task): Task => ({
      ...task,
      id: `task-${generateId()}`,
      sourceDocument: deepCloneSourceDocument(task.sourceDocument),
      extensions: (task.extensions || []).map(ext => ({
        ...ext,
        id: `ext-${generateId()}`,
        sourceDocument: deepCloneSourceDocument(ext.sourceDocument),
      })),
    })

    const cloneAssessment = (assessment: Assessment): Assessment => ({
      ...assessment,
      id: `homework-${generateId()}`,
      sourceDocument: deepCloneSourceDocument(assessment.sourceDocument),
    })

    const findTaskById = useCallback(
      (id: string): Task | null => {
        for (const mod of nodes) {
          for (const lesson of mod.lessons) {
            const task = lesson.tasks?.find(t => t.id === id)
            if (task) return task
          }
        }
        return null
      },
      [nodes]
    )

    // The lesson id that contains a given task/assessment/homework item, so a
    // deploy can be tagged with the real lesson (not "Lesson 1").
    const findLessonIdForItem = useCallback(
      (id: string): string | undefined => {
        for (const mod of nodes) {
          for (const lesson of mod.lessons) {
            if (
              lesson.tasks?.some(t => t.id === id) ||
              lesson.assessments?.some(a => a.id === id) ||
              lesson.homework?.some(h => h.id === id)
            ) {
              return lesson.id
            }
          }
        }
        return undefined
      },
      [nodes]
    )

    const findAssessmentById = useCallback(
      (id: string): Assessment | null => {
        for (const mod of nodes) {
          for (const lesson of mod.lessons) {
            const assessment = lesson.homework?.find(h => h.id === id)
            if (assessment) return assessment
          }
        }
        return null
      },
      [nodes]
    )

    // The DMI currently loaded in the live Classroom — preferred from the
    // builder state, else from the loaded task/assessment. Hoisted to the
    // component scope so both the Classroom toolbar "View DMI" button and the
    // modal below can use it.
    const liveDmiItems: DMIQuestion[] =
      mainTab === 'live'
        ? assessmentDmiItems.length > 0
          ? assessmentDmiItems
          : taskDmiItems.length > 0
            ? taskDmiItems
            : (testPciSource === 'assessment'
                ? findAssessmentById(loadedAssessmentId || '')?.dmiItems
                : findTaskById(loadedTaskId || '')?.dmiItems) || []
        : []

    const moveToHomework = useCallback(
      (nodeId: string, lessonId: string, type: 'task' | 'assessment', item: Task | Assessment) => {
        const base = DEFAULT_HOMEWORK(
          nodes.flatMap(m => m.lessons.flatMap(l => l.homework || [])).length,
          'homework'
        )
        // Rename on collision with the target lesson's existing homework (the
        // moved item itself is excluded — it's removed below).
        const targetHwTitles = new Set<string>(
          (nodes.find(m => m.id === nodeId)?.lessons.find(l => l.id === lessonId)?.homework || [])
            .filter(h => h.id !== item.id)
            .map(h => (h.title || '').trim())
        )
        const landedTitle = uniqueMovedTitle(item.title || 'Task', targetHwTitles)
        const homeworkItem: Assessment =
          type === 'task'
            ? {
                ...base,
                id: `hw-${generateId()}`,
                title: landedTitle,
                description: (item as Task).description || '',
                instructions: (item as Task).instructions || '',
                dmiItems: (item as Task).dmiItems || [],
                sourceDocument: deepCloneSourceDocument((item as Task).sourceDocument),
              }
            : {
                ...cloneAssessment(item as Assessment),
                id: `hw-${generateId()}`,
                title: landedTitle,
                category: 'homework' as const,
              }
        setCourseBuilderNodes(prev =>
          prev.map(mod => {
            if (mod.id !== nodeId) return mod
            return {
              ...mod,
              lessons: mod.lessons.map(les => {
                if (les.id !== lessonId) return les
                if (type === 'task') {
                  const newTasks = (les.tasks || []).filter(t => t.id !== item.id)
                  return {
                    ...les,
                    tasks: newTasks,
                    homework: [...(les.homework || []), homeworkItem],
                  }
                }
                const newHwList = (les.homework || [])
                  .filter(h => h.id !== item.id)
                  .concat([homeworkItem])
                return { ...les, homework: newHwList }
              }),
            }
          })
        )
        if (type === 'task') {
          if (loadedTaskId === item.id) {
            setSelectedItem({ type: 'homework', id: homeworkItem.id })
            loadAssessmentIntoBuilder(homeworkItem)
            setMainBuilderTab('assessment')
          }
          setLoadedTaskId(null)
          setTaskBuilder({
            title: '',
            taskContent: '',
            taskPci: '',
            details: '',
            extensions: [],
            activeExtensionId: null,
          })
        } else {
          if (loadedAssessmentId === item.id) {
            setSelectedItem({ type: 'homework', id: homeworkItem.id })
            loadAssessmentIntoBuilder(homeworkItem)
          }
          setLoadedAssessmentId(null)
          setAssessmentBuilder({
            title: '',
            taskContent: '',
            taskPci: '',
            details: '',
            extensions: [],
            activeExtensionId: null,
          })
        }

        // Auto-deploy to student homework folder
        if (insightsProps?.onDeployTask) {
          deployTaskWithDialog({
            id: homeworkItem.id,
            title: homeworkItem.title || 'Homework',
            content: homeworkItem.description || '',
            source: 'homework',
            // Student-safe projection (strips answer key incl. matching pairs /
            // hotspot regions). See toStudentDmiItem.
            dmiItems: homeworkItem.dmiItems?.map(toStudentDmiItem) || [],
            // Answer key + marks for server-side grading (never sent to students).
            answerKey:
              homeworkItem.dmiItems?.map(i => ({
                id: i.id,
                answer: i.answer,
                acceptableVariants: i.acceptableVariants,
                marks: i.marks,
              })) || [],
            answerReveal: deployAnswerReveal,
            deployedAt: Date.now(),
            polls: [],
            questions: [],
            sourceDocument: homeworkItem.sourceDocument
              ? {
                  fileName: homeworkItem.sourceDocument.fileName,
                  fileUrl: homeworkItem.sourceDocument.fileUrl,
                  fileKey: homeworkItem.sourceDocument.fileKey,
                  mimeType: homeworkItem.sourceDocument.mimeType || 'application/pdf',
                }
              : undefined,
          })
        }

        // Also emit direct homework assignment event for real-time student notification
        if (insightsProps?.socket && insightsProps?.sessionId) {
          insightsProps.socket.emit('homework:assigned', {
            roomId: insightsProps.sessionId,
            homework: {
              id: homeworkItem.id,
              title: homeworkItem.title || 'Homework',
              content: homeworkItem.description || '',
              dmiItems: homeworkItem.dmiItems || [],
              sourceDocument: homeworkItem.sourceDocument,
            },
          })
        }

        toast.success('Moved to homework')
      },
      [cloneAssessment, loadAssessmentIntoBuilder, nodes, insightsProps]
    )

    const cloneLesson = (lesson: Lesson, order: number): Lesson => ({
      ...lesson,
      id: `lesson-${generateId()}`,
      order,
      tasks: (lesson.tasks || []).map(cloneTask),
      homework: (lesson.homework || []).map(cloneAssessment),
    })

    // Grade a single assessment DMI question's test answer against THAT
    // question's basis (its rubric + model answer + the assessment PCI), honoring
    // the "Test with" basis debug filter. Mirrors production per-question grading;
    // result is shown inline under the question.
    const gradeTestDmiItem = async (item: DMIQuestion) => {
      const key = `${testPciActiveTab}:${item.id}`
      const answer = (testDmiAnswers[key] || '').trim()
      if (!answer) return
      setTestDmiResults(prev => ({ ...prev, [key]: { loading: true } }))

      const usesPci = testPciBasis === 'all' || testPciBasis === 'pci'
      const usesRubric = testPciBasis === 'all' || testPciBasis === 'rubric'
      const usesModel = testPciBasis === 'all' || testPciBasis === 'model'
      try {
        const res = await fetchWithCsrf('/api/tutor/test-grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pci: usesPci ? assessmentBuilder.taskPci : '',
            pciSpec: usesPci ? assessmentBuilder.pciSpec : undefined,
            rubric: usesRubric ? item.rubric || '' : '',
            modelAnswer: usesModel ? item.answer || '' : '',
            questionText: item.questionText || '',
            responseType: typeof item.responseType === 'string' ? item.responseType : undefined,
            sourceDependencies: Array.isArray(item.sourceDependencies)
              ? item.sourceDependencies
              : undefined,
            answer,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Failed to grade')
        if (!data.hasBasis) {
          const noPolicy = 'No policy was set for this class'
          setTestDmiResults(prev => ({
            ...prev,
            [key]: { feedback: noPolicy },
          }))
          appendClassroomAiMessage(noPolicy, 'SAI')
          return
        }
        setTestDmiResults(prev => ({
          ...prev,
          [key]: { score: data.score ?? null, feedback: data.feedback || 'Graded.' },
        }))
      } catch (e) {
        setTestDmiResults(prev => ({
          ...prev,
          [key]: { feedback: e instanceof Error ? e.message : 'Failed to grade' },
        }))
      }
    }

    // Handle Test PCI answer submission with AI scoring
    const handleTestPciSubmit = async () => {
      const currentInput = testPciInputs[testPciActiveTab] || ''
      if (!currentInput.trim() || testPciLoading) return

      const answer = currentInput.trim()
      setTestPciInputs(prev => ({ ...prev, [testPciActiveTab]: '' }))
      setTestPciLoading(true)

      // Get PCI content from the active item — an active extension uses its own
      // PCI (empty for a fresh extension), never the parent task's.
      const pciContent =
        testPciSource === 'task'
          ? taskBuilder.activeExtensionId
            ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)?.pci || ''
            : taskBuilder.taskPci
          : assessmentBuilder.taskPci

      // Determine which tabs to update
      const tabsToUpdate: string[] = []
      if (testPciActiveTab === 'classroom') {
        // Classroom goes to both students
        tabsToUpdate.push('classroom', 'student1', 'student2')
      } else {
        // Individual student tab
        tabsToUpdate.push(testPciActiveTab)
      }

      // Update content for all affected tabs
      setTestPciContent(prev => {
        const newContent = { ...prev }
        tabsToUpdate.forEach(tab => {
          newContent[tab] = (newContent[tab] ? newContent[tab] + '\n' : '') + `Tutor: ${answer}`
        })
        return newContent
      })

      // The FULL marking basis for this item — the same one production grading
      // uses: free-text PCI + structured spec + the DMI rubric/model answers.
      const pciSpec =
        testPciSource === 'task'
          ? // Extensions carry only a free-text PCI (no structured spec).
            taskBuilder.activeExtensionId
            ? undefined
            : taskBuilder.pciSpec
          : assessmentBuilder.pciSpec
      const dmiItems = testPciSource === 'task' ? taskDmiItems : assessmentDmiItems
      const label = (d: DMIQuestion) => d.questionLabel || d.questionText || ''
      const qid = (d: DMIQuestion) => String(d.id ?? d.questionNumber ?? '')
      // When the tutor picked a specific question, grade against THAT question's
      // basis only — exactly like production per-question grading. Otherwise fall
      // back to the whole scheme (a policy test across every question).
      const selectedItem = testPciQuestionId
        ? dmiItems.find(d => qid(d) === testPciQuestionId)
        : undefined
      const rubric = selectedItem
        ? selectedItem.rubric || ''
        : dmiItems
            .map(d => (d.rubric ? `${label(d)}: ${d.rubric}`.trim() : ''))
            .filter(Boolean)
            .join('\n')
      const modelAnswer = selectedItem
        ? selectedItem.answer || ''
        : dmiItems
            .map(d => (d.answer ? `${label(d)}: ${d.answer}`.trim() : ''))
            .filter(Boolean)
            .join('\n')
      // Per-question metadata (only meaningful for a single selected question).
      const questionText = selectedItem?.questionText || ''
      const responseType =
        selectedItem && typeof selectedItem.responseType === 'string'
          ? selectedItem.responseType
          : undefined
      const sourceDependencies =
        selectedItem && Array.isArray(selectedItem.sourceDependencies)
          ? selectedItem.sourceDependencies
          : undefined

      // Append an "AI Coach: …" line to the affected tabs' transcripts.
      const recordNote = (note: string) =>
        setTestPciContent(prev => {
          const newContent = { ...prev }
          tabsToUpdate.forEach(tab => {
            newContent[tab] =
              (newContent[tab] ? newContent[tab] + '\n\n' : '') + `AI Coach: ${note}`
          })
          return newContent
        })
      // Only real grades go into the scores list — no fabricated 0/50 for the
      // no-basis / couldn't-grade cases.
      const recordScore = (score: number, feedback: string) => {
        recordNote(feedback)
        setTestPciScores(prev => {
          const newScores = { ...prev }
          tabsToUpdate.forEach(tab => {
            newScores[tab] = [
              ...(newScores[tab] || []),
              { score, feedback: `Answer: ${answer}\n${feedback}` },
            ]
          })
          return newScores
        })
      }

      // DEBUG basis isolation (test-tab only): drop the bases the tutor didn't
      // pick so grading rests on just the selected one. 'all' keeps everything.
      const usesPci = testPciBasis === 'all' || testPciBasis === 'pci'
      const usesRubric = testPciBasis === 'all' || testPciBasis === 'rubric'
      const usesModel = testPciBasis === 'all' || testPciBasis === 'model'

      try {
        // Grade through the shared engine — identical to what students get.
        const response = await fetchWithCsrf('/api/tutor/test-grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pci: usesPci ? pciContent : '',
            pciSpec: usesPci ? pciSpec : undefined,
            rubric: usesRubric ? rubric : '',
            modelAnswer: usesModel ? modelAnswer : '',
            questionText,
            responseType,
            sourceDependencies,
            answer,
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.error || 'Failed to grade')

        if (!data.hasBasis) {
          const noPolicy = 'No policy was set for this class'
          appendClassroomAiMessage(noPolicy, 'SAI')
          toast.warning(noPolicy)
          return
        }
        if (data.aiUnavailable) {
          recordNote('AI grading is unavailable right now — please try again.')
          toast.error('AI grading is unavailable right now.')
          return
        }
        if (typeof data.score !== 'number') {
          recordNote('Couldn’t grade this answer — run it again.')
          toast.error('Couldn’t grade — please try again.')
          return
        }

        recordScore(data.score, data.feedback || 'No feedback provided')
        toast.success(`Answer scored: ${data.score}%`)
        // Tutor-only: the PCI-override note + any guardrail warnings (never shown
        // to students) so the tutor can vet the grading during testing.
        if (data.pciNote) toast.message(`PCI note: ${data.pciNote}`)
        if (Array.isArray(data.guardrailWarnings)) {
          for (const w of data.guardrailWarnings) {
            toast.warning(`Guardrail ${w.ruleId}: ${w.message}`)
          }
        }
      } catch (error) {
        recordNote(`Error - ${error instanceof Error ? error.message : 'Unknown error'}`)
        toast.error('Failed to score answer')
      } finally {
        setTestPciLoading(false)
      }
    }

    // Build a same-origin proxy URL for fetching a stored file. Prefer the by-key
    // streaming path (?key=) when we have the storage key: it downloads via the
    // service account's read access and is resilient to signed-URL problems — a
    // missing signBlob permission makes "signed" URLs fall back to public URLs
    // that 403 under uniform bucket-level access (the cause of "Failed to fetch
    // PDF"). Fall back to ?url= for non-GCS or keyless sources.
    const proxyFetchUrl = (fileUrl: string, fileKey?: string): string => {
      if (fileKey && /^(documents|assets|resources)\//.test(fileKey) && !fileKey.includes('..')) {
        return `/api/proxy-file?key=${encodeURIComponent(fileKey)}`
      }
      if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
        return `/api/proxy-file?url=${encodeURIComponent(fileUrl)}`
      }
      return fileUrl
    }

    // Helper: render PDF pages to base64 PNG images
    const renderPdfToImages = async (
      pdfUrl: string,
      maxPages = 3,
      fileKey?: string
    ): Promise<string[]> => {
      try {
        // Proxy through our API to avoid CORS issues (e.g. GCS); by key when possible.
        const fetchUrl = proxyFetchUrl(pdfUrl, fileKey)
        const response = await fetch(fetchUrl)
        if (!response.ok) throw new Error('Failed to fetch PDF')
        const arrayBuffer = await response.arrayBuffer()
        const pdfjs = await import('pdfjs-dist')
        if (typeof window !== 'undefined') {
          const opts = (pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } })
            .GlobalWorkerOptions
          if (opts && !opts.workerSrc) {
            opts.workerSrc = '/pdf.worker.min.mjs'
          }
        }
        const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise
        const images: string[] = []
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas context not available')

        for (let i = 1; i <= Math.min(maxPages, doc.numPages); i++) {
          const page = await doc.getPage(i)
          const viewport = page.getViewport({ scale: 1.0 })
          canvas.width = viewport.width
          canvas.height = viewport.height
          await page.render({ canvasContext: ctx, viewport }).promise
          images.push(canvas.toDataURL('image/jpeg', 0.8))
        }
        return images
      } catch (error) {
        console.error('PDF to image conversion error:', error)
        throw error
      }
    }

    // Downscale an image (data / object URL) to a bounded JPEG data URL so a
    // high-resolution scan or embedded figure stays well under the payload/token
    // budget. Uses window.Image because the bare `Image` identifier is a type in
    // this module.
    const imageSrcToBoundedDataUrl = (src: string, maxDim = 2000): Promise<string> =>
      new Promise((resolve, reject) => {
        const img = new window.Image()
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1))
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(img.width * scale))
          canvas.height = Math.max(1, Math.round(img.height * scale))
          const ctx = canvas.getContext('2d')
          if (!ctx) return reject(new Error('Canvas context not available'))
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.8))
        }
        img.onerror = () => reject(new Error('Image could not be loaded'))
        img.src = src
      })

    // Figure images for a NON-PDF document, so the vision model can see diagrams
    // that text/OCR extraction drops:
    //   • image document → the image itself (one page), downscaled
    //   • Word .docx     → the raster images embedded in it (word/media/*)
    // Returns [] for anything we can't render, leaving generation on text alone.
    const renderNonPdfFigures = async (doc: {
      fileUrl?: string
      fileKey?: string
      mimeType?: string
      fileName?: string
    }): Promise<string[]> => {
      const isImage = !!doc.mimeType?.startsWith('image/')
      const isOffice =
        doc.mimeType === 'application/msword' ||
        doc.mimeType === 'application/vnd.ms-powerpoint' ||
        doc.mimeType ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        doc.mimeType ===
          'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        /\.(docx?|pptx?)$/i.test(doc.fileName || '')

      if (isImage) {
        const response = await fetch(proxyFetchUrl(doc.fileUrl || '', doc.fileKey))
        if (!response.ok) throw new Error('Failed to fetch image')
        const objectUrl = URL.createObjectURL(await response.blob())
        try {
          return [await imageSrcToBoundedDataUrl(objectUrl)]
        } finally {
          URL.revokeObjectURL(objectUrl)
        }
      }

      // Word / PowerPoint (modern or legacy .doc/.ppt) — convert to PDF on the
      // server via LibreOffice, which renders the TRUE document (text, raster
      // images, AND vector shapes / hand-drawn diagrams, and reads legacy
      // binaries), then rasterise the pages. This captures figures the OOXML
      // media folder can't. Needs a durable fileKey to read from storage.
      if (isOffice && doc.fileKey) {
        const res = await fetchWithCsrf('/api/ai/office-to-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileKey: doc.fileKey, fileName: doc.fileName }),
        })
        if (!res.ok) throw new Error(`Office-to-PDF conversion failed (${res.status})`)
        const objectUrl = URL.createObjectURL(await res.blob())
        try {
          return await renderPdfToImages(objectUrl, 8)
        } finally {
          URL.revokeObjectURL(objectUrl)
        }
      }

      return []
    }

    // Extract the selectable text of EVERY page of a PDF. Used in preference to
    // page-images for digital papers so a long multi-page question paper is fully
    // captured (image analysis is capped at a few pages). Returns '' if the PDF
    // has no extractable text (e.g. a scan) so the caller can fall back to images.
    const extractPdfText = async (
      pdfUrl: string,
      maxPages = 30,
      fileKey?: string
    ): Promise<string> => {
      try {
        const fetchUrl = proxyFetchUrl(pdfUrl, fileKey)
        const response = await fetch(fetchUrl)
        if (!response.ok) throw new Error('Failed to fetch PDF')
        const arrayBuffer = await response.arrayBuffer()
        const pdfjs = await import('pdfjs-dist')
        if (typeof window !== 'undefined') {
          const opts = (pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } })
            .GlobalWorkerOptions
          if (opts && !opts.workerSrc) opts.workerSrc = '/pdf.worker.min.mjs'
        }
        const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise
        const parts: string[] = []
        for (let i = 1; i <= Math.min(maxPages, doc.numPages); i++) {
          const page = await doc.getPage(i)
          const tc = await page.getTextContent()
          const pageText = (tc.items as Array<{ str?: string }>)
            .map(it => it.str ?? '')
            .join(' ')
            .replace(/[ \t]+/g, ' ')
            .trim()
          if (pageText) parts.push(`--- Page ${i} ---\n${pageText}`)
        }
        return parts.join('\n\n')
      } catch (error) {
        console.error('PDF text extraction error:', error)
        return ''
      }
    }

    // Past papers often open with cover pages, a table of contents, and exam
    // instructions before any questions (e.g. an AP practice exam's questions
    // start ~page 23 of 110). Drop that leading front matter so the real
    // questions reach the model instead of being crowded out of the token
    // budget — and so the classifier isn't biased toward "study material" by
    // pages of administrative prose. Anchored on the first TRUE multiple-choice
    // item (a number followed by lettered options); a table-of-contents listing
    // won't match this, so it's safe.
    const focusOnQuestions = (raw: string): string => {
      if (raw.length < 6000) return raw
      const firstMcq = raw.search(
        /(?:^|\n)\s*\d{1,3}\.\s[\s\S]{0,600}?\(A\)[\s\S]{0,500}?\(B\)[\s\S]{0,500}?\(C\)/
      )
      // Only trim when there's substantial front matter before the questions.
      return firstMcq > 1500 ? raw.slice(firstMcq) : raw
    }

    // Per-question DMI edits, row add/remove, reference backfill and the badge's
    // board/subject — all live in their own hook.
    const { applyDmiEdit, reextractRefs, removeDmiItem, setExamContext } = useDmiEditor({
      taskDmiItems,
      assessmentDmiItems,
      setTaskDmiItems,
      setAssessmentDmiItems,
      setTaskDmiVersions,
      setAssessmentDmiVersions,
      testPciViewMode,
    })

    // Marking-scheme upload (extract → parse → fill/append) lives in its own hook.
    const {
      markingSchemeLoading,
      markingSchemeInputRef,
      recentlyAddedRowIds,
      dmiRowsRef,
      handleMarkingSchemeFile,
    } = useMarkingScheme({
      taskDmiItems,
      assessmentDmiItems,
      setTaskDmiItems,
      setAssessmentDmiItems,
      taskDmiVersions,
      assessmentDmiVersions,
      setTaskDmiVersions,
      setAssessmentDmiVersions,
      testPciViewMode,
      taskBuilder,
      assessmentBuilder,
      designatedFolder,
      courseName,
      setExamContext,
    })

    // Persist the Guided-form Subject back to the course's categories so it
    // reflects on the Course details page (Model A, item 5). Replaces the
    // primary category, preserving any additional ones. Best-effort — the local
    // override already reflects it in the form. The PATCH route is auth-only.
    const persistCourseCategory = useCallback(
      async (cat: string) => {
        if (!courseId || !cat) return
        const next =
          liveCourseCategories.length > 0
            ? [cat, ...liveCourseCategories.slice(1).filter(c => c !== cat)]
            : [cat]
        try {
          await fetch(`/api/tutor/courses/${courseId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ categories: next }),
          })
        } catch {
          // best-effort — the form already reflects it via the local override
        }
      },
      [courseId, liveCourseCategories]
    )

    // Board/Subject changes from the PCI Guided form. Subject (a course category)
    // drives the DMI exam context AND writes back to the course; Board overrides
    // the derived examBody on the DMI.
    const handlePciExamContextChange = useCallback(
      (source: 'task' | 'assessment', patch: { category?: string; board?: string }) => {
        if (patch.category !== undefined) {
          const cat = patch.category
          const derived = deriveExamContext(cat || null, courseName)
          setCourseCategoryOverride(cat)
          setPciBoardOverride(null) // re-derive the board from the new subject
          setExamContext(source, { examBody: derived.examBody, subject: derived.subject ?? cat })
          void persistCourseCategory(cat)
        }
        if (patch.board !== undefined) {
          setPciBoardOverride(patch.board)
          setExamContext(source, { examBody: patch.board })
        }
      },
      [courseName, setExamContext, persistCourseCategory]
    )

    // Generate DMI using AI from content or PDF images with versioning.
    // `questionSpec` is supplied (via the spec dialog) when the source is study
    // material and the tutor has chosen which question types/counts to generate.
    const handleGenerateDMI = async (
      type: 'task' | 'assessment',
      questionSpec?: Array<{ type: DmiQuestionType; count: number }>,
      documentKindOverride?: 'question_paper' | 'study_material',
      skipFormatPrompt?: boolean,
      contentSourceOverride?: 'document' | 'text'
    ) => {
      const isTask = type === 'task'
      const builder = isTask ? taskBuilder : assessmentBuilder
      const activeExt =
        isTask && taskBuilder.activeExtensionId
          ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)
          : null
      const content = activeExt ? activeExt.content : builder.taskContent
      const sourceDoc = isTask
        ? activeExt?.sourceDocument || taskSourceDocument || taskBuilder.sourceDocument
        : currentAssessmentDocument

      const hasContent = content.trim().length > 0
      const hasPdf = sourceDoc?.mimeType === 'application/pdf' && sourceDoc.fileUrl

      if (!hasContent && !hasPdf) {
        toast.error('Please add Assessment content or load a PDF first')
        return
      }

      // Detect a source disagreement up front (used by the chooser below), and
      // on a fresh, user-initiated generate (no in-flight dialog choices) clear
      // any remembered content-source pick so a stale one can't leak into the new
      // run. Every downstream re-invocation carries a spec/kind/skip/source arg,
      // so the pick stays alive through the rest of the chain.
      const normalizeText = (s: string) => s.replace(/\s+/g, ' ').trim()
      const docExtractedText = normalizeText(sourceDoc?.extractedText || '')
      const typedText = normalizeText(content)
      const sourcesDisagree = !!hasPdf && typedText.length > 0 && typedText !== docExtractedText
      if (!questionSpec && !documentKindOverride && !skipFormatPrompt && !contentSourceOverride) {
        dmiContentSourceRef.current = null
      }

      // Route the pre-generation dialog chain via the tested pure gate. Format
      // BEFORE source: a multiple-choice paper is built locally and never reads
      // the content, so it returns at the format step and is never asked which
      // source to use. Free-response then asks the source chooser only when a PDF
      // is attached AND the text box was edited away from the document's own
      // extraction (the two genuinely disagree) and no pick has been made yet.
      // The pick persists in a ref across the rest of the resolve chain
      // (kind → spec). See dmi-generate-gate.ts + its tests for the invariants.
      const contentSource = contentSourceOverride ?? dmiContentSourceRef.current ?? undefined
      const dmiGate = nextDmiGate({
        type,
        hasQuestionSpec: !!questionSpec,
        hasDocumentKindOverride: !!documentKindOverride,
        skipFormatPrompt: !!skipFormatPrompt,
        contentSource,
        sourcesDisagree,
      })
      if (dmiGate === 'source') {
        setDmiSourceDialog({ type })
        return
      }
      // 'text' → generate from the typed text and skip the PDF file entirely.
      const effectiveHasPdf = hasPdf && contentSource !== 'text'

      setDmiGenerating(true)
      try {
        let pdfPages: string[] | undefined
        let pdfText: string | undefined
        if (effectiveHasPdf) {
          toast.info('Analyzing PDF with AI...')
          // Prefer full-text extraction so EVERY page of a multi-page paper is
          // captured (image analysis is capped at a few pages and would miss
          // later questions). Read enough pages to clear any front matter and
          // reach the questions, then drop the leading cover/instructions so the
          // budget is spent on the actual questions. Fall back to page images
          // for scanned PDFs.
          const extracted = await extractPdfText(sourceDoc.fileUrl, 60, sourceDoc.fileKey)
          const priorText = (sourceDoc.extractedText || '').trim()
          if (extracted.trim().length > 200) {
            pdfText = focusOnQuestions(extracted).slice(0, 70000)
          } else if (priorText.length > 200) {
            // Server-side re-extraction came back thin (large/complex PDF, slow
            // proxy), but we already captured solid text at upload time. Prefer
            // that over a handful of page images — real text carries the
            // question/MCQ markers the classifier needs, so a genuine question
            // paper (e.g. a large SAT) isn't misread as study material.
            pdfText = focusOnQuestions(priorText).slice(0, 70000)
          } else {
            try {
              pdfPages = await renderPdfToImages(sourceDoc.fileUrl, 8, sourceDoc.fileKey)
            } catch (fetchErr) {
              // The stored PDF couldn't be fetched (e.g. a broken/expired storage
              // link). Rather than failing outright with "Failed to fetch PDF",
              // fall back to the text we already extracted from the document at
              // upload time so DMI generation still proceeds.
              console.error('PDF fetch for DMI failed; falling back to extracted text:', fetchErr)
              const fallbackText = (sourceDoc.extractedText || content || '').trim()
              if (fallbackText.length > 40) {
                pdfText = focusOnQuestions(fallbackText).slice(0, 70000)
                toast.info('Could not read the PDF file; using the document text instead.')
              } else {
                throw fetchErr
              }
            }
          }

          // Diagram-aware generation: when the tutor has flagged that this paper
          // contains figures/diagrams, ALSO render page images and send them with
          // the extracted text. A text-only model can't see a geometry figure or
          // graph a question refers to; the page images give the vision model that
          // visual context, while the full text still guarantees complete question
          // coverage. Skipped when we already fell back to images (scanned PDF) or
          // have no text. Non-fatal: if rendering fails, generation proceeds on
          // text alone.
          if (dmiAnalyzeFigures && pdfText && !pdfPages) {
            try {
              toast.info('Rendering diagrams for analysis...')
              pdfPages = await renderPdfToImages(sourceDoc.fileUrl, 8, sourceDoc.fileKey)
            } catch (figErr) {
              console.warn('Diagram rendering for DMI failed; using text only:', figErr)
            }
          }
        }

        // Non-PDF documents (an image scan, a Word or PowerPoint file) lose their
        // figures to OCR/text extraction too. When opted in, attach the visual so
        // the model can see them — the image itself, or a doc's embedded images —
        // alongside the extracted text (still sent as the authoritative content).
        // Non-fatal: on failure, generation proceeds on text alone.
        if (
          dmiAnalyzeFigures &&
          !effectiveHasPdf &&
          !pdfPages &&
          sourceDoc &&
          isImageOrOfficeDoc(sourceDoc)
        ) {
          try {
            toast.info('Rendering diagrams for analysis...')
            const figures = await renderNonPdfFigures(sourceDoc)
            if (figures.length > 0) pdfPages = figures
          } catch (figErr) {
            console.warn('Diagram rendering for DMI failed; using text only:', figErr)
          }
        }

        const response = await fetch('/api/ai/generate-dmi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            title: builder.title,
            content: pdfText ?? (!effectiveHasPdf && hasContent ? content : undefined),
            pdfPages,
            questionSpec,
            documentKindOverride,
            // Board/subject context from the course category so generation
            // follows the right exam conventions (a hint, not a source override).
            // Honour the tutor's manual Board override if they set one.
            examBody:
              pciBoardOverride ||
              deriveExamContext(pciCategory || null, courseName).examBody ||
              undefined,
            subject:
              deriveExamContext(pciCategory || null, courseName).subject ||
              pciCategory ||
              undefined,
          }),
        })

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(errorBody.error || `Failed to generate DMI (${response.status})`)
        }

        const data = await response.json()

        // Ambiguous document kind: ask the tutor to confirm "question paper vs
        // study material" before proceeding, instead of silently treating it as a
        // paper. On confirm we re-run with an explicit override.
        if (data.needsKindConfirmation && !documentKindOverride) {
          setDmiKindDialog({ type, signal: data.documentSignal ?? null })
          return
        }

        // Study material with no explicit questions: ask the tutor which question
        // types + counts to generate, then re-run with that spec.
        if (data.needsQuestionSpec && !questionSpec) {
          setDmiSpecRows([{ type: 'short', count: 3 }])
          setDmiSpecDialog({ type })
          return
        }

        const questions = data.questions || []

        // Surface warn-only assessment guardrail violations (e.g. a question that
        // may not match the source verbatim) as toasts so the tutor can verify.
        const dmiWarnings: GuardrailWarning[] = Array.isArray(data.guardrailWarnings)
          ? data.guardrailWarnings
          : []
        for (const w of dmiWarnings) {
          const notify = w.severity === 'error' ? toast.error : toast.warning
          notify(`Guardrail ${w.ruleId}: ${w.message}`)
        }

        // ASMT-2: warn the tutor when the document parsed with low/medium
        // confidence so they verify before proceeding ("pause" on Low).
        const confidence = data.confidence as
          | { level: 'High' | 'Medium' | 'Low'; reasons?: string[] }
          | null
          | undefined
        if (confidence && confidence.level !== 'High') {
          const reason = confidence.reasons?.[0] ? ` ${confidence.reasons[0]}` : ''
          const msg = `${confidence.level} confidence parsing this document — please verify the extracted questions.${reason}`
          if (confidence.level === 'Low') toast.error(msg)
          else toast.warning(msg)
        }

        if (questions.length === 0) {
          toast.warning('No questions could be generated. Try adding more content.')
          return
        }

        const items: DMIQuestion[] = questions.map((q: any) => ({
          id: `dmi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          questionNumber: q.questionNumber || 1,
          questionLabel: typeof q.questionLabel === 'string' ? q.questionLabel : undefined,
          questionText: q.questionText || 'Question',
          answer: q.answer || '',
          // Per-question marks (auto-total + weighted grading) and the marking
          // rubric / model answer for open-ended items (tutor-only).
          marks: typeof q.marks === 'number' && q.marks > 0 ? q.marks : undefined,
          rubric: typeof q.rubric === 'string' && q.rubric.trim() ? q.rubric.trim() : undefined,
          // Carry the answer-input type + choice options through to the deployed
          // DMI so the student sees the right control (short/mcq/etc.).
          questionType: q.questionType,
          options: Array.isArray(q.options) ? q.options : undefined,
          pairs: Array.isArray(q.pairs) ? q.pairs : undefined,
          hotspotImageUrl: q.hotspotImageUrl,
          regions: Array.isArray(q.regions) ? q.regions : undefined,
          // Paper section this part belongs to (ASMT-4), when present.
          section: typeof q.section === 'string' && q.section.trim() ? q.section.trim() : undefined,
          // Expected answer format + source-material dependencies (ASMT-4).
          responseType:
            typeof q.responseType === 'string' && q.responseType.trim()
              ? q.responseType.trim()
              : undefined,
          sourceDependencies: Array.isArray(q.sourceDependencies)
            ? q.sourceDependencies
            : undefined,
        }))

        // Study material: students see the GENERATED questions (with options) on
        // the Classroom side; the DMI on the right keeps ONLY a short "Question N"
        // label + its input control. A question paper keeps the DMI label as-is
        // (it already references the deployed paper).
        const isStudyMaterial =
          data.documentKind === 'study_material' || (questionSpec?.length ?? 0) > 0

        let dmiItems = items
        if (isStudyMaterial) {
          const generatedClassroomContent = items
            .map(q => {
              let block = `${q.questionLabel ?? q.questionNumber}. ${q.questionText}`
              // Choice questions: list options as a) b) c) … under the stem.
              if (Array.isArray(q.options) && q.options.length > 0) {
                block +=
                  '\n' +
                  q.options.map((o, i) => `   ${String.fromCharCode(97 + i)}) ${o}`).join('\n')
              }
              return block
            })
            .join('\n\n')
          // The DMI shows only the reference; the full question lives in Classroom.
          dmiItems = items.map(q => ({
            ...q,
            questionText: `Question ${q.questionLabel ?? q.questionNumber}`,
          }))
          if (isTask) {
            setTaskBuilder(prev => ({
              ...prev,
              taskContent: generatedClassroomContent,
              sourceDocument: undefined,
            }))
            setTaskSourceDocument(undefined)
          } else {
            // Keep the uploaded document visible in the builder; mark it
            // reference-only so it isn't deployed to students.
            setAssessmentBuilder(prev => ({
              ...prev,
              taskContent: generatedClassroomContent,
            }))
            setAssessmentSourceReferenceOnly(true)
          }
          toast.info(
            'Generated questions set as the Classroom content; the original material will not be deployed.'
          )
        } else if (!isTask) {
          // Question paper (or a re-run that reclassified): the document IS the
          // deliverable, so clear any stale reference-only marker.
          setAssessmentSourceReferenceOnly(false)
        }

        const existingVersions = isTask ? taskDmiVersions : assessmentDmiVersions
        const nextVersionNumber = existingVersions.length + 1
        // Seed the Board/Subject onto the new version from the course category so
        // the DMI carries them as real data (not just a derived-on-the-fly badge).
        // Board is assessment-only; honour a manual Board override; both are
        // derived from the tutor's own category — never fabricated.
        const seedExam = deriveExamContext(pciCategory || null, courseName)
        const newVersion: DMIVersion = {
          id: `dmi-version-${Date.now()}`,
          versionNumber: nextVersionNumber,
          items: dmiItems,
          createdAt: Date.now(),
          taskId: isTask ? loadedTaskId || undefined : undefined,
          assessmentId: !isTask ? loadedAssessmentId || undefined : undefined,
          examBody: !isTask ? pciBoardOverride || seedExam.examBody || undefined : undefined,
          subject: seedExam.subject || pciCategory || undefined,
          // ASMT-4: section grouping + total marks derived from the questions.
          sections: deriveSections(dmiItems),
          totalMarks: deriveTotalMarks(dmiItems),
        }

        // Remember how this DMI was classified so the tutor can override a wrong
        // call (see the "Detected as …" banner) without needing the model to be
        // unsure. study_material is inferred when the tutor supplied a question spec.
        const detectedKind: 'question_paper' | 'study_material' =
          data.documentKind === 'study_material' || (questionSpec?.length ?? 0) > 0
            ? 'study_material'
            : 'question_paper'
        setDmiDocumentKind(prev => ({ ...prev, [type]: detectedKind }))

        if (isTask) {
          setTaskDmiItems(dmiItems)
          setTaskDmiVersions(prev => [...prev, newVersion])
          setTestPciSource('task')
          setTestPciViewMode(`dmi_${newVersion.id}`)
        } else {
          setAssessmentDmiItems(dmiItems)
          setAssessmentDmiVersions(prev => [...prev, newVersion])
          setTestPciSource('assessment')
          setTestPciViewMode(`dmi_${newVersion.id}`)
        }

        toast.success(`DMI form v${nextVersionNumber} created with ${dmiItems.length} questions`)

        // Study material: the AI also drafted answers — open the review modal so
        // the tutor can set marks and vet/approve the answers before deploying.
        if (isStudyMaterial) {
          setDmiEditor({ source: isTask ? 'task' : 'assessment' })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate DMI'
        toast.error(message)
      } finally {
        setDmiGenerating(false)
      }
    }

    // Confirm the study-material question spec and re-run generation with it.
    const handleConfirmDmiSpec = () => {
      if (!dmiSpecDialog) return
      const spec = dmiSpecRows.filter(r => r.count > 0)
      if (spec.length === 0) {
        toast.error('Add at least one question type with a count above zero.')
        return
      }
      const { type } = dmiSpecDialog
      setDmiSpecDialog(null)
      void handleGenerateDMI(type, spec)
    }

    // Content-source choice → re-run generation forcing the picked source.
    // The source chooser is shown only after the format step is resolved, so
    // re-run with skipFormatPrompt=true to avoid re-opening the format chooser.
    const handleChooseDmiDocument = () => {
      const type = dmiSourceDialog?.type
      setDmiSourceDialog(null)
      dmiContentSourceRef.current = 'document'
      if (type) void handleGenerateDMI(type, undefined, undefined, true, 'document')
    }
    const handleChooseDmiTypedText = () => {
      const type = dmiSourceDialog?.type
      setDmiSourceDialog(null)
      dmiContentSourceRef.current = 'text'
      if (type) void handleGenerateDMI(type, undefined, undefined, true, 'text')
    }

    // Response-format choice → free-response runs the AI flow; multiple-choice
    // opens the MCQ configuration dialog (no AI).
    const handleChooseFreeResponse = () => {
      const type = dmiFormatDialog?.type
      setDmiFormatDialog(null)
      if (type) void handleGenerateDMI(type, undefined, undefined, true)
    }
    const handleChooseMultipleChoice = () => {
      const type = dmiFormatDialog?.type
      setDmiFormatDialog(null)
      if (!type) return
      setMcqSections([{ name: '', count: 10 }])
      setMcqChoices(4)
      setMcqMarks(1)
      setMcqConfigDialog({ type })
    }

    // Build the MCQ DMI locally from the tutor's configuration — no LLM call.
    // Each question is a blank `mcq` with N lettered choices; the tutor then
    // clicks the correct option (which fills the answer key). Grouped by the
    // named sections, numbered continuously across the paper.
    const generateMcqDmi = () => {
      const type = mcqConfigDialog?.type
      if (!type) return
      const sections = mcqSections
        .map(s => ({ name: s.name.trim(), count: Math.max(0, Math.round(s.count) || 0) }))
        .filter(s => s.count > 0)
      if (sections.length === 0) {
        toast.error('Add at least one section with a question count above zero.')
        return
      }
      const choices = Math.max(2, Math.min(8, Math.round(mcqChoices) || 4))
      const marks = Math.max(1, Math.round(mcqMarks) || 1)
      const items: DMIQuestion[] = []
      let n = 0
      for (const sec of sections) {
        for (let i = 0; i < sec.count; i++) {
          n++
          items.push({
            id: `dmi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            questionNumber: n,
            questionLabel: String(n),
            questionText: '',
            answer: '',
            marks,
            questionType: 'mcq',
            options: Array(choices).fill(''),
            section: sec.name || undefined,
          })
        }
      }
      if (items.length > 200) {
        toast.error('That is over 200 questions — please split it up.')
        return
      }
      const isTask = type === 'task'
      const existingVersions = isTask ? taskDmiVersions : assessmentDmiVersions
      const nextVersionNumber = existingVersions.length + 1
      const newVersion: DMIVersion = {
        id: `dmi-version-${Date.now()}`,
        versionNumber: nextVersionNumber,
        items,
        createdAt: Date.now(),
        taskId: isTask ? loadedTaskId || undefined : undefined,
        assessmentId: !isTask ? loadedAssessmentId || undefined : undefined,
        sections: deriveSections(items),
        totalMarks: deriveTotalMarks(items),
      }
      setDmiDocumentKind(prev => ({ ...prev, [type]: 'question_paper' }))
      if (isTask) {
        setTaskDmiItems(items)
        setTaskDmiVersions(prev => [...prev, newVersion])
        setTestPciSource('task')
        setTestPciViewMode(`dmi_${newVersion.id}`)
      } else {
        setAssessmentDmiItems(items)
        setAssessmentDmiVersions(prev => [...prev, newVersion])
        setTestPciSource('assessment')
        setTestPciViewMode(`dmi_${newVersion.id}`)
      }
      setMcqConfigDialog(null)
      toast.success(
        `DMI created with ${items.length} multiple-choice question${items.length !== 1 ? 's' : ''} — click the correct option for each.`
      )
      // Open the editor so the tutor can immediately mark the correct answers.
      setDmiEditor({ source: type })
    }

    // Load a specific DMI version
    const handleLoadDmiVersion = (version: DMIVersion, type: 'task' | 'assessment') => {
      if (type === 'task') {
        setTaskDmiItems(version.items || [])
      } else {
        setAssessmentDmiItems(version.items || [])
      }
      setShowDmiVersionList(false)

      // Also open the Test tab and display this DMI
      const content = type === 'task' ? taskBuilder.taskContent : assessmentBuilder.taskContent
      setTestPciScores({})
      setTestPciInputs({ classroom: '', student1: '', student2: '' })
      setTestPciContent({
        classroom: content,
        student1: content,
        student2: content,
      })
      setTestPciSource(type)
      setTestPciViewMode(`dmi_${version.id}`)
      setTestPciActiveTab('classroom')
      // Switch to the Test tab. setMainTab notifies the parent route; with
      // `mainTab` fully controlled there is no local mirror to desync.
      setMainTab('test-pci')

      toast.success(`Loaded DMI version ${version.versionNumber}`)
    }

    // Delete a DMI version
    const handleDeleteDmiVersion = (versionId: string, type: 'task' | 'assessment') => {
      if (type === 'task') {
        setTaskDmiVersions(prev => prev.filter(v => v.id !== versionId))
      } else {
        setAssessmentDmiVersions(prev => prev.filter(v => v.id !== versionId))
      }
    }

    useEffect(() => {
      return () => {
        for (const url of objectUrlsRef.current) {
          try {
            URL.revokeObjectURL(url)
          } catch {
            // ignore
          }
        }
        objectUrlsRef.current = []
      }
    }, [])

    // Modal states
    const [activeModal, setActiveModal] = useState<{
      type: 'node' | 'lesson' | 'task' | 'homework' | 'nodeQuiz' | 'content'
      isOpen: boolean
      nodeId?: string
      lessonId?: string
      itemId?: string
    }>({ type: 'node', isOpen: false })

    const [editingData, setEditingData] = useState<any>(null)
    const [activeDragId, setActiveDragId] = useState<string | null>(null)
    // "Move to lesson…" dialog (kebab flow). sourceNodeId is excluded from the
    // target list so the item isn't "moved" to the lesson it already lives in.
    const [moveDialog, setMoveDialog] = useState<{
      itemType: 'task' | 'assessment'
      itemId: string
      itemTitle: string
      sourceNodeId: string
    } | null>(null)
    const [moveTarget, setMoveTarget] = useState<string>('')

    useEffect(() => {
      if (lastInitialCourseBuilderNodesKeyRef.current === initialCourseBuilderNodesKey) return
      lastInitialCourseBuilderNodesKeyRef.current = initialCourseBuilderNodesKey

      const courseChanged = lastHydratedCourseIdRef.current !== (courseId ?? null)
      lastHydratedCourseIdRef.current = courseId ?? null

      const normalized = normalizeCourseBuilderNodesForAssessments(
        resolvedInitialCourseBuilderNodes
      )
      const hydrateLive = (nodes: CourseBuilderNode[]) =>
        setLiveNodes(isStudentView || saveMode !== 'draft' ? cloneNodes(nodes) : [])

      if (courseChanged) {
        // Switched to a different course (or first mount): replace wholesale.
        // Don't merge — builderNodes still holds the previous course's lessons.
        mergedRealLoadCourseIdRef.current = normalized.length > 0 ? (courseId ?? null) : null
        setBuilderNodes(normalized)
        hydrateLive(normalized)
        return
      }

      // Same course. The FIRST time real (non-empty) loaded data lands — the
      // background load finishing AFTER the builder opened empty — MERGE it with
      // any lessons the tutor added during the load window. Skipping it (as #1127
      // did) would leave builderNodes without the DB lessons, and the next
      // delete-missing save would soft-delete them (the "lessons disappear" bug).
      if (normalized.length > 0 && mergedRealLoadCourseIdRef.current !== (courseId ?? null)) {
        mergedRealLoadCourseIdRef.current = courseId ?? null
        const merged = mergeLoadedWithPendingEdits(normalized, builderNodes)
        setBuilderNodes(merged)
        hydrateLive(merged)
        return
      }

      // A later re-fetch for the same course must NOT clobber in-progress edits;
      // only re-hydrate while the builder is still empty. builderNodes is read
      // (not depended on) intentionally: the effect only re-runs on key/course
      // change, at which point it reflects the latest edits.
      if (!shouldRehydrateBuilder(courseChanged, builderNodes.length)) return
      setBuilderNodes(normalized)
      hydrateLive(normalized)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [courseId, initialCourseBuilderNodesKey, resolvedInitialCourseBuilderNodes])

    // Helper to get effective value based on difficulty mode and preview
    const getEffectiveValue = <T extends WithDifficultyVariants>(
      item: T,
      field: keyof DifficultyVariant
    ): any => {
      if (devMode === 'single' || previewDifficulty === 'all' || item.difficultyMode === 'all') {
        return item[field as keyof T]
      }

      if (item.difficultyMode === 'fixed' && item.fixedDifficulty) {
        // If previewing a different difficulty than fixed, show base with warning indicator
        return item[field as keyof T]
      }

      // Adaptive mode - show variant for previewed difficulty
      const variant = item.variants?.[previewDifficulty]
      return variant?.[field] ?? item[field as keyof T]
    }

    // Dnd-kit sensors — disabled in live/published mode
    const pointerSensor = useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
    const keyboardSensor = useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
    const sensors = useSensors(...(canEdit ? [pointerSensor, keyboardSensor] : []))

    const toggleCourseBuilderNode = (nodeId: string) => {
      const newSet = new Set(expandedCourseBuilderNodes)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      setExpandedCourseBuilderNodes(newSet)
    }

    const toggleSection = (nodeId: string, section: 'task' | 'assessment' | 'homework') => {
      const key = `${nodeId}:${section}`
      setCollapsedSections(prev => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
    }

    const isSectionCollapsed = (nodeId: string, section: 'task' | 'assessment' | 'homework') =>
      collapsedSections.has(`${nodeId}:${section}`)

    const ensureSectionExpanded = (nodeId: string, section: 'task' | 'assessment' | 'homework') => {
      setExpandedCourseBuilderNodes(prev => {
        const next = new Set(prev)
        next.add(nodeId)
        return next
      })
      setCollapsedSections(prev => {
        const next = new Set(prev)
        next.delete(`${nodeId}:${section}`)
        return next
      })
    }

    // Reveal an item in the Curriculum panel after a document load: select it,
    // expand its node + section, then scroll its row to the top of the Curriculum
    // panel. React may need more than one frame to commit a newly created row or
    // expanded section, so we retry the DOM lookup for up to ~1s before giving up.
    const revealCurriculumItem = (type: 'task' | 'homework', id: string) => {
      setSelectedItem({ type, id })

      const scrollToItem = () => {
        // Expand the item's node/section first (no-op if already expanded).
        const resolved = resolveSelectedItem({ type, id }, nodesRef.current)
        if (resolved) {
          let section: 'task' | 'assessment' | 'homework' = type === 'task' ? 'task' : 'assessment'
          if (
            type === 'homework' &&
            'category' in resolved.item &&
            (resolved.item as any).category === 'homework'
          ) {
            section = 'homework'
          }
          ensureSectionExpanded(resolved.nodeId, section)
        }

        // Wait for the DOM to reflect the expansion, then scroll with retries.
        window.setTimeout(() => {
          let attempts = 0
          const tryScroll = () => {
            const el = document.querySelector(
              `[data-curriculum-item="${type}:${id}"]`
            ) as HTMLElement | null
            if (el) {
              const viewport = el.closest<HTMLElement>('[data-radix-scroll-area-viewport]')
              if (viewport) {
                const relativeTop =
                  el.getBoundingClientRect().top - viewport.getBoundingClientRect().top
                const targetScrollTop = Math.max(0, viewport.scrollTop + relativeTop - 16)
                viewport.scrollTo({ top: targetScrollTop, behavior: 'smooth' })
              } else {
                el.scrollIntoView({ block: 'start', behavior: 'smooth' })
              }
              return
            }
            attempts += 1
            if (attempts <= 16) {
              window.setTimeout(tryScroll, 60)
            }
          }
          tryScroll()
        }, 80)
      }

      window.setTimeout(scrollToItem, 50)
    }

    // Add handlers
    // Next lesson number = one past the HIGHEST existing "Lesson N" — not the
    // count. So after deleting Lesson 3 (leaving 1, 2, 4) a new lesson is "Lesson
    // 5", never colliding with 4 or silently refilling the gap. The gap at 3 only
    // fills when a tutor manually renames a lesson to "Lesson 3".
    const nextLessonNumber = (mods: CourseBuilderNode[]): number => {
      let max = 0
      for (const mod of mods) {
        const m = /^Lesson\s+(\d+)/i.exec(mod.title || '')
        if (m) max = Math.max(max, parseInt(m[1], 10))
      }
      return max + 1
    }

    const addCourseBuilderNode = () => {
      // Create a new lesson directly without opening modal
      const newOrder = nodes.length
      const newCourseBuilderNode = DEFAULT_NODE(newOrder)
      // Number by the next available (highest+1), preserving any gaps.
      const num = nextLessonNumber(nodes)
      newCourseBuilderNode.title = `Lesson ${num}`
      newCourseBuilderNode.lessons[0].title = `Lesson ${num}`

      setCourseBuilderNodes([...nodes, newCourseBuilderNode])
      setExpandedCourseBuilderNodes(
        new Set([...expandedCourseBuilderNodes, newCourseBuilderNode.id])
      )
      // Do NOT open modal - just create directly
    }

    const addTask = (nodeId: string, lessonId: string) => {
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      if (nodeIndex === -1) return
      let lessonIndex = nodes[nodeIndex].lessons.findIndex(l => l.id === lessonId)
      if (lessonIndex === -1) {
        const fallbackLesson = DEFAULT_LESSON(nodes[nodeIndex].lessons.length)
        const newCourseBuilderNodes = [...nodes]
        newCourseBuilderNodes[nodeIndex].lessons.push(fallbackLesson)
        setCourseBuilderNodes(newCourseBuilderNodes)
        lessonIndex = newCourseBuilderNodes[nodeIndex].lessons.length - 1
      }

      const isFirstTask = nodes[nodeIndex].lessons[lessonIndex].tasks.length === 0
      const newTask = DEFAULT_TASK(nodes[nodeIndex].lessons[lessonIndex].tasks.length)
      const newCourseBuilderNodes = [...nodes]
      newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks.push(newTask)
      setCourseBuilderNodes(newCourseBuilderNodes)
      if (isFirstTask) ensureSectionExpanded(nodeId, 'task')
      setEditingData(newTask)
      setActiveModal({ type: 'task', isOpen: true, nodeId, lessonId })
    }

    const addContent = (nodeId: string, lessonId: string) => {
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      if (nodeIndex === -1) return
      const lessonIndex = nodes[nodeIndex].lessons.findIndex(l => l.id === lessonId)
      if (lessonIndex === -1) return

      const newContent = DEFAULT_CONTENT(nodes[nodeIndex].lessons[lessonIndex].content?.length || 0)
      const newCourseBuilderNodes = [...nodes]
      if (!newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].content) {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].content = []
      }
      newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].content.push(newContent)
      setCourseBuilderNodes(newCourseBuilderNodes)
      setEditingData(newContent)
      setActiveModal({ type: 'content', isOpen: true, nodeId, lessonId })
    }

    const addAssessment = (nodeId: string, lessonId: string) => {
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      if (nodeIndex === -1) return
      let lessonIndex = nodes[nodeIndex].lessons.findIndex(l => l.id === lessonId)
      if (lessonIndex === -1) {
        const fallbackLesson = DEFAULT_LESSON(nodes[nodeIndex].lessons.length)
        const newCourseBuilderNodes = [...nodes]
        newCourseBuilderNodes[nodeIndex].lessons.push(fallbackLesson)
        setCourseBuilderNodes(newCourseBuilderNodes)
        lessonIndex = newCourseBuilderNodes[nodeIndex].lessons.length - 1
      }

      const isFirstAssessment = nodes[nodeIndex].lessons[lessonIndex].homework.length === 0
      const newAssessment = DEFAULT_HOMEWORK(
        nodes[nodeIndex].lessons[lessonIndex].homework.length,
        'assessment'
      )
      const newCourseBuilderNodes = [...nodes]
      newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework.push(newAssessment)
      setCourseBuilderNodes(newCourseBuilderNodes)
      if (isFirstAssessment) ensureSectionExpanded(nodeId, 'assessment')
      // Just add to list without opening modal - same as addTask behavior
      toast.success('Assessment added')
    }

    const addCourseExam = () => {
      const workingCourseBuilderNodes = nodes.length > 0 ? [...nodes] : [DEFAULT_NODE(0)]
      const lastCourseBuilderNodeIndex = workingCourseBuilderNodes.length - 1
      const lastCourseBuilderNode = workingCourseBuilderNodes[lastCourseBuilderNodeIndex]
      const newExam = {
        ...DEFAULT_NODE_QUIZ(lastCourseBuilderNode.quizzes.length),
        title: 'Final Exam',
        description: 'Comprehensive course-end assessment.',
      }
      workingCourseBuilderNodes[lastCourseBuilderNodeIndex] = {
        ...lastCourseBuilderNode,
        quizzes: [...(lastCourseBuilderNode.quizzes || []), newExam],
      }
      setCourseBuilderNodes(workingCourseBuilderNodes)
      setExpandedCourseBuilderNodes(
        new Set([
          ...expandedCourseBuilderNodes,
          workingCourseBuilderNodes[lastCourseBuilderNodeIndex].id,
        ])
      )
      setEditingData(newExam)
      setActiveModal({
        type: 'nodeQuiz',
        isOpen: true,
        nodeId: workingCourseBuilderNodes[lastCourseBuilderNodeIndex].id,
      })
      toast.success('Final exam added to end of course')
    }

    const ensureFirstLessonContext = useCallback(() => {
      let nextCourseBuilderNodes = [...nodes]
      if (nextCourseBuilderNodes.length === 0) {
        nextCourseBuilderNodes = [DEFAULT_NODE(0)]
      }
      if (nextCourseBuilderNodes[0].lessons.length === 0) {
        nextCourseBuilderNodes[0] = {
          ...nextCourseBuilderNodes[0],
          lessons: [DEFAULT_LESSON(0)],
        }
      }
      setCourseBuilderNodes(nextCourseBuilderNodes)
      setExpandedCourseBuilderNodes(
        new Set([...expandedCourseBuilderNodes, nextCourseBuilderNodes[0].id])
      )
      return {
        nodeId: nextCourseBuilderNodes[0].id,
        lessonId: nextCourseBuilderNodes[0].lessons[0].id,
      }
    }, [expandedCourseBuilderNodes, nodes])

    // Create a fresh "Lesson N" and return its ids (for the "New lesson" choice
    // when loading a document from its kebab menu).
    const createNewLessonTarget = useCallback((): { nodeId: string; lessonId: string } => {
      const newOrder = nodes.length
      const newNode = DEFAULT_NODE(newOrder)
      // Next available number (highest+1), preserving gaps — see nextLessonNumber.
      let maxNum = 0
      for (const mod of nodes) {
        const m = /^Lesson\s+(\d+)/i.exec(mod.title || '')
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10))
      }
      newNode.title = `Lesson ${maxNum + 1}`
      newNode.lessons[0].title = `Lesson ${maxNum + 1}`
      setCourseBuilderNodes([...nodes, newNode])
      setExpandedCourseBuilderNodes(new Set([...expandedCourseBuilderNodes, newNode.id]))
      return { nodeId: newNode.id, lessonId: newNode.lessons[0].id }
    }, [expandedCourseBuilderNodes, nodes, setCourseBuilderNodes])

    // Where a document load should land: the lesson the tutor picked from the
    // kebab flow, else the first lesson (the previous always-Lesson-1 behavior).
    const resolveAssetLoadTarget = useCallback(
      () => assetLoadTarget ?? ensureFirstLessonContext(),
      [assetLoadTarget, ensureFirstLessonContext]
    )

    // Auto-create task when typing in Task Builder without loaded task
    const autoCreateTask = useCallback(() => {
      const { nodeId, lessonId } = ensureFirstLessonContext()
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      const lessonIndex = nodes[nodeIndex]?.lessons.findIndex(l => l.id === lessonId)
      if (nodeIndex === -1 || lessonIndex === -1) return null

      const isFirstTask = nodes[nodeIndex].lessons[lessonIndex].tasks.length === 0
      const newTask = DEFAULT_TASK(nodes[nodeIndex].lessons[lessonIndex].tasks.length)
      const newCourseBuilderNodes = [...nodes]
      newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks.push(newTask)
      setCourseBuilderNodes(newCourseBuilderNodes)
      if (isFirstTask) ensureSectionExpanded(nodeId, 'task')
      setLoadedTaskId(newTask.id)
      setTaskBuilder({
        title: newTask.title,
        taskContent: '',
        taskPci: '',
        details: newTask.shortDescription || '',
        extensions: [],
        activeExtensionId: null,
      })
      toast.success('New task created')
      return newTask
    }, [nodes, ensureFirstLessonContext])

    // Auto-create assessment when typing in Assessment Builder without loaded assessment
    const autoCreateAssessment = useCallback(() => {
      const { nodeId, lessonId } = ensureFirstLessonContext()
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      const lessonIndex = nodes[nodeIndex]?.lessons.findIndex(l => l.id === lessonId)
      if (nodeIndex === -1 || lessonIndex === -1) return null

      const isFirstAssessment = nodes[nodeIndex].lessons[lessonIndex].homework.length === 0
      const newAssessment = DEFAULT_HOMEWORK(
        nodes[nodeIndex].lessons[lessonIndex].homework.length,
        'assessment'
      )
      const newCourseBuilderNodes = [...nodes]
      newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework.push(newAssessment)
      setCourseBuilderNodes(newCourseBuilderNodes)
      if (isFirstAssessment) ensureSectionExpanded(nodeId, 'assessment')
      setLoadedAssessmentId(newAssessment.id)
      setAssessmentBuilder({
        title: newAssessment.title,
        taskContent: '',
        taskPci: '',
        details: '',
        extensions: [],
        activeExtensionId: null,
      })
      toast.success('New assessment created')
      return newAssessment
    }, [nodes, ensureFirstLessonContext])

    // When a task has only manually-typed text (no uploaded PDF), generate a PDF
    // from that text and upload it so the task behaves identically to a loaded
    // document in Test mode and in live classrooms.
    const generatingTaskDocRef = useRef(false)
    const ensureTaskTextDocument = useCallback(async () => {
      if (generatingTaskDocRef.current) return
      if (!loadedTaskId) return

      const isExtension = !!taskBuilder.activeExtensionId
      const content = isExtension
        ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)?.content || ''
        : taskBuilder.taskContent
      const trimmed = content.trim()
      if (!trimmed) return

      const existingDoc = isExtension
        ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)?.sourceDocument
        : taskBuilder.sourceDocument
      // If a real uploaded document is present, never overwrite it.
      if (existingDoc && !existingDoc.generatedFromText) return
      // Already generated and content hasn't changed AND snapshot version matches → nothing to do.
      if (
        existingDoc?.generatedFromText &&
        existingDoc.extractedText === content &&
        existingDoc.snapshotVersion === TASK_TEXT_SNAPSHOT_VERSION
      )
        return

      generatingTaskDocRef.current = true
      try {
        const { blob, fileName, snapshotVersion } = await generateTaskTextPDF(
          taskBuilder.title || 'Task',
          content
        )
        const file = new File([blob], fileName, { type: 'application/pdf' })
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetchWithCsrf('/api/uploads/documents', {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          toast.error(data.error || `Failed to upload ${fileName}`)
          return
        }
        const data = await res.json()
        const newDoc = {
          fileName: data.name || fileName,
          fileUrl: data.url || '',
          fileKey: data.key || '',
          mimeType: data.type || 'application/pdf',
          uploadedAt: new Date().toISOString(),
          extractedText: content,
          generatedFromText: true,
          snapshotVersion,
        }

        if (isExtension) {
          setTaskBuilder(prev => ({
            ...prev,
            extensions: prev.extensions.map(ext =>
              ext.id === prev.activeExtensionId ? { ...ext, sourceDocument: newDoc } : ext
            ),
          }))
        } else {
          setTaskSourceDocument(newDoc)
          setTaskUploadedFiles([{ id: 'source', name: newDoc.fileName }])
          setTaskBuilder(prev => ({ ...prev, sourceDocument: newDoc }))
        }

        setCourseBuilderNodes(prev =>
          prev.map(mod => ({
            ...mod,
            lessons: mod.lessons.map(lesson => ({
              ...lesson,
              tasks: lesson.tasks.map(task => {
                if (task.id !== loadedTaskId) return task
                if (isExtension) {
                  return {
                    ...task,
                    extensions: (task.extensions || []).map(ext =>
                      ext.id === taskBuilder.activeExtensionId
                        ? { ...ext, sourceDocument: newDoc }
                        : ext
                    ),
                  }
                }
                return { ...task, sourceDocument: newDoc, description: content }
              }),
            })),
          }))
        )
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to convert text to PDF')
      } finally {
        generatingTaskDocRef.current = false
      }
    }, [
      loadedTaskId,
      taskBuilder.activeExtensionId,
      taskBuilder.extensions,
      taskBuilder.sourceDocument,
      taskBuilder.taskContent,
      taskBuilder.title,
    ])

    // Ref so effects can reach the latest generation helper without taking a
    // dependency on the taskBuilder closure (which changes on every keystroke).
    const ensureTaskTextDocumentRef = useRef(ensureTaskTextDocument)
    useEffect(() => {
      ensureTaskTextDocumentRef.current = ensureTaskTextDocument
    }, [ensureTaskTextDocument])

    // If a text-only task is selected while already in Test or Live mode,
    // generate its PDF snapshot so the preview sees a real document.
    // handleMainTabChange covers switching *into* Test/Live; this covers
    // switching tasks within those modes.
    useEffect(() => {
      if (mainTab !== 'test-pci' && mainTab !== 'live') return
      if (mainBuilderTab !== 'task') return
      if (!loadedTaskId) return
      ensureTaskTextDocumentRef.current()
    }, [mainTab, mainBuilderTab, loadedTaskId])

    const handleMainTabChange = useCallback(
      async (v: string) => {
        const next = v as 'live' | 'builder' | 'test-pci'
        // Switching to Live shows liveNodes, a snapshot separate from the
        // builderNodes the Build tab edits. Sync the latest builder content
        // into it first so edits made in Build don't vanish on the Live tab.
        // Bump prevMainTabRef so the transition effect skips a redundant sync.
        if (next === 'live') {
          // If the active task only has typed text, generate its PDF snapshot
          // before syncing it into the live preview so the classroom sees a
          // real, clickable sourceDocument just like an uploaded PDF.
          if (mainBuilderTab === 'task') {
            setPreparingTestPreview(true)
            await ensureTaskTextDocument()
            setPreparingTestPreview(false)
          }
          handleSyncToLive()
          prevMainTabRef.current = 'live'
        }
        // If the active task only has typed text, generate its PDF document
        // before switching to Test so the preview sees a real, clickable
        // sourceDocument just like an uploaded PDF.
        if (next === 'test-pci' && mainBuilderTab === 'task') {
          setPreparingTestPreview(true)
          await ensureTaskTextDocument()
          setPreparingTestPreview(false)
        }
        setMainTab(next)
      },
      [ensureTaskTextDocument, handleSyncToLive, mainBuilderTab, setMainTab]
    )

    const assetsLesson = nodes[0]?.lessons?.[0] ?? null

    const applyTemplate = useCallback(
      (template: (typeof CONTENT_TEMPLATES)[number]) => {
        if (template.category === 'lesson') {
          addCourseBuilderNode()
          toast.success(`Template applied: ${template.name}`)
          return
        }
        const { nodeId, lessonId } = ensureFirstLessonContext()
        if (template.category === 'quiz') {
          addAssessment(nodeId, lessonId)
          toast.success(`Template applied: ${template.name}`)
          return
        }
        if (template.category === 'assessment' || template.category === 'activity') {
          addTask(nodeId, lessonId)
          toast.success(`Template applied: ${template.name}`)
          return
        }
        toast.success(`Template selected: ${template.name}`)
      },
      [addAssessment, addCourseBuilderNode, addTask, ensureFirstLessonContext]
    )

    // Drag & Drop handlers
    const handleDragStart = (event: DragStartEvent) => {
      setActiveDragId(event.active.id as string)
    }

    // Update lesson positions after reordering WITHOUT renaming. Lesson numbers
    // are the tutor's to set — they must stay stable (and any gaps persist) until
    // a tutor manually renames, so reordering only changes `order`, not the title.
    const renumberCourseBuilderNodes = (mods: CourseBuilderNode[]): CourseBuilderNode[] => {
      return mods.map((mod, idx) => ({
        ...mod,
        order: idx,
      }))
    }

    const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event
      setActiveDragId(null)

      if (!over || active.id === over.id) return

      const activeId = active.id as string
      const overId = over.id as string

      const findTaskLocation = (id: string) => {
        for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
          for (let lIdx = 0; lIdx < nodes[nIdx].lessons.length; lIdx++) {
            const taskIndex = nodes[nIdx].lessons[lIdx].tasks.findIndex(t => t.id === id)
            if (taskIndex !== -1) return { nIdx, lIdx, taskIndex }
          }
        }
        return null
      }

      const findHomeworkLocation = (id: string) => {
        for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
          for (let lIdx = 0; lIdx < nodes[nIdx].lessons.length; lIdx++) {
            const hwIndex = nodes[nIdx].lessons[lIdx].homework.findIndex(h => h.id === id)
            if (hwIndex !== -1) return { nIdx, lIdx, hwIndex }
          }
        }
        return null
      }

      const findLessonByCourseBuilderNodeId = (id: string) => {
        const nodeIndex = nodes.findIndex(m => m.id === id)
        if (nodeIndex === -1) return null
        return { nIdx: nodeIndex, lIdx: 0 }
      }

      // Drop onto Homework folder (move task/assessment to that lesson's homework)
      if (typeof overId === 'string' && overId.startsWith('drop-hw-')) {
        const rest = overId.slice('drop-hw-'.length)
        const sep = rest.indexOf('::')
        const targetCourseBuilderNodeId = sep >= 0 ? rest.slice(0, sep) : rest
        const targetLessonId = sep >= 0 ? rest.slice(sep + 2) : ''
        if (targetCourseBuilderNodeId && targetLessonId) {
          const taskLoc = findTaskLocation(activeId)
          const hwLoc = findHomeworkLocation(activeId)
          if (taskLoc) {
            const task = nodes[taskLoc.nIdx].lessons[taskLoc.lIdx].tasks[taskLoc.taskIndex]
            moveToHomework(targetCourseBuilderNodeId, targetLessonId, 'task', task)
            setCourseBuilderNodes(prev =>
              prev.map((mod, nIdx) => {
                if (nIdx !== taskLoc.nIdx) return mod
                return {
                  ...mod,
                  lessons: mod.lessons.map((les, lIdx) => {
                    if (lIdx !== taskLoc.lIdx) return les
                    return { ...les, tasks: les.tasks.filter(t => t.id !== activeId) }
                  }),
                }
              })
            )
            return
          }
          if (hwLoc) {
            const hw = nodes[hwLoc.nIdx].lessons[hwLoc.lIdx].homework[hwLoc.hwIndex]
            moveToHomework(targetCourseBuilderNodeId, targetLessonId, 'assessment', hw)
            setCourseBuilderNodes(prev =>
              prev.map((mod, nIdx) => {
                if (nIdx !== hwLoc.nIdx) return mod
                return {
                  ...mod,
                  lessons: mod.lessons.map((les, lIdx) => {
                    if (lIdx !== hwLoc.lIdx) return les
                    return { ...les, homework: les.homework.filter(h => h.id !== activeId) }
                  }),
                }
              })
            )
            return
          }
        }
      }

      // Drag from Homework to Tasks: convert homework (assessment) to task and add to target lesson's tasks
      if (typeof overId === 'string' && overId.startsWith('drop-task-')) {
        const rest = overId.slice('drop-task-'.length)
        const sep = rest.indexOf('::')
        const targetCourseBuilderNodeId = sep >= 0 ? rest.slice(0, sep) : rest
        const targetLessonId = sep >= 0 ? rest.slice(sep + 2) : ''
        // Dragging a TASK onto another lesson's task section → move it there
        // (keeps it a task; carries extensions; renames on name collision).
        const taskLoc = findTaskLocation(activeId)
        if (taskLoc && targetCourseBuilderNodeId && targetLessonId) {
          const srcLessonId = nodes[taskLoc.nIdx].lessons[taskLoc.lIdx].id
          if (srcLessonId !== targetLessonId) {
            void moveItemToLesson('task', activeId, {
              kind: 'existing',
              nodeId: targetCourseBuilderNodeId,
            })
            return
          }
        }
        const hwLoc = findHomeworkLocation(activeId)
        if (hwLoc && targetCourseBuilderNodeId && targetLessonId) {
          const hw = nodes[hwLoc.nIdx].lessons[hwLoc.lIdx].homework[hwLoc.hwIndex]
          const newTask: Task = {
            id: `task-${generateId()}`,
            title: hw.title || 'Task',
            description: hw.description || '',
            instructions: hw.instructions || '',
            dmiItems: hw.dmiItems || [],
            estimatedMinutes: hw.estimatedMinutes ?? 15,
            points: hw.points ?? 10,
            submissionType: 'text',
            isAiGraded: false,
            difficultyMode: 'all',
            sourceDocument: deepCloneSourceDocument(hw.sourceDocument),
          }
          const srcModId = nodes[hwLoc.nIdx].id
          const srcLesId = nodes[hwLoc.nIdx].lessons[hwLoc.lIdx].id
          setCourseBuilderNodes(prev =>
            prev.map(mod => {
              if (mod.id !== targetCourseBuilderNodeId) {
                if (mod.id !== srcModId) return mod
                return {
                  ...mod,
                  lessons: mod.lessons.map(les =>
                    les.id === srcLesId
                      ? { ...les, homework: les.homework.filter(h => h.id !== activeId) }
                      : les
                  ),
                }
              }
              return {
                ...mod,
                lessons: mod.lessons.map(les => {
                  let next = les
                  if (les.id === srcLesId)
                    next = { ...next, homework: next.homework.filter(h => h.id !== activeId) }
                  if (les.id === targetLessonId)
                    next = { ...next, tasks: [...(next.tasks || []), newTask] }
                  return next
                }),
              }
            })
          )
          if (loadedAssessmentId === activeId) {
            setLoadedAssessmentId(null)
            setSelectedItem({ type: 'task', id: newTask.id })
            loadTaskIntoBuilder(newTask, null)
            setMainBuilderTab('task')
          }
          toast.success('Moved to tasks')
          return
        }
      }

      // Drag from Homework to Assessments: move homework item to target lesson as assessment (category !== homework)
      if (typeof overId === 'string' && overId.startsWith('drop-assessment-')) {
        const rest = overId.slice('drop-assessment-'.length)
        const sep = rest.indexOf('::')
        const targetCourseBuilderNodeId = sep >= 0 ? rest.slice(0, sep) : rest
        const targetLessonId = sep >= 0 ? rest.slice(sep + 2) : ''
        const hwLoc = findHomeworkLocation(activeId)
        if (hwLoc && targetCourseBuilderNodeId && targetLessonId) {
          const hw = nodes[hwLoc.nIdx].lessons[hwLoc.lIdx].homework[hwLoc.hwIndex]
          // Rename on collision with the target lesson's existing homework/assessments.
          const targetNode = nodes.find(m => m.id === targetCourseBuilderNodeId)
          const targetHwTitles = new Set<string>(
            (targetNode?.lessons.find(l => l.id === targetLessonId)?.homework || [])
              .filter(h => h.id !== hw.id)
              .map(h => (h.title || '').trim())
          )
          const asAssessment = {
            ...cloneAssessment(hw),
            title: uniqueMovedTitle(hw.title, targetHwTitles),
            category: 'assessment' as const,
            id: `a-${generateId()}`,
          }
          setCourseBuilderNodes(prev =>
            prev.map(mod => {
              if (mod.id === nodes[hwLoc.nIdx].id) {
                return {
                  ...mod,
                  lessons: mod.lessons.map((les, lIdx) =>
                    lIdx === hwLoc.lIdx
                      ? { ...les, homework: les.homework.filter(h => h.id !== activeId) }
                      : les
                  ),
                }
              }
              if (mod.id !== targetCourseBuilderNodeId) return mod
              return {
                ...mod,
                lessons: mod.lessons.map(les =>
                  les.id !== targetLessonId
                    ? les
                    : { ...les, homework: [...(les.homework || []), asAssessment] }
                ),
              }
            })
          )
          if (loadedAssessmentId === activeId) {
            setSelectedItem({ type: 'homework', id: asAssessment.id })
            loadAssessmentIntoBuilder(asAssessment)
          }
          toast.success('Moved to assessments')
          return
        }
      }

      // Check if dragging a lesson
      const activeCourseBuilderNodeIndex = nodes.findIndex(m => m.id === activeId)
      const overCourseBuilderNodeIndex = nodes.findIndex(m => m.id === overId)

      if (activeCourseBuilderNodeIndex !== -1 && overCourseBuilderNodeIndex !== -1) {
        const movedCourseBuilderNodes = arrayMove(
          nodes,
          activeCourseBuilderNodeIndex,
          overCourseBuilderNodeIndex
        )
        setCourseBuilderNodes(renumberCourseBuilderNodes(movedCourseBuilderNodes))
        return
      }

      // Check if dragging a lesson
      for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
        const activeLessonIndex = nodes[nIdx].lessons.findIndex(l => l.id === activeId)
        const overLessonIndex = nodes[nIdx].lessons.findIndex(l => l.id === overId)

        if (activeLessonIndex !== -1 && overLessonIndex !== -1) {
          const newCourseBuilderNodes = [...nodes]
          const movedLessons = arrayMove(
            newCourseBuilderNodes[nIdx].lessons,
            activeLessonIndex,
            overLessonIndex
          )
          // Reposition only — keep each lesson's title stable (no auto-renumber).
          newCourseBuilderNodes[nIdx].lessons = movedLessons.map((lesson, idx) => ({
            ...lesson,
            order: idx,
          }))
          setCourseBuilderNodes(newCourseBuilderNodes)
          return
        }
      }

      // Check if dragging content within a lesson
      for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
        for (let lIdx = 0; lIdx < nodes[nIdx].lessons.length; lIdx++) {
          const lesson = nodes[nIdx].lessons[lIdx]
          const activeContentIndex = lesson.content?.findIndex(c => c.id === activeId) ?? -1
          const overContentIndex = lesson.content?.findIndex(c => c.id === overId) ?? -1

          if (activeContentIndex !== -1 && overContentIndex !== -1) {
            const newCourseBuilderNodes = [...nodes]
            newCourseBuilderNodes[nIdx].lessons[lIdx].content = arrayMove(
              newCourseBuilderNodes[nIdx].lessons[lIdx].content,
              activeContentIndex,
              overContentIndex
            ).map((content, idx) => ({ ...content, order: idx }))
            setCourseBuilderNodes(newCourseBuilderNodes)
            return
          }
        }
      }

      // Check if dragging a task within a lesson
      for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
        for (let lIdx = 0; lIdx < nodes[nIdx].lessons.length; lIdx++) {
          const lesson = nodes[nIdx].lessons[lIdx]
          const activeTaskIndex = lesson.tasks?.findIndex(t => t.id === activeId) ?? -1
          const overTaskIndex = lesson.tasks?.findIndex(t => t.id === overId) ?? -1

          if (activeTaskIndex !== -1 && overTaskIndex !== -1) {
            const newCourseBuilderNodes = [...nodes]
            newCourseBuilderNodes[nIdx].lessons[lIdx].tasks = arrayMove(
              newCourseBuilderNodes[nIdx].lessons[lIdx].tasks,
              activeTaskIndex,
              overTaskIndex
            )
            setCourseBuilderNodes(newCourseBuilderNodes)
            return
          }
        }
      }

      // Move task across lessons
      const taskSource = findTaskLocation(activeId)
      if (taskSource) {
        const targetTaskLocation = findTaskLocation(overId)
        const targetLesson = targetTaskLocation
          ? { nIdx: targetTaskLocation.nIdx, lIdx: targetTaskLocation.lIdx }
          : findLessonByCourseBuilderNodeId(overId)
        if (
          targetLesson &&
          (taskSource.nIdx !== targetLesson.nIdx || taskSource.lIdx !== targetLesson.lIdx)
        ) {
          const newCourseBuilderNodes = [...nodes]
          const sourceTasks = newCourseBuilderNodes[taskSource.nIdx].lessons[taskSource.lIdx].tasks
          const [movedTask] = sourceTasks.splice(taskSource.taskIndex, 1)
          const targetTasks =
            newCourseBuilderNodes[targetLesson.nIdx].lessons[targetLesson.lIdx].tasks
          const insertIndex = targetTaskLocation
            ? targetTasks.findIndex(t => t.id === overId)
            : targetTasks.length
          targetTasks.splice(insertIndex === -1 ? targetTasks.length : insertIndex, 0, movedTask)
          setCourseBuilderNodes(newCourseBuilderNodes)
          return
        }
      }

      // Check if dragging homework within a lesson
      for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
        for (let lIdx = 0; lIdx < nodes[nIdx].lessons.length; lIdx++) {
          const lesson = nodes[nIdx].lessons[lIdx]
          const activeHwIndex = lesson.homework?.findIndex(h => h.id === activeId) ?? -1
          const overHwIndex = lesson.homework?.findIndex(h => h.id === overId) ?? -1

          if (activeHwIndex !== -1 && overHwIndex !== -1) {
            const newCourseBuilderNodes = [...nodes]
            newCourseBuilderNodes[nIdx].lessons[lIdx].homework = arrayMove(
              newCourseBuilderNodes[nIdx].lessons[lIdx].homework,
              activeHwIndex,
              overHwIndex
            )
            setCourseBuilderNodes(newCourseBuilderNodes)
            return
          }
        }
      }

      // Move homework/assessment across lessons
      const hwSource = findHomeworkLocation(activeId)
      if (hwSource) {
        const targetHwLocation = findHomeworkLocation(overId)
        const targetLesson = targetHwLocation
          ? { nIdx: targetHwLocation.nIdx, lIdx: targetHwLocation.lIdx }
          : findLessonByCourseBuilderNodeId(overId)
        if (
          targetLesson &&
          (hwSource.nIdx !== targetLesson.nIdx || hwSource.lIdx !== targetLesson.lIdx)
        ) {
          const newCourseBuilderNodes = [...nodes]
          const sourceHomework =
            newCourseBuilderNodes[hwSource.nIdx].lessons[hwSource.lIdx].homework
          const [movedHw] = sourceHomework.splice(hwSource.hwIndex, 1)
          const targetHomework =
            newCourseBuilderNodes[targetLesson.nIdx].lessons[targetLesson.lIdx].homework
          const insertIndex = targetHwLocation
            ? targetHomework.findIndex(h => h.id === overId)
            : targetHomework.length
          targetHomework.splice(
            insertIndex === -1 ? targetHomework.length : insertIndex,
            0,
            movedHw
          )
          setCourseBuilderNodes(newCourseBuilderNodes)
          return
        }
      }
    }

    // Save handlers
    const handleSaveCourseBuilderNode = async (data: any) => {
      const nextNodes = activeModal.itemId
        ? nodes.map(m => (m.id === activeModal.itemId ? { ...m, ...data } : m))
        : nodes.map(m => (m.id === editingData.id ? { ...m, ...data } : m))
      setCourseBuilderNodes(nextNodes)
      setActiveModal({ type: 'node', isOpen: false })
      toast.success('Lesson saved')
      if (mainTab !== 'live') await saveNodesIfPossible(nextNodes)
    }

    const handleSaveLesson = async (data: any) => {
      const nodeIndex = nodes.findIndex(m => m.id === activeModal.nodeId)
      if (nodeIndex === -1) return

      const newCourseBuilderNodes = [...nodes]
      const lessonIndex = newCourseBuilderNodes[nodeIndex].lessons.findIndex(
        l => l.id === editingData.id
      )
      if (lessonIndex !== -1) {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex] = {
          ...newCourseBuilderNodes[nodeIndex].lessons[lessonIndex],
          ...data,
        }
      }
      setCourseBuilderNodes(newCourseBuilderNodes)
      setActiveModal({ type: 'lesson', isOpen: false })
      toast.success('Lesson saved')
      if (mainTab !== 'live') await saveNodesIfPossible(newCourseBuilderNodes)
    }

    const handleSaveTask = async (
      data: any,
      targetCourseBuilderNodeId?: string,
      targetLessonId?: string
    ) => {
      const nodeId = targetCourseBuilderNodeId || activeModal.nodeId
      const lessonId = targetLessonId || activeModal.lessonId
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      const lessonIndex = nodes[nodeIndex]?.lessons.findIndex(l => l.id === lessonId)
      if (nodeIndex === -1 || lessonIndex === -1) return

      const newCourseBuilderNodes = [...nodes]
      const taskIndex = newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks.findIndex(
        t => t.id === editingData?.id
      )
      if (taskIndex !== -1) {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks[taskIndex] = data
      } else {
        // Add new task if not found
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks.push(data)
      }
      setCourseBuilderNodes(newCourseBuilderNodes)
      setActiveModal({ type: 'task', isOpen: false })
      toast.success('Task saved')
      if (mainTab !== 'live') await saveNodesIfPossible(newCourseBuilderNodes)
    }

    const handleSaveContent = async (data: Content) => {
      const nodeIndex = nodes.findIndex(m => m.id === activeModal.nodeId)
      const lessonIndex = nodes[nodeIndex]?.lessons.findIndex(l => l.id === activeModal.lessonId)
      if (nodeIndex === -1 || lessonIndex === -1) return

      const newCourseBuilderNodes = [...nodes]
      const contentIndex = newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].content?.findIndex(
        c => c.id === editingData?.id
      )
      if (contentIndex !== undefined && contentIndex !== -1) {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].content[contentIndex] = data
      } else {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].content.push(data)
      }
      setCourseBuilderNodes(newCourseBuilderNodes)
      setActiveModal({ type: 'content', isOpen: false })
      toast.success('Content saved')
      if (mainTab !== 'live') await saveNodesIfPossible(newCourseBuilderNodes)
    }

    const handleSaveAssessment = async (
      data: any,
      targetCourseBuilderNodeId?: string,
      targetLessonId?: string
    ) => {
      const nodeId = targetCourseBuilderNodeId || activeModal.nodeId
      const lessonId = targetLessonId || activeModal.lessonId
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      const lessonIndex = nodes[nodeIndex]?.lessons.findIndex(l => l.id === lessonId)
      if (nodeIndex === -1 || lessonIndex === -1) return

      const newCourseBuilderNodes = [...nodes]
      const hwIndex = newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework.findIndex(
        h => h.id === editingData?.id
      )
      if (hwIndex !== -1) {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework[hwIndex] = data
      } else {
        // Add new homework/assessment if not found
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework.push(data)
      }
      setCourseBuilderNodes(newCourseBuilderNodes)
      setActiveModal({ type: 'homework', isOpen: false })
      toast.success(data.category === 'homework' ? 'Homework saved' : 'Assessment saved')
      if (mainTab !== 'live') await saveNodesIfPossible(newCourseBuilderNodes)
    }

    const handleSaveCourseBuilderNodeQuiz = async (data: any) => {
      const nodeIndex = nodes.findIndex(m => m.id === activeModal.nodeId)
      if (nodeIndex === -1) return

      const newCourseBuilderNodes = [...nodes]
      const quizIndex = newCourseBuilderNodes[nodeIndex].quizzes.findIndex(
        q => q.id === editingData.id
      )
      if (quizIndex !== -1) {
        newCourseBuilderNodes[nodeIndex].quizzes[quizIndex] = data
      }
      setCourseBuilderNodes(newCourseBuilderNodes)
      setActiveModal({ type: 'nodeQuiz', isOpen: false })
      toast.success('Exam saved')
      if (mainTab !== 'live') await saveNodesIfPossible(newCourseBuilderNodes)
    }

    const saveNodesIfPossible = async (nextNodes: CourseBuilderNode[]) => {
      if (isStudentView) return
      if (!onSave) return
      if (!courseName?.trim() && !coursePropsModal.name?.trim()) {
        setCoursePropsModal(prev => ({ ...prev, isOpen: true }))
        return
      }

      await onSave(
        nextNodes.map(n => n.lessons[0] || ({} as any)),
        {
          developmentMode: devMode,
          previewDifficulty,
          courseName: coursePropsModal.name || courseName,
          courseDescription: coursePropsModal.description,
          isLive: coursePropsModal.isLive,
        }
      )
    }

    // Block deleting a lesson that has had material deployed from it in a live
    // class. Returns true when deletion is allowed (or the check can't run).
    const ensureLessonsDeletable = async (lessonIds: string[]): Promise<boolean> => {
      const ids = lessonIds.filter(Boolean)
      if (!courseId || ids.length === 0) return true
      try {
        const res = await fetch(`/api/tutor/courses/${courseId}/lessons/usage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ lessonIds: ids }),
        })
        if (!res.ok) return true // never block on a failed check
        const data = await res.json().catch(() => ({}))
        const usage = (data?.usage ?? {}) as Record<string, { deployedCount?: number }>
        const blocked = ids.some(id => (usage[id]?.deployedCount ?? 0) > 0)
        if (blocked) {
          toast.error(
            'This lesson has material deployed from it in a class and can’t be deleted. Remove or reassign its deployed tasks/assessments first.'
          )
          return false
        }
        return true
      } catch {
        return true
      }
    }

    // Reset the task / assessment builder panels. Used when the open item — or a
    // lesson/module that contains it — is deleted, so its content doesn't linger
    // in the editor after removal.
    const resetTaskBuilderState = useCallback(() => {
      setLoadedTaskId(null)
      setTaskBuilder({
        title: '',
        taskContent: '',
        taskPci: '',
        details: '',
        extensions: [],
        activeExtensionId: null,
      })
      setTaskDmiItems([])
      setTaskDmiVersions([])
      setTaskSourceDocument(undefined)
    }, [])
    const resetAssessmentBuilderState = useCallback(() => {
      setLoadedAssessmentId(null)
      setAssessmentBuilder({
        title: '',
        taskContent: '',
        taskPci: '',
        details: '',
        extensions: [],
        activeExtensionId: null,
      })
      setAssessmentDmiItems([])
      setAssessmentDmiVersions([])
      setAssessmentSourceDocument(undefined)
      setAssessmentSourceReferenceOnly(false)
    }, [])

    const deleteCourseBuilderNode = async (nodeId: string) => {
      const nodeToDelete = nodes.find(m => m.id === nodeId)
      const lessonIds = nodeToDelete?.lessons.map(l => l.id) ?? []
      if (!(await ensureLessonsDeletable(lessonIds))) return
      if (nodeToDelete) {
        const keys = nodeToDelete.lessons.flatMap(l => collectLessonFileKeys(l))
        if (keys.length > 0) await cleanupGcsFiles(keys)
      }
      const nextNodes = nodes.filter(m => m.id !== nodeId)
      setCourseBuilderNodes(nextNodes)
      if (mainTab !== 'live') await saveNodesIfPossible(nextNodes)
      // If the open task/assessment lived in this module, clear the editor too.
      if (nodeToDelete?.lessons.some(l => l.tasks?.some(t => t.id === loadedTaskId))) {
        resetTaskBuilderState()
        setSelectedItem(null)
      }
      if (nodeToDelete?.lessons.some(l => l.homework?.some(h => h.id === loadedAssessmentId))) {
        resetAssessmentBuilderState()
        setSelectedItem(null)
      }
      toast.success('Lesson deleted')
    }

    const deleteLesson = async (nodeId: string, lessonId: string) => {
      if (!(await ensureLessonsDeletable([lessonId]))) return
      const lessonToDelete = nodes.find(m => m.id === nodeId)?.lessons.find(l => l.id === lessonId)
      if (lessonToDelete) {
        const keys = collectLessonFileKeys(lessonToDelete)
        if (keys.length > 0) await cleanupGcsFiles(keys)
      }
      const nextNodes = nodes.map(m =>
        m.id === nodeId ? { ...m, lessons: m.lessons.filter(l => l.id !== lessonId) } : m
      )
      setCourseBuilderNodes(nextNodes)
      if (mainTab !== 'live') await saveNodesIfPossible(nextNodes)
      // If the open task/assessment lived in this lesson, clear the editor too.
      if (lessonToDelete?.tasks?.some(t => t.id === loadedTaskId)) {
        resetTaskBuilderState()
        setSelectedItem(null)
      }
      if (lessonToDelete?.homework?.some(h => h.id === loadedAssessmentId)) {
        resetAssessmentBuilderState()
        setSelectedItem(null)
      }
      toast.success('Lesson deleted')
    }

    const deleteTask = async (nodeId: string, lessonId: string, taskId: string) => {
      const taskToDelete = nodes
        .find(m => m.id === nodeId)
        ?.lessons.find(l => l.id === lessonId)
        ?.tasks?.find(t => t.id === taskId)
      if (taskToDelete) {
        const keys = collectTaskFileKeys(taskToDelete)
        if (keys.length > 0) await cleanupGcsFiles(keys)
      }
      const nextNodes = nodes.map(m =>
        m.id === nodeId
          ? {
              ...m,
              lessons: m.lessons.map(l =>
                l.id === lessonId
                  ? { ...l, tasks: (l.tasks || []).filter(t => t.id !== taskId) }
                  : l
              ),
            }
          : m
      )
      setCourseBuilderNodes(nextNodes)
      if (mainTab !== 'live') await saveNodesIfPossible(nextNodes)
      // If the deleted task is the one currently open in the builder, clear it so
      // its content doesn't stay displayed after removal.
      if (taskId === loadedTaskId) resetTaskBuilderState()
      setSelectedItem(null)
      toast.success('Task removed')
    }

    const deleteAssessment = async (nodeId: string, lessonId: string, hwId: string) => {
      const assessmentToDelete = nodes
        .find(m => m.id === nodeId)
        ?.lessons.find(l => l.id === lessonId)
        ?.homework?.find(h => h.id === hwId)
      if (assessmentToDelete) {
        const keys = collectAssessmentFileKeys(assessmentToDelete)
        if (keys.length > 0) await cleanupGcsFiles(keys)
      }
      const nextNodes = nodes.map(m =>
        m.id === nodeId
          ? {
              ...m,
              lessons: m.lessons.map(l =>
                l.id === lessonId
                  ? { ...l, homework: (l.homework || []).filter(h => h.id !== hwId) }
                  : l
              ),
            }
          : m
      )
      setCourseBuilderNodes(nextNodes)
      if (mainTab !== 'live') await saveNodesIfPossible(nextNodes)
      // If the deleted assessment is the one currently open in the builder, clear
      // it so its content doesn't stay displayed after removal.
      if (hwId === loadedAssessmentId) resetAssessmentBuilderState()
      setSelectedItem(null)
      toast.success('Assessment removed')
    }

    // Move a task/assessment from its lesson to another lesson (or a brand-new
    // one). Tasks carry their extensions (they live inline on the Task object).
    // If the target lesson already has an item of the same name, the moved item
    // gets a "new" suffix. Used by both the kebab "Move to lesson…" flow and the
    // cross-lesson drag-and-drop.
    const moveItemToLesson = async (
      itemType: 'task' | 'assessment',
      itemId: string,
      target: { kind: 'existing'; nodeId: string } | { kind: 'new' }
    ) => {
      const arrKey = itemType === 'task' ? 'tasks' : 'homework'
      // Locate the item in its source node/lesson.
      let srcN = -1
      let srcL = -1
      let item: any = null
      for (let n = 0; n < nodes.length && !item; n++) {
        for (let l = 0; l < nodes[n].lessons.length; l++) {
          const list = (nodes[n].lessons[l] as any)[arrKey] || []
          const idx = list.findIndex((x: any) => x.id === itemId)
          if (idx !== -1) {
            srcN = n
            srcL = l
            item = list[idx]
            break
          }
        }
      }
      if (!item) {
        toast.error('Could not find that item to move')
        return
      }

      // Resolve the target node (creating a new "Lesson N" when requested).
      let working = nodes
      let tgtN = -1
      if (target.kind === 'new') {
        const newNode = DEFAULT_NODE(nodes.length)
        let maxNum = 0
        for (const mod of nodes) {
          const m = /^Lesson\s+(\d+)/i.exec(mod.title || '')
          if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10))
        }
        newNode.title = `Lesson ${maxNum + 1}`
        newNode.lessons[0].title = `Lesson ${maxNum + 1}`
        working = [...nodes, newNode]
        tgtN = working.length - 1
      } else {
        tgtN = nodes.findIndex(m => m.id === target.nodeId)
      }
      if (tgtN === -1) {
        toast.error('Could not find the target lesson')
        return
      }

      const tgtL = 0 // each node maps to a single lesson in the UI
      if (working[srcN].lessons[srcL].id === working[tgtN].lessons[tgtL].id) {
        toast('Already in that lesson')
        return
      }

      // Name-collision handling: append " new" until unique in the target lesson.
      const targetList = (working[tgtN].lessons[tgtL] as any)[arrKey] || []
      const existingTitles = new Set<string>(targetList.map((x: any) => (x.title || '').trim()))
      const title = uniqueMovedTitle(
        item.title || (itemType === 'task' ? 'Task' : 'Assessment'),
        existingTitles
      )
      const movedItem = { ...item, title }
      const targetLessonTitle = working[tgtN].title

      const next = working.map((mod, n) => {
        if (n !== srcN && n !== tgtN) return mod
        const lessons = mod.lessons.map((les, l) => {
          let cur: any = les
          if (n === srcN && l === srcL) {
            cur = { ...cur, [arrKey]: (cur[arrKey] || []).filter((x: any) => x.id !== itemId) }
          }
          if (n === tgtN && l === tgtL) {
            cur = { ...cur, [arrKey]: [...(cur[arrKey] || []), movedItem] }
          }
          return cur
        })
        return { ...mod, lessons }
      })

      setCourseBuilderNodes(next)
      if (mainTab !== 'live') await saveNodesIfPossible(next)
      setSelectedItem(null)
      toast.success(
        title === (item.title || '').trim()
          ? `Moved to ${targetLessonTitle}`
          : `Moved to ${targetLessonTitle} as “${title}”`
      )
    }

    const openMoveDialog = (
      itemType: 'task' | 'assessment',
      itemId: string,
      itemTitle: string,
      sourceNodeId: string
    ) => {
      setMoveTarget('')
      setMoveDialog({ itemType, itemId, itemTitle, sourceNodeId })
    }

    const confirmMoveDialog = async () => {
      if (!moveDialog || !moveTarget) return
      const target =
        moveTarget === '__new__'
          ? ({ kind: 'new' } as const)
          : ({ kind: 'existing', nodeId: moveTarget } as const)
      await moveItemToLesson(moveDialog.itemType, moveDialog.itemId, target)
      setMoveDialog(null)
      setMoveTarget('')
    }

    const deleteCourseBuilderNodeQuiz = async (nodeId: string, quizId: string) => {
      const nextNodes = nodes.map(m =>
        m.id === nodeId ? { ...m, quizzes: (m.quizzes || []).filter(q => q.id !== quizId) } : m
      )
      setCourseBuilderNodes(nextNodes)
      if (mainTab !== 'live') await saveNodesIfPossible(nextNodes)
      setSelectedItem(null)
      toast.success('Exam removed')
    }

    const duplicateTask = (nodeId: string, lessonId: string, task: Task) => {
      const copy: Task = {
        ...task,
        id: `task-${generateId()}`,
        title: `${task.title} (copy)`,
        questions: task.questions?.map(q => ({ ...q, id: `q-${generateId()}` })),
      }
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      if (nodeIndex === -1) return
      const lessonIndex = nodes[nodeIndex].lessons.findIndex(l => l.id === lessonId)
      if (lessonIndex === -1) return
      const newCourseBuilderNodes = [...nodes]
      newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks = [
        ...(newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks || []),
        copy,
      ]
      setCourseBuilderNodes(newCourseBuilderNodes)
      setSelectedItem({ type: 'task', id: copy.id })
      toast.success('Task duplicated')
    }

    const duplicateAssessment = (nodeId: string, lessonId: string, hw: Assessment) => {
      const copy: Assessment = {
        ...hw,
        id: `homework-${generateId()}`,
        title: `${hw.title} (copy)`,
        questions: hw.questions?.map(q => ({ ...q, id: `q-${generateId()}` })),
      }
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      if (nodeIndex === -1) return
      const lessonIndex = nodes[nodeIndex].lessons.findIndex(l => l.id === lessonId)
      if (lessonIndex === -1) return
      const newCourseBuilderNodes = [...nodes]
      newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework = [
        ...(newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework || []),
        copy,
      ]
      setCourseBuilderNodes(newCourseBuilderNodes)
      setSelectedItem({ type: 'homework', id: copy.id })
      toast.success('Assessment duplicated')
    }

    const duplicateCourseBuilderNodeQuiz = (nodeId: string, quiz: CourseBuilderNodeQuiz) => {
      const copy: CourseBuilderNodeQuiz = {
        ...quiz,
        id: `quiz-${generateId()}`,
        title: `${quiz.title} (copy)`,
        questions: quiz.questions?.map(q => ({ ...q, id: `q-${generateId()}` })),
      }
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      if (nodeIndex === -1) return
      const newCourseBuilderNodes = [...nodes]
      newCourseBuilderNodes[nodeIndex].quizzes = [
        ...(newCourseBuilderNodes[nodeIndex].quizzes || []),
        copy,
      ]
      setCourseBuilderNodes(newCourseBuilderNodes)
      setSelectedItem({ type: 'nodeQuiz', id: copy.id })
      toast.success('Exam duplicated')
    }

    const duplicateLesson = (nodeId: string, lesson: Lesson) => {
      const copy: Lesson = {
        ...lesson,
        id: `lesson-${generateId()}`,
        title: `${lesson.title} (copy)`,
        tasks: lesson.tasks?.map(t => ({
          ...t,
          id: `task-${generateId()}`,
          questions: t.questions?.map(q => ({ ...q, id: `q-${generateId()}` })),
        })),
        homework: lesson.homework?.map(h => ({
          ...h,
          id: `homework-${generateId()}`,
          questions: h.questions?.map(q => ({ ...q, id: `q-${generateId()}` })),
        })),
      }
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      if (nodeIndex === -1) return
      const newCourseBuilderNodes = [...nodes]
      newCourseBuilderNodes[nodeIndex].lessons = [
        ...(newCourseBuilderNodes[nodeIndex].lessons || []),
        copy,
      ]
      setCourseBuilderNodes(newCourseBuilderNodes)
      setSelectedItem({ type: 'lesson', id: copy.id })
      toast.success('Lesson duplicated')
    }

    const duplicateCourseBuilderNode = (node: CourseBuilderNode) => {
      const copy: CourseBuilderNode = {
        ...node,
        id: `node-${generateId()}`,
        title: `${node.title} (copy)`,
        lessons: node.lessons?.map(l => ({
          ...l,
          id: `lesson-${generateId()}`,
          tasks: l.tasks?.map(t => ({
            ...t,
            id: `task-${generateId()}`,
            questions: t.questions?.map(q => ({ ...q, id: `q-${generateId()}` })),
          })),
          homework: l.homework?.map(h => ({
            ...h,
            id: `homework-${generateId()}`,
            questions: h.questions?.map(q => ({ ...q, id: `q-${generateId()}` })),
          })),
        })),
        quizzes: node.quizzes?.map(q => ({
          ...q,
          id: `quiz-${generateId()}`,
          questions: q.questions?.map(qu => ({ ...qu, id: `q-${generateId()}` })),
        })),
      }
      setCourseBuilderNodes([...nodes, copy])
      setSelectedItem({ type: 'node', id: copy.id })
      toast.success('Lesson duplicated')
    }

    const getAllLessons = () => {
      return nodes.flatMap(m => m.lessons)
    }

    // File upload handlers for Media and Docs — persist via API instead of blob URLs
    const handleMediaUpload = async (
      nodeId: string,
      lessonId: string,
      files: FileList | null,
      type: 'video' | 'image'
    ) => {
      if (!files || files.length === 0) return

      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      const lessonIndex = nodes[nodeIndex]?.lessons.findIndex(l => l.id === lessonId)
      if (nodeIndex === -1 || lessonIndex === -1) return

      const uploadedItems: Array<
        | { id: string; title: string; url: string; duration: number }
        | { id: string; title: string; url: string }
      > = []

      for (const file of Array.from(files)) {
        const uploadForm = new FormData()
        uploadForm.append('file', file)

        try {
          const uploadRes = await fetchWithCsrf('/api/uploads/documents', {
            method: 'POST',
            body: uploadForm,
          })
          if (!uploadRes.ok) {
            toast.error(`Failed to upload ${file.name}`)
            continue
          }
          const uploadData = await uploadRes.json()
          const url = uploadData.url || ''

          if (!url) {
            toast.error(`Failed to get URL for ${file.name}`)
            continue
          }

          if (type === 'video') {
            uploadedItems.push({
              id: `video-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
              title: file.name,
              url,
              duration: 0,
            })
          } else {
            uploadedItems.push({
              id: `image-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
              title: file.name,
              url,
            })
          }
        } catch {
          toast.error(`Upload failed for ${file.name}`)
        }
      }

      if (uploadedItems.length === 0) return

      const newCourseBuilderNodes = [...nodes]
      for (const item of uploadedItems) {
        if ('duration' in item) {
          newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].media.videos.push(item)
        } else {
          newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].media.images.push(item)
        }
      }

      setCourseBuilderNodes(newCourseBuilderNodes)
      toast.success(`${uploadedItems.length} ${type}(s) uploaded`)
    }

    const handleDocUpload = async (nodeId: string, lessonId: string, files: FileList | null) => {
      if (!files || files.length === 0) return

      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      const lessonIndex = nodes[nodeIndex]?.lessons.findIndex(l => l.id === lessonId)
      if (nodeIndex === -1 || lessonIndex === -1) return

      const uploadedDocs: Array<{
        id: string
        title: string
        url: string
        type: 'pdf' | 'doc' | 'ppt' | 'other'
      }> = []

      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop()?.toLowerCase()
        const docType =
          ext === 'pdf'
            ? 'pdf'
            : ext === 'doc' || ext === 'docx'
              ? 'doc'
              : ext === 'ppt' || ext === 'pptx'
                ? 'ppt'
                : 'other'

        const uploadForm = new FormData()
        uploadForm.append('file', file)

        try {
          const uploadRes = await fetchWithCsrf('/api/uploads/documents', {
            method: 'POST',
            body: uploadForm,
          })
          if (!uploadRes.ok) {
            toast.error(`Failed to upload ${file.name}`)
            continue
          }
          const uploadData = await uploadRes.json()
          const url = uploadData.url || ''

          if (!url) {
            toast.error(`Failed to get URL for ${file.name}`)
            continue
          }

          uploadedDocs.push({
            id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            title: file.name,
            url,
            type: docType as 'pdf' | 'doc' | 'ppt' | 'other',
          })
        } catch {
          toast.error(`Upload failed for ${file.name}`)
        }
      }

      if (uploadedDocs.length === 0) return

      const newCourseBuilderNodes = [...nodes]
      for (const doc of uploadedDocs) {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].docs.push(doc)
      }

      setCourseBuilderNodes(newCourseBuilderNodes)
      toast.success(`${uploadedDocs.length} document(s) uploaded`)
    }

    const handleAssetsMediaUpload = async (files: FileList | null, type: 'video' | 'image') => {
      const { nodeId, lessonId } = ensureFirstLessonContext()
      await handleMediaUpload(nodeId, lessonId, files, type)
    }

    const handleAssetsDocUpload = async (files: FileList | null) => {
      const { nodeId, lessonId } = ensureFirstLessonContext()
      await handleDocUpload(nodeId, lessonId, files)
    }

    const handleDeleteAssetMedia = (mediaType: 'video' | 'image', mediaId: string) => {
      const { nodeId, lessonId } = ensureFirstLessonContext()
      setCourseBuilderNodes(prev =>
        prev.map(node => {
          if (node.id !== nodeId) return node
          return {
            ...node,
            lessons: node.lessons.map(lesson => {
              if (lesson.id !== lessonId) return lesson
              return {
                ...lesson,
                media: {
                  ...lesson.media,
                  videos:
                    mediaType === 'video'
                      ? (lesson.media?.videos || []).filter(v => v.id !== mediaId)
                      : lesson.media?.videos || [],
                  images:
                    mediaType === 'image'
                      ? (lesson.media?.images || []).filter(i => i.id !== mediaId)
                      : lesson.media?.images || [],
                },
              }
            }),
          }
        })
      )
    }

    const handleDeleteAssetDoc = (docId: string) => {
      const { nodeId, lessonId } = ensureFirstLessonContext()
      setCourseBuilderNodes(prev =>
        prev.map(node => {
          if (node.id !== nodeId) return node
          return {
            ...node,
            lessons: node.lessons.map(lesson => {
              if (lesson.id !== lessonId) return lesson
              return {
                ...lesson,
                docs: (lesson.docs || []).filter(doc => doc.id !== docId),
              }
            }),
          }
        })
      )
    }

    const getAssetIcon = (name: string) => {
      const ext = name.split('.').pop()?.toLowerCase() || ''
      if (['doc', 'docx'].includes(ext)) return <FileText className="h-4 w-4 text-blue-600" />
      if (['pdf'].includes(ext)) return <FileText className="h-4 w-4 text-red-600" />
      if (['xls', 'xlsx', 'csv'].includes(ext))
        return <FileText className="h-4 w-4 text-green-600" />
      if (['ppt', 'pptx'].includes(ext)) return <FileText className="h-4 w-4 text-orange-600" />
      if (['png', 'jpg', 'jpeg', 'gif'].includes(ext))
        return <FileText className="h-4 w-4 text-purple-600" />
      if (['mp4', 'mov', 'webm'].includes(ext))
        return <FileText className="h-4 w-4 text-pink-600" />
      return <FileText className="h-4 w-4 text-slate-500" />
    }

    // Helper to check if file is PowerPoint
    const isPowerPointFile = (file: File): boolean => {
      const name = file.name.toLowerCase()
      const type = file.type
      return (
        type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        type === 'application/vnd.ms-powerpoint' ||
        name.endsWith('.pptx') ||
        name.endsWith('.ppt')
      )
    }

    const handleDragFiles = async (
      e: React.DragEvent<HTMLTextAreaElement | HTMLDivElement>,
      onText: (t: string) => void,
      target?: 'task' | 'assessment'
    ) => {
      // First, try internal JSON asset drop from left panel
      try {
        const assetData = e.dataTransfer.getData('application/json')
        if (assetData) {
          const { type, asset } = JSON.parse(assetData)
          if (type === 'asset' && asset) {
            e.preventDefault()
            e.stopPropagation()

            if (target === 'assessment') {
              if (!asset.url && !asset.fileKey) {
                toast.error(
                  `The document '${asset.name}' has no file URL or storage key. Please delete and upload it again.`
                )
                return
              }

              let currentId = loadedAssessmentId
              if (!currentId) {
                const created = autoCreateAssessment()
                if (!created) {
                  toast.error('Failed to create assessment')
                  return
                }
                currentId = created.id
              }
              revealCurriculumItem('homework', currentId)

              const extractedText = asset.content || `[Asset: ${asset.name}]`
              const newDoc = {
                fileName: asset.name,
                fileUrl: asset.url || '',
                fileKey: asset.fileKey,
                mimeType: asset.mimeType || 'application/pdf',
                uploadedAt: new Date().toISOString(),
                extractedText,
              }

              setAssessmentSourceDocument(newDoc)
              setAssessmentUploadedFiles([{ id: 'source', name: asset.name }])
              setAssessmentBuilder(prev => ({
                ...prev,
                sourceDocument: newDoc,
                taskContent: extractedText,
              }))

              setCourseBuilderNodes(prev =>
                prev.map(mod => ({
                  ...mod,
                  lessons: mod.lessons.map(lesson => ({
                    ...lesson,
                    homework: lesson.homework.map(hw =>
                      hw.id === currentId
                        ? { ...hw, sourceDocument: newDoc, description: extractedText }
                        : hw
                    ),
                  })),
                }))
              )
              toast.success(`Loaded '${asset.name}' into Assessment`)
              // DMI-first: auto-generate the DMI now (the PCI chat stays locked
              // until it's ready). Kind detection asks the tutor if unsure.
              setTimeout(() => handleGenerateDMI('assessment'), 500)
            } else {
              // For tasks, load document and text
              if (!asset.url && !asset.fileKey) {
                toast.error(
                  `The document '${asset.name}' has no file URL or storage key. Please delete and upload it again.`
                )
                return
              }

              let currentId = loadedTaskId
              if (!currentId) {
                const created = autoCreateTask()
                if (!created) {
                  toast.error('Failed to create task')
                  return
                }
                currentId = created.id
              }
              revealCurriculumItem('task', currentId)

              const extractedText = asset.content || `[Asset: ${asset.name}]`
              const newDoc = {
                fileName: asset.name,
                fileUrl: asset.url || '',
                fileKey: asset.fileKey,
                mimeType: asset.mimeType || 'application/pdf',
                uploadedAt: new Date().toISOString(),
                extractedText,
              }

              setTaskSourceDocument(newDoc)
              setTaskUploadedFiles([{ id: 'source', name: asset.name }])
              setTaskBuilder(prev => {
                if (prev.activeExtensionId) {
                  return {
                    ...prev,
                    extensions: prev.extensions.map(ext =>
                      ext.id === prev.activeExtensionId ? { ...ext, sourceDocument: newDoc } : ext
                    ),
                  }
                }
                return { ...prev, sourceDocument: newDoc }
              })
              onText(extractedText)

              setCourseBuilderNodes(prev =>
                prev.map(mod => ({
                  ...mod,
                  lessons: mod.lessons.map(lesson => ({
                    ...lesson,
                    tasks: lesson.tasks.map(task =>
                      task.id === currentId
                        ? { ...task, sourceDocument: newDoc, description: extractedText }
                        : task
                    ),
                  })),
                }))
              )
              toast.success(`Loaded '${asset.name}' into Task`)
            }
            return
          }
        }
      } catch (err) {
        // ignore and fall through to native files
      }

      const files = Array.from(e.dataTransfer.files || [])
      if (files.length > 0) {
        e.preventDefault()

        // Check parsing preference once
        const parsePref =
          typeof window !== 'undefined'
            ? localStorage.getItem('tutor-parse-documents') === 'true'
            : false

        if (target === 'assessment') {
          const f = files[0]
          if (!f) return
          toast.info(`Uploading '${f.name}'...`)

          let extractedText = ''
          if (parsePref) {
            try {
              extractedText = (await extractTextFromFile(f)) || ''
            } catch {
              extractedText = ''
            }
          }

          let fileUrl = ''
          let fileKey = ''
          let fileMimeType = 'application/pdf'
          try {
            const uploadForm = new FormData()
            uploadForm.append('file', f)

            const uploadRes = await fetchWithCsrf('/api/uploads/documents', {
              method: 'POST',
              body: uploadForm,
            })
            if (uploadRes.ok) {
              const uploadData = await uploadRes.json()
              fileUrl = uploadData.url || ''
              fileKey = uploadData.key || ''
              fileMimeType = uploadData.isPdf
                ? 'application/pdf'
                : uploadData.type || 'application/pdf'
            } else {
              // Surface the server's reason (e.g. "File too large (max 20MB)")
              // instead of a generic failure, so load problems are diagnosable.
              const reason = await uploadRes
                .json()
                .then(d => d?.error)
                .catch(() => null)
              toast.error(
                reason ? `Upload failed: ${reason}` : `Upload failed (${uploadRes.status})`
              )
              return
            }
          } catch {
            toast.error('Failed to upload document')
            return
          }

          if (!fileUrl) {
            toast.error('Failed to retrieve document URL')
            return
          }

          const newAsset = {
            id: `asset-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            name: f.name,
            content: extractedText || `[Imported ${f.name}]`,
            url: fileUrl,
            fileKey,
            mimeType: fileMimeType,
            folder: designatedFolder !== 'Uncategorized' ? designatedFolder : undefined,
          }

          setCourseAssets(prev => [...prev, newAsset])

          let currentId = loadedAssessmentId
          if (!currentId) {
            const created = autoCreateAssessment()
            if (!created) {
              toast.error('Failed to create assessment')
              return
            }
            currentId = created.id
          }
          revealCurriculumItem('homework', currentId)

          const newDoc = {
            fileName: newAsset.name,
            fileUrl: newAsset.url,
            fileKey: newAsset.fileKey,
            mimeType: newAsset.mimeType,
            uploadedAt: new Date().toISOString(),
            extractedText: newAsset.content,
          }

          setAssessmentSourceDocument(newDoc)
          setAssessmentSourceReferenceOnly(false)
          setAssessmentUploadedFiles([{ id: 'source', name: newAsset.name }])
          setAssessmentBuilder(prev => ({
            ...prev,
            sourceDocument: newDoc,
            taskContent: newAsset.content || '',
          }))

          setCourseBuilderNodes(prev =>
            prev.map(mod => ({
              ...mod,
              lessons: mod.lessons.map(lesson => ({
                ...lesson,
                homework: lesson.homework.map(hw =>
                  hw.id === currentId
                    ? { ...hw, sourceDocument: newDoc, description: newAsset.content || '' }
                    : hw
                ),
              })),
            }))
          )
          toast.success(`Loaded '${newAsset.name}' into Assessment`)
          return
        }

        // Check if any file is a PowerPoint
        const pptFile = files.find(isPowerPointFile)
        if (pptFile && target) {
          // Show PPT upload options dialog
          setPptUploadDialog({ isOpen: true, file: pptFile, target })
          // Process non-PPT files normally
          const otherFiles = files.filter(f => !isPowerPointFile(f))
          if (otherFiles.length > 0) {
            let combined = ''
            for (const f of otherFiles) {
              if (parsePref) {
                try {
                  const extracted = await extractTextFromFile(f)
                  if (extracted) {
                    combined += extracted + '\n\n'
                  } else {
                    combined += `[Imported ${f.name}]\n\n`
                  }
                } catch {
                  combined += `[Imported ${f.name}]\n\n`
                }
              } else {
                combined += `[Imported ${f.name}]\n\n`
              }
            }
            onText(combined.trim())
          }
          return
        }

        let combined = ''
        for (const f of files) {
          if (parsePref) {
            try {
              // If it's a lightweight text file, parse as text directly. For PDF, DOCX, PPTX parse via extractTextFromFile
              const extracted = await extractTextFromFile(f)
              if (extracted) {
                combined += extracted + '\n\n'
              } else {
                combined += `[Imported ${f.name}]\n\n`
              }
            } catch {
              combined += `[Imported ${f.name}]\n\n`
            }
          } else {
            combined += `[Imported ${f.name}]\n\n`
          }
        }
        // Upload first file as source document for tasks
        if (target === 'task' && files.length > 0) {
          const firstFile = files[0]
          if (firstFile) {
            let fileUrl = ''
            let fileKey = ''
            let fileMimeType = 'application/pdf'
            try {
              const uploadForm = new FormData()
              uploadForm.append('file', firstFile)

              const uploadRes = await fetchWithCsrf('/api/uploads/documents', {
                method: 'POST',
                body: uploadForm,
              })
              if (uploadRes.ok) {
                const uploadData = await uploadRes.json()
                fileUrl = uploadData.url || ''
                fileKey = uploadData.key || ''
                fileMimeType = uploadData.isPdf
                  ? 'application/pdf'
                  : uploadData.type || 'application/pdf'
              }
            } catch {
              toast.error('Failed to upload document')
            }

            if (fileUrl) {
              let currentId = loadedTaskId
              if (!currentId) {
                const created = autoCreateTask()
                if (created) currentId = created.id
              }

              if (currentId) {
                revealCurriculumItem('task', currentId)
                const newAsset = {
                  id: `asset-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                  name: firstFile.name,
                  content: combined || `[Imported ${firstFile.name}]`,
                  url: fileUrl,
                  fileKey,
                  mimeType: fileMimeType,
                  folder: designatedFolder !== 'Uncategorized' ? designatedFolder : undefined,
                }
                setCourseAssets(prev => [...prev, newAsset])

                const newDoc = {
                  fileName: firstFile.name,
                  fileUrl,
                  fileKey,
                  mimeType: fileMimeType,
                  uploadedAt: new Date().toISOString(),
                  extractedText: combined || '',
                }

                setTaskSourceDocument(newDoc)
                setTaskUploadedFiles([{ id: 'source', name: firstFile.name }])
                setTaskBuilder(prev => {
                  if (prev.activeExtensionId) {
                    return {
                      ...prev,
                      extensions: prev.extensions.map(ext =>
                        ext.id === prev.activeExtensionId ? { ...ext, sourceDocument: newDoc } : ext
                      ),
                    }
                  }
                  return { ...prev, sourceDocument: newDoc }
                })

                setCourseBuilderNodes(prev =>
                  prev.map(mod => ({
                    ...mod,
                    lessons: mod.lessons.map(lesson => ({
                      ...lesson,
                      tasks: lesson.tasks.map(task =>
                        task.id === currentId ? { ...task, sourceDocument: newDoc } : task
                      ),
                    })),
                  }))
                )
              }
            }
          }
        }

        onText(combined.trim())
        toast.success(parsePref ? 'File(s) parsed and loaded' : 'File(s) loaded')
      }
    }

    // Handle PPT upload option selection
    const handlePptOption = async (option: 'extract' | 'embed') => {
      const { file, target } = pptUploadDialog
      if (!file || !target) return

      if (option === 'extract') {
        // Extract text content
        try {
          const extracted = await extractTextFromFile(file)
          const text = extracted || `[Imported ${file.name}]`
          if (target === 'task') {
            setTaskBuilder(prev => {
              if (prev.activeExtensionId) {
                const ext = prev.extensions.find(x => x.id === prev.activeExtensionId)
                const combined = ext ? ext.content + (ext.content ? '\n\n' : '') + text : text
                return {
                  ...prev,
                  extensions: prev.extensions.map(e =>
                    e.id === prev.activeExtensionId ? { ...e, content: combined } : e
                  ),
                }
              }
              return {
                ...prev,
                taskContent: prev.taskContent + (prev.taskContent ? '\n\n' : '') + text,
              }
            })
          } else {
            setAssessmentBuilder(prev => ({
              ...prev,
              taskContent: prev.taskContent + (prev.taskContent ? '\n\n' : '') + text,
            }))
          }
          toast.success('PowerPoint text extracted and loaded')
        } catch {
          toast.error('Failed to extract text from PowerPoint')
        }
      } else {
        // Embed as presentation reference
        const embedText = `[PowerPoint Presentation: ${file.name}]\n[File will be displayed as slides during class]`
        if (target === 'task') {
          setTaskBuilder(prev => {
            if (prev.activeExtensionId) {
              const ext = prev.extensions.find(x => x.id === prev.activeExtensionId)
              const combined = ext
                ? ext.content + (ext.content ? '\n\n' : '') + embedText
                : embedText
              return {
                ...prev,
                extensions: prev.extensions.map(e =>
                  e.id === prev.activeExtensionId ? { ...e, content: combined } : e
                ),
              }
            }
            return {
              ...prev,
              taskContent: prev.taskContent + (prev.taskContent ? '\n\n' : '') + embedText,
            }
          })
        } else {
          setAssessmentBuilder(prev => ({
            ...prev,
            taskContent: prev.taskContent + (prev.taskContent ? '\n\n' : '') + embedText,
          }))
        }
        toast.success('PowerPoint marked for presentation display')
      }

      setPptUploadDialog({ isOpen: false, file: null, target: null })
    }

    const loadAssetAsAssessment = (
      asset: {
        name: string
        content?: string
        url?: string
        fileKey?: string
        mimeType?: string
        folder?: string
      } | null
    ) => {
      if (!asset) return

      let nodeIndex = -1
      let lessonIndex = -1
      let existingAssess: Assessment | undefined

      if (loadedAssessmentId && !assetLoadTarget) {
        for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
          for (let lIdx = 0; lIdx < nodes[nIdx].lessons.length; lIdx++) {
            const hw = nodes[nIdx].lessons[lIdx].homework.find(h => h.id === loadedAssessmentId)
            if (hw) {
              existingAssess = hw
              nodeIndex = nIdx
              lessonIndex = lIdx
              break
            }
          }
          if (existingAssess) break
        }
      }

      if (nodeIndex === -1 || lessonIndex === -1) {
        const { nodeId, lessonId } = resolveAssetLoadTarget()
        nodeIndex = nodes.findIndex(m => m.id === nodeId)
        lessonIndex = nodes[nodeIndex].lessons.findIndex(l => l.id === lessonId)
      }

      let targetAssess: Assessment

      if (existingAssess) {
        targetAssess = { ...existingAssess }
      } else {
        targetAssess = DEFAULT_HOMEWORK(
          nodes[nodeIndex].lessons[lessonIndex].homework.length,
          'assessment'
        )
      }

      const extractedText = asset.content || `[Asset: ${asset.name}]`
      targetAssess.description = extractedText
      // A durable fileKey is enough to display/deploy the doc (the
      // viewer streams it via the by-key proxy), so don't require a
      // signed url — it can come back empty when the assets API
      // fails to refresh an expired presigned URL, which silently
      // left the assessment with no source document ("No document
      // selected", no error).
      // A durable fileKey is enough (the viewer streams it via the
      // by-key proxy), so don't require a signed url. But with NO
      // stored file at all, there is nothing to preview or deploy —
      // abort instead of creating an empty assessment and then
      // (mis)reporting "Loaded …". This happens for stale/broken
      // assets whose upload never stored a file; the tutor must
      // re-upload the document to get a working asset.
      if (!asset.url && !asset.fileKey) {
        toast.error('This document has no stored file — please re-upload it before loading.')
        setLoadAsModalOpen(false)
        setAssetToLoad(null)
        return
      }

      targetAssess.sourceDocument = {
        fileName: asset.name,
        fileUrl: asset.url || '',
        fileKey: asset.fileKey,
        mimeType: asset.mimeType || 'application/pdf',
        uploadedAt: new Date().toISOString(),
        extractedText,
      }

      const newCourseBuilderNodes = [...nodes]

      if (existingAssess) {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework = newCourseBuilderNodes[
          nodeIndex
        ].lessons[lessonIndex].homework.map(h => (h.id === loadedAssessmentId ? targetAssess : h))
      } else {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework.push(targetAssess)
      }

      setCourseBuilderNodes(newCourseBuilderNodes)
      setMainBuilderTab('assessment')
      setSelectedItem({ type: 'assessment', id: targetAssess.id })
      loadAssessmentIntoBuilder(targetAssess)
      revealCurriculumItem('homework', targetAssess.id)

      // Show PDF by default, hide text
      setAssessmentPdfVisibleMap(prev => ({ ...prev, [targetAssess.id]: true }))
      setAssessmentTextVisibleMap(prev => ({ ...prev, [targetAssess.id]: false }))

      toast.success(`Loaded '${asset?.name}' into Assessment`)
      setLoadAsModalOpen(false)
      setAssetToLoad(null)

      // DMI-first: generate the DMI (questions + answers/marks)
      // right away. The marking-policy (PCI) chat stays locked
      // until the DMI is ready. handleGenerateDMI detects the
      // document kind and asks the tutor to confirm if unsure.
      setTimeout(() => {
        handleGenerateDMI('assessment')
      }, 500)
    }

    const handleLoadAsset = (
      asset: {
        name: string
        content?: string
        url?: string
        fileKey?: string
        mimeType?: string
        folder?: string
      },
      // Explicit target context. The document's own kebab passes `null` so it
      // always shows the lesson picker; the task/assessment "+" doc-picker rows
      // pass the current `assetPickerTarget` (the default). Passing it explicitly
      // avoids relying on `assetPickerTarget` state, which is never reset and
      // would otherwise stay stuck and hide the picker on later kebab loads.
      target: 'task' | 'assessment' | null = assetPickerTarget
    ) => {
      setAssetToLoad(asset)
      // Start every load flow with no explicit target. The kebab "Load" picker
      // sets it later (to the chosen lesson); the task/assessment "+" flows leave
      // it null so resolveAssetLoadTarget() falls back to the open item / Lesson 1.
      setAssetLoadTarget(null)

      // If we came from an assessment/task "+" picker, the target context is known,
      // so skip the 'main' choice and go straight to options.
      if (target === 'assessment') {
        loadAssetAsAssessment(asset)
        return
      } else if (target === 'task') {
        setLoadAsStep('task-options')
        setLoadAsModalOpen(true)
      } else {
        // Document's own kebab "Load": let the tutor pick which lesson to load
        // into (existing or new) before the "Load as…" step, rather than always
        // defaulting to Lesson 1.
        setLoadAsStep('main')
        setAssetLoadTarget(null)
        setAssetLessonPickerOpen(true)
      }
    }

    const recentAssets = useMemo(() => courseAssets.slice(-2).reverse(), [courseAssets])

    // Persist folder list to localStorage
    useEffect(() => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('tutor-asset-folders', JSON.stringify(assetFoldersList))
      }
    }, [assetFoldersList])

    const assetFolders = computedAssetFolders

    const filteredViewAssets = useMemo(() => {
      let list = courseAssets
      if (assetViewFolder !== 'All') {
        list = list.filter(a => a.folder === assetViewFolder)
      }
      if (assetViewSearch.trim()) {
        const q = assetViewSearch.toLowerCase()
        list = list.filter(a => a.name.toLowerCase().includes(q))
      }
      return list
    }, [courseAssets, assetViewFolder, assetViewSearch])

    const renderAssetsFolder = () => (
      <div className="mb-3 mt-3 rounded-xl border border-emerald-500 bg-white shadow-sm">
        {/* Header row matching image 1 */}
        <div className="relative flex items-center justify-center px-3 py-2">
          <span className="text-sm font-semibold text-slate-700">Assets</span>
          <div className="absolute right-3 flex items-center gap-3">
            <button
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
              onClick={() => {
                setAssetViewSearch('')
                setAssetViewFolder('All')
                setAssetsViewOpen(true)
              }}
              title="View all assets"
            >
              <FolderOpen className="h-4 w-4" />
            </button>
            {canEdit && (
              <label className="cursor-pointer">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.rtf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.mp4,.mov,.webm"
                  className="hidden"
                  onChange={async (e: any) => {
                    const files = Array.from(e.target.files || []) as File[]
                    const parsePref =
                      typeof window !== 'undefined'
                        ? localStorage.getItem('tutor-parse-documents') === 'true'
                        : false
                    const results = await Promise.all(
                      files.map(async (f: File) => {
                        let textContent = ''
                        if (parsePref) {
                          try {
                            const extracted = await extractTextFromFile(f)
                            textContent = extracted || `[Imported ${f.name}]`
                          } catch {
                            textContent = `[Imported ${f.name}]`
                          }
                        } else {
                          textContent = `[Imported ${f.name}]`
                        }

                        // Upload to server. A failed upload must NOT silently
                        // create a file-less asset (that later fails to load with
                        // "no stored file") — surface the real reason instead.
                        try {
                          const uploadForm = new FormData()
                          uploadForm.append('file', f)

                          const uploadRes = await fetchWithCsrf('/api/uploads/documents', {
                            method: 'POST',
                            body: uploadForm,
                          })
                          if (!uploadRes.ok) {
                            const reason = await uploadRes
                              .json()
                              .then(d => d?.error)
                              .catch(() => null)
                            return {
                              ok: false as const,
                              name: f.name,
                              error: reason || `upload failed (${uploadRes.status})`,
                            }
                          }
                          const uploadData = await uploadRes.json()
                          const fileUrl = uploadData.url || ''
                          const fileKey = uploadData.key || ''
                          if (!fileUrl && !fileKey) {
                            return {
                              ok: false as const,
                              name: f.name,
                              error: 'upload returned no file reference',
                            }
                          }
                          return {
                            ok: true as const,
                            asset: {
                              id: `asset-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                              name: f.name,
                              content: textContent,
                              url: fileUrl || undefined,
                              fileKey: fileKey || undefined,
                              mimeType: uploadData.isPdf
                                ? 'application/pdf'
                                : uploadData.type || 'application/pdf',
                              folder:
                                designatedFolder !== 'Uncategorized' ? designatedFolder : undefined,
                            },
                          }
                        } catch (err: any) {
                          return {
                            ok: false as const,
                            name: f.name,
                            error: err?.message || 'network error',
                          }
                        }
                      })
                    )
                    const okAssets = results.flatMap(r => (r.ok ? [r.asset] : []))
                    const failures = results.filter(r => !r.ok)
                    if (okAssets.length > 0) {
                      setCourseAssets(prev => [...prev, ...okAssets])
                      toast.success(`${okAssets.length} asset(s) imported`)
                    }
                    for (const fail of failures) {
                      toast.error(`Could not import '${fail.name}': ${fail.error}`)
                    }
                    e.target.value = ''
                  }}
                />
                <span
                  className="flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-700"
                  title="Upload Asset"
                >
                  <Plus className="h-4 w-4" />
                </span>
              </label>
            )}
          </div>
        </div>

        {/* Only show 2 most recent files */}
        <div className="flex flex-col gap-2 px-2 pb-2">
          {recentAssets.length === 0 ? (
            <p className="text-muted-foreground w-full py-2 text-center text-xs">
              No assets imported.
            </p>
          ) : (
            recentAssets.map(asset => (
              <div
                key={asset.id}
                draggable={!assetPickerTarget}
                onDragStart={e => {
                  if (assetPickerTarget) {
                    e.preventDefault()
                    return
                  }
                  e.dataTransfer.setData(
                    'application/json',
                    JSON.stringify({ type: 'asset', asset })
                  )
                }}
                onClick={() => {
                  if (assetPickerTarget) {
                    handleLoadAsset(asset)
                  }
                }}
                className={cn(
                  'flex items-center justify-between rounded-xl bg-emerald-500/50 px-3 py-2.5 transition-colors hover:bg-emerald-500/60',
                  assetPickerTarget
                    ? 'cursor-pointer ring-2 ring-transparent hover:ring-blue-400'
                    : 'cursor-grab active:cursor-grabbing'
                )}
              >
                {' '}
                <div className="mr-2 flex flex-1 items-center gap-2 overflow-hidden">
                  <FileText className="h-4 w-4 shrink-0 text-white" />
                  <span className="flex-1 truncate text-sm font-medium text-white">
                    {asset.name}
                  </span>
                </div>
                <div
                  className="flex shrink-0 items-center gap-2"
                  onClick={e => e.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-white hover:bg-white/20 hover:text-white"
                        aria-label="Asset actions"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-[100]">
                      <DropdownMenuItem
                        onSelect={() => {
                          // Document's own kebab → always show the lesson picker.
                          setTimeout(() => handleLoadAsset(asset, null), 50)
                        }}
                      >
                        Load
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={() => {
                          setCourseAssets(prev => prev.filter(a => a.id !== asset.id))
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
          {courseAssets.length > 2 && (
            <p className="text-center text-[10px] text-gray-600">
              +{courseAssets.length - 2} more — click View to see all
            </p>
          )}
        </div>

        {/* Load-as Modal */}
        <Dialog
          open={loadAsModalOpen}
          onOpenChange={open => {
            setLoadAsModalOpen(open)
            if (!open) {
              setLoadAsStep('main')
              setAssetToLoad(null)
              setAssetLoadTarget(null)
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">Load as...</DialogTitle>
            </DialogHeader>
            <div className="pt-4">
              <div className="flex flex-col gap-4 rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white p-5 text-[#1F2933] shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
                <p className="text-sm font-medium text-slate-700">
                  Select how you would like to load &quot;{assetToLoad?.name}&quot;:
                </p>

                {/* Option 1: Tasks (One task per page) — hidden when loading as an assessment */}
                {loadAsStep !== 'assessment-options' && (
                  <Button
                    className="h-auto w-full justify-start gap-3 rounded-xl border-slate-200 bg-white py-4 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                    variant="outline"
                    disabled={isSplittingTasks}
                    onClick={async () => {
                      if (!assetToLoad) return

                      let nodeIndex = -1
                      let lessonIndex = -1
                      let existingTaskIndex = -1
                      let existingTask: Task | null = null

                      if (loadedTaskId && !assetLoadTarget) {
                        for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
                          for (let lIdx = 0; lIdx < nodes[nIdx].lessons.length; lIdx++) {
                            const t = nodes[nIdx].lessons[lIdx].tasks.find(
                              task => task.id === loadedTaskId
                            )
                            if (t) {
                              nodeIndex = nIdx
                              lessonIndex = lIdx
                              existingTaskIndex = nodes[nIdx].lessons[lIdx].tasks.findIndex(
                                task => task.id === loadedTaskId
                              )
                              existingTask = t
                              break
                            }
                          }
                          if (nodeIndex !== -1) break
                        }
                      }

                      if (nodeIndex === -1 || lessonIndex === -1) {
                        const { nodeId, lessonId } = resolveAssetLoadTarget()
                        nodeIndex = nodes.findIndex(m => m.id === nodeId)
                        lessonIndex = nodes[nodeIndex].lessons.findIndex(l => l.id === lessonId)
                      }

                      const textToInsert = assetToLoad.content || `[Asset: ${assetToLoad.name}]`

                      const pages: string[] = splitDocIntoSections(textToInsert)
                      if (pages.length === 0) pages.push(textToInsert)

                      setIsSplittingTasks(true)
                      const newTasks: Task[] = []
                      const newCourseBuilderNodes = [...nodes]
                      const startIndex =
                        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks.length
                      const groupNumber =
                        existingTaskIndex !== -1 ? existingTaskIndex + 1 : startIndex + 1
                      const updatedTasks = [
                        ...newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks,
                      ]
                      let updatedExistingTask: Task | null = null

                      try {
                        const isPdf =
                          assetToLoad.mimeType === 'application/pdf' ||
                          assetToLoad.name.toLowerCase().endsWith('.pdf')

                        let pdfSplitSucceeded = false
                        let pdfSplitError: string | null = null

                        if (isPdf && (assetToLoad.url || assetToLoad.fileKey)) {
                          // Split + store every page in ONE server request (avoids the
                          // per-page upload burst that tripped the rate limiter).
                          try {
                            const splitRes = await fetchWithCsrf('/api/tutor/documents/split', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                key: assetToLoad.fileKey,
                                url: assetToLoad.url,
                                fileName: assetToLoad.name,
                              }),
                            })
                            if (!splitRes.ok) {
                              const errData = await splitRes.json().catch(() => ({}))
                              throw new Error(errData.error || `Split failed (${splitRes.status})`)
                            }
                            const { pages: splitPages } = (await splitRes.json()) as {
                              pages: Array<{ pageNumber: number; url: string; key: string }>
                            }

                            for (let i = 0; i < splitPages.length; i++) {
                              const sp = splitPages[i]
                              const desc = pages[i] || `Page ${i + 1} from ${assetToLoad.name}`
                              const sourceDocument = {
                                fileName: `${assetToLoad.name} (Page ${i + 1})`,
                                fileUrl: sp.url,
                                fileKey: sp.key,
                                mimeType: 'application/pdf',
                                uploadedAt: new Date().toISOString(),
                                extractedText: desc,
                              }
                              if (existingTask && existingTaskIndex !== -1 && i === 0) {
                                updatedExistingTask = {
                                  ...existingTask,
                                  description: desc,
                                  sourceDocument,
                                }
                                updatedTasks[existingTaskIndex] = updatedExistingTask
                              } else {
                                const newTask = DEFAULT_TASK(startIndex + i)
                                newTask.title = `Task ${groupNumber}.${i + 1}`
                                newTask.description = desc
                                newTask.sourceDocument = sourceDocument
                                newTasks.push(newTask)
                              }
                            }
                            pdfSplitSucceeded = true
                          } catch (splitErr) {
                            console.error('PDF split failed:', splitErr)
                            pdfSplitError =
                              splitErr instanceof Error
                                ? splitErr.message
                                : 'Failed to split PDF into pages'
                          }
                        }

                        if (
                          isPdf &&
                          (assetToLoad.url || assetToLoad.fileKey) &&
                          !pdfSplitSucceeded
                        ) {
                          // Splitting the stored PDF into per-page files failed (e.g. the
                          // link is broken/expired or the object is unreadable). Don't
                          // abort — fall back to splitting the extracted text into
                          // sections below so the tutor still gets multiple tasks.
                          toast.warning(
                            `Couldn't split '${assetToLoad.name}' by page${
                              pdfSplitError ? ` (${pdfSplitError})` : ''
                            } — split it into sections from the text instead.`
                          )
                        }

                        if (!pdfSplitSucceeded) {
                          // Text-based split for non-PDF (or url-less) assets, and the
                          // fallback when a PDF page-split failed: one task per section.
                          pages.forEach((pageContent, idx) => {
                            if (existingTask && existingTaskIndex !== -1 && idx === 0) {
                              updatedExistingTask = {
                                ...existingTask,
                                description: pageContent,
                                sourceDocument:
                                  (assetToLoad.url || assetToLoad.fileKey) && assetToLoad.mimeType
                                    ? {
                                        fileName: assetToLoad.name,
                                        fileUrl:
                                          assetToLoad.url ||
                                          (assetToLoad.fileKey
                                            ? `/api/proxy-file?key=${encodeURIComponent(assetToLoad.fileKey)}`
                                            : ''),
                                        fileKey: assetToLoad.fileKey,
                                        mimeType: assetToLoad.mimeType,
                                        uploadedAt: new Date().toISOString(),
                                        extractedText: pageContent,
                                      }
                                    : existingTask.sourceDocument,
                              }
                              updatedTasks[existingTaskIndex] = updatedExistingTask
                            } else {
                              const newTask = DEFAULT_TASK(startIndex + idx)
                              newTask.title = `Task ${groupNumber}.${existingTask ? idx + 1 : idx + 1}`
                              newTask.description = pageContent
                              if (
                                (assetToLoad.url || assetToLoad.fileKey) &&
                                assetToLoad.mimeType
                              ) {
                                newTask.sourceDocument = {
                                  fileName: assetToLoad.name,
                                  fileUrl:
                                    assetToLoad.url ||
                                    (assetToLoad.fileKey
                                      ? `/api/proxy-file?key=${encodeURIComponent(assetToLoad.fileKey)}`
                                      : ''),
                                  fileKey: assetToLoad.fileKey,
                                  mimeType: assetToLoad.mimeType,
                                  uploadedAt: new Date().toISOString(),
                                  extractedText: pageContent,
                                }
                              }
                              newTasks.push(newTask)
                            }
                          })
                        }

                        if (existingTask && existingTaskIndex !== -1) {
                          updatedTasks.splice(existingTaskIndex + 1, 0, ...newTasks)
                          newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks = updatedTasks
                        } else {
                          newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks.push(
                            ...newTasks
                          )
                        }

                        setCourseBuilderNodes(newCourseBuilderNodes)
                        setMainBuilderTab('task')

                        if (updatedExistingTask) {
                          const taskId = updatedExistingTask.id
                          setSelectedItem({ type: 'task', id: updatedExistingTask.id })
                          loadTaskIntoBuilder(updatedExistingTask)
                          revealCurriculumItem('task', taskId)
                          setTaskPdfVisibleMap(prev => ({ ...prev, [taskId]: true }))
                          setTaskTextVisibleMap(prev => ({ ...prev, [taskId]: false }))
                        } else if (newTasks.length > 0) {
                          const firstNew = newTasks[0]
                          setSelectedItem({ type: 'task', id: firstNew.id })
                          loadTaskIntoBuilder(firstNew)
                          revealCurriculumItem('task', firstNew.id)

                          setTaskPdfVisibleMap(prev => ({ ...prev, [firstNew.id]: true }))
                          setTaskTextVisibleMap(prev => ({ ...prev, [firstNew.id]: false }))

                          setTimeout(() => {
                            handlePciSend(
                              'task',
                              `I just uploaded a document named '${assetToLoad?.name}'. First, give me a brief summary of what the document actually is and what it contains. Only mention diagrams or images if they are genuinely present — do not assume there are any. Then ask me to confirm the summary is correct (or tell you what to fix), and do NOT ask any marking-policy questions yet — wait until I confirm the summary is right. Once I confirm, then help me build the marking policy by asking ONE simple question at a time, using clear, simple language and a small example each time.`
                            )
                          }, 500)
                        }

                        toast.success(
                          updatedExistingTask
                            ? `Updated Task and created ${newTasks.length} Task(s) from '${assetToLoad?.name}'`
                            : `Created ${newTasks.length} Task(s) from '${assetToLoad?.name}'`
                        )
                        setLoadAsModalOpen(false)
                        setAssetToLoad(null)
                      } catch (err: any) {
                        console.error('PDF splitting error:', err)
                        toast.error(err.message || 'Failed to split PDF')
                      } finally {
                        setIsSplittingTasks(false)
                      }
                    }}
                  >
                    {isSplittingTasks ? (
                      <Loader2 className="mt-1 h-5 w-5 shrink-0 animate-spin text-orange-500" />
                    ) : (
                      <ListTodo className="mt-1 h-5 w-5 shrink-0 text-orange-500" />
                    )}
                    <div className="flex flex-col items-start text-left">
                      <span className="font-semibold text-slate-900">Tasks</span>
                      <span className="mt-1 text-xs font-normal text-slate-500">
                        {isSplittingTasks
                          ? 'Processing and splitting PDF...'
                          : 'Extract text and create one task per page'}
                      </span>
                    </div>
                  </Button>
                )}

                {/* Option 2: Task + Extensions — hidden when loading as an assessment */}
                {loadAsStep !== 'assessment-options' && (
                  <Button
                    className="h-auto w-full justify-start gap-3 rounded-xl border-slate-200 bg-white py-4 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                    variant="outline"
                    disabled={isSplittingTaskExtensions}
                    onClick={async () => {
                      if (!assetToLoad) return
                      setIsSplittingTaskExtensions(true)

                      try {
                        const textToInsert = assetToLoad.content || `[Asset: ${assetToLoad.name}]`

                        let pages: string[] = []
                        const pdfPagesUrls: string[] = []
                        const pdfPageKeys: string[] = []

                        const isPdf =
                          assetToLoad.mimeType === 'application/pdf' ||
                          assetToLoad.name.toLowerCase().endsWith('.pdf')

                        let pdfSplitSucceeded = false

                        if (isPdf && (assetToLoad.url || assetToLoad.fileKey)) {
                          // Split + store every page in ONE server request (avoids the
                          // per-page upload burst that tripped the rate limiter).
                          try {
                            const splitRes = await fetchWithCsrf('/api/tutor/documents/split', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                key: assetToLoad.fileKey,
                                url: assetToLoad.url,
                                fileName: assetToLoad.name,
                              }),
                            })
                            if (!splitRes.ok) {
                              const errData = await splitRes.json().catch(() => ({}))
                              throw new Error(errData.error || `Split failed (${splitRes.status})`)
                            }
                            const { pages: splitPages } = (await splitRes.json()) as {
                              pages: Array<{ pageNumber: number; url: string; key: string }>
                            }

                            for (const sp of splitPages) {
                              pdfPagesUrls.push(sp.url)
                              pdfPageKeys.push(sp.key)
                            }

                            // Dummy text to represent pages since we use physical PDF URLs
                            pages = Array(splitPages.length)
                              .fill('')
                              .map((_, i) => `Page ${i + 1} from ${assetToLoad.name}`)
                            pdfSplitSucceeded = true
                          } catch (splitErr) {
                            console.error('PDF split failed:', splitErr)
                          }
                        }

                        if (!pdfSplitSucceeded) {
                          // No per-page PDFs (e.g. a .docx, or the page-split failed):
                          // split the extracted text into sections so a structured
                          // document still becomes multiple extensions, not one task.
                          pages = splitDocIntoSections(textToInsert)
                          if (pages.length === 0) pages = [textToInsert]
                        }

                        let nodeIndex = -1
                        let lessonIndex = -1
                        let existingTaskIndex = -1
                        let existingTask: Task | null = null

                        if (loadedTaskId && !assetLoadTarget) {
                          for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
                            for (let lIdx = 0; lIdx < nodes[nIdx].lessons.length; lIdx++) {
                              const t = nodes[nIdx].lessons[lIdx].tasks.find(
                                task => task.id === loadedTaskId
                              )
                              if (t) {
                                nodeIndex = nIdx
                                lessonIndex = lIdx
                                existingTaskIndex = nodes[nIdx].lessons[lIdx].tasks.findIndex(
                                  task => task.id === loadedTaskId
                                )
                                existingTask = t
                                break
                              }
                            }
                            if (nodeIndex !== -1) break
                          }
                        }

                        if (nodeIndex === -1 || lessonIndex === -1) {
                          const { nodeId, lessonId } = resolveAssetLoadTarget()
                          nodeIndex = nodes.findIndex(m => m.id === nodeId)
                          lessonIndex = nodes[nodeIndex].lessons.findIndex(l => l.id === lessonId)
                        }

                        const newTask =
                          existingTask && existingTaskIndex !== -1
                            ? ({ ...existingTask } as Task)
                            : DEFAULT_TASK(nodes[nodeIndex].lessons[lessonIndex].tasks.length)

                        newTask.description = pages[0] || textToInsert

                        if (isPdf && pdfPagesUrls.length > 0) {
                          newTask.sourceDocument = {
                            fileName: `${assetToLoad.name} (Page 1)`,
                            fileUrl: pdfPagesUrls[0],
                            fileKey: pdfPageKeys[0],
                            mimeType: 'application/pdf',
                            uploadedAt: new Date().toISOString(),
                            extractedText: pages[0] || textToInsert,
                          }
                        } else if (
                          (assetToLoad.url || assetToLoad.fileKey) &&
                          assetToLoad.mimeType
                        ) {
                          newTask.sourceDocument = {
                            fileName: assetToLoad.name,
                            fileUrl:
                              assetToLoad.url ||
                              (assetToLoad.fileKey
                                ? `/api/proxy-file?key=${encodeURIComponent(assetToLoad.fileKey)}`
                                : ''),
                            fileKey: assetToLoad.fileKey,
                            mimeType: assetToLoad.mimeType,
                            uploadedAt: new Date().toISOString(),
                            extractedText: pages[0] || textToInsert,
                          }
                        }

                        const extensions = pages.slice(1).map((pageContent, idx) => {
                          const ext: any = {
                            id: `ext-${Date.now()}-${idx}`,
                            name: `Extension ${idx + 1}`,
                            description: '',
                            content: pageContent,
                            pci: '',
                          }

                          if (isPdf && pdfPagesUrls[idx + 1]) {
                            ext.sourceDocument = {
                              fileName: `${assetToLoad.name} (Page ${idx + 2})`,
                              fileUrl: pdfPagesUrls[idx + 1],
                              fileKey: pdfPageKeys[idx + 1],
                              mimeType: 'application/pdf',
                              uploadedAt: new Date().toISOString(),
                              extractedText: pageContent,
                            }
                          }

                          return ext
                        })

                        newTask.extensions = [...(newTask.extensions || []), ...extensions]

                        const newCourseBuilderNodes = [...nodes]
                        if (existingTask && existingTaskIndex !== -1) {
                          const updatedTasks = [
                            ...newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks,
                          ]
                          updatedTasks[existingTaskIndex] = newTask
                          newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks = updatedTasks
                        } else {
                          newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks.push(newTask)
                        }
                        setCourseBuilderNodes(newCourseBuilderNodes)
                        setMainBuilderTab('task')
                        setSelectedItem({ type: 'task', id: newTask.id })
                        loadTaskIntoBuilder(newTask)
                        revealCurriculumItem('task', newTask.id)

                        // Show PDF by default, hide text
                        setTaskPdfVisibleMap(prev => ({ ...prev, [newTask.id]: true }))
                        setTaskTextVisibleMap(prev => ({ ...prev, [newTask.id]: false }))

                        toast.success(
                          existingTask && existingTaskIndex !== -1
                            ? `Loaded into existing task with ${extensions.length} extension(s) from '${assetToLoad?.name}'`
                            : `Created Task with ${extensions.length} extension(s) from '${assetToLoad?.name}'`
                        )
                        setLoadAsModalOpen(false)
                        setAssetToLoad(null)

                        // Auto-send first PCI message
                        setTimeout(() => {
                          handlePciSend(
                            'task',
                            `I just uploaded a document named '${assetToLoad?.name}'. First, give me a brief summary of what the document actually is and what it contains. Only mention diagrams or images if they are genuinely present — do not assume there are any. Then ask me to confirm the summary is correct (or tell you what to fix), and do NOT ask any marking-policy questions yet — wait until I confirm the summary is right. Once I confirm, then help me build the marking policy by asking ONE simple question at a time, using clear, simple language and a small example each time.`
                          )
                        }, 500)
                      } catch (err: any) {
                        console.error('Task + Extensions splitting error:', err)
                        toast.error(err.message || 'Failed to process document')
                      } finally {
                        setIsSplittingTaskExtensions(false)
                      }
                    }}
                  >
                    {isSplittingTaskExtensions ? (
                      <Loader2 className="mt-1 h-5 w-5 shrink-0 animate-spin text-green-500" />
                    ) : (
                      <Layers2 className="mt-1 h-5 w-5 shrink-0 text-green-500" />
                    )}
                    <div className="flex flex-col items-start text-left">
                      <span className="font-semibold text-slate-900">Task + Extensions</span>
                      <span className="mt-1 text-xs font-normal text-slate-500">
                        {isSplittingTaskExtensions
                          ? 'Processing and splitting PDF...'
                          : 'First page as task, remaining as extensions'}
                      </span>
                    </div>
                  </Button>
                )}

                {/* Option 3: Assessment (whole document, never split) — hidden when loading as a task */}
                {loadAsStep !== 'task-options' && (
                  <Button
                    className="h-auto w-full justify-start gap-3 rounded-xl border-slate-200 bg-white py-4 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                    variant="outline"
                    onClick={() => loadAssetAsAssessment(assetToLoad)}
                  >
                    <FileQuestion className="mt-1 h-5 w-5 shrink-0 text-purple-500" />
                    <div className="flex flex-col items-start text-left">
                      <span className="font-semibold text-slate-900">Assessment</span>
                      <span className="mt-1 text-xs font-normal text-slate-500">
                        Load entire document into {loadedAssessmentId ? 'current' : 'a new'}{' '}
                        assessment
                      </span>
                    </div>
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Assets View Modal */}
        <Dialog open={assetsViewOpen} onOpenChange={setAssetsViewOpen}>
          <DialogContent
            className={cn(
              'max-w-4xl rounded-2xl border-0 bg-gray-200/90 p-5 shadow-2xl backdrop-blur-sm transition-opacity duration-200',
              isDraggingFromModal && 'pointer-events-none opacity-0'
            )}
          >
            <div className="flex h-[520px] flex-col gap-4">
              {/* Modal Header — centered title and subtitle */}
              <div className="text-center">
                <h3 className="text-lg font-bold text-gray-900">Assets</h3>
                <p className="text-xs text-gray-500">
                  View, organize, and load uploaded assets available in this course.
                </p>
              </div>

              {/* Toolbar — aligned with the two panels below */}
              <div className="flex gap-4">
                <div className="w-64 shrink-0">
                  {isCreatingFolder ? (
                    <div className="flex gap-2">
                      <Input
                        autoFocus
                        placeholder="Folder name..."
                        className="h-9 flex-1 rounded-full border-gray-300 bg-white text-sm shadow-sm"
                        value={newFolderName}
                        onChange={e => setNewFolderName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const trimmed = newFolderName.trim()
                            if (trimmed && !computedAssetFolders.includes(trimmed)) {
                              setAssetFoldersList(prev => [...prev, trimmed])
                              toast.success(`Folder "${trimmed}" created`)
                            } else if (trimmed) {
                              toast.error(`Folder "${trimmed}" already exists`)
                            }
                            setNewFolderName('')
                            setIsCreatingFolder(false)
                          }
                          if (e.key === 'Escape') {
                            setNewFolderName('')
                            setIsCreatingFolder(false)
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-9 rounded-full bg-emerald-500 px-3 text-white hover:bg-emerald-600"
                        onClick={() => {
                          const trimmed = newFolderName.trim()
                          if (trimmed && !computedAssetFolders.includes(trimmed)) {
                            setAssetFoldersList(prev => [...prev, trimmed])
                            toast.success(`Folder "${trimmed}" created`)
                          } else if (trimmed) {
                            toast.error(`Folder "${trimmed}" already exists`)
                          }
                          setNewFolderName('')
                          setIsCreatingFolder(false)
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 rounded-full p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        onClick={() => {
                          setNewFolderName('')
                          setIsCreatingFolder(false)
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1 rounded-full border-0 bg-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-white hover:text-emerald-600"
                      onClick={() => setIsCreatingFolder(true)}
                    >
                      <Plus className="h-4 w-4" /> Folder
                    </Button>
                  )}
                </div>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                  <Input
                    placeholder="Search assets..."
                    className="h-9 rounded-full border-gray-300 bg-white pl-9 text-sm shadow-sm"
                    value={assetViewSearch}
                    onChange={e => setAssetViewSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Body: folders left, assets right — both as white rounded cards */}
              <div className="flex flex-1 gap-4 overflow-hidden">
                {/* Folder list card */}
                <div className="flex w-64 shrink-0 flex-col rounded-xl bg-white p-3 shadow-sm">
                  <ScrollArea className="flex-1">
                    <div className="space-y-1">
                      {assetFolders.map(folder => (
                        <div key={folder}>
                          {editingFolder === folder ? (
                            <div className="flex items-center gap-1 px-2 py-1.5">
                              <Input
                                autoFocus
                                className="h-7 flex-1 rounded-md border-gray-300 bg-white text-sm"
                                value={editFolderName}
                                onChange={e => setEditFolderName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    const trimmed = editFolderName.trim()
                                    if (
                                      trimmed &&
                                      trimmed !== folder &&
                                      !computedAssetFolders.includes(trimmed)
                                    ) {
                                      setAssetFoldersList(prev =>
                                        prev.map(f => (f === folder ? trimmed : f))
                                      )
                                      setCourseAssets(prev =>
                                        prev.map(a =>
                                          a.folder === folder ? { ...a, folder: trimmed } : a
                                        )
                                      )
                                      toast.success(`Folder renamed to "${trimmed}"`)
                                    } else if (trimmed && trimmed !== folder) {
                                      toast.error(`Folder "${trimmed}" already exists`)
                                    }
                                    setEditingFolder(null)
                                    setEditFolderName('')
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingFolder(null)
                                    setEditFolderName('')
                                  }
                                }}
                              />
                              <Button
                                size="icon"
                                className="h-7 w-7 rounded-md bg-emerald-500 text-white hover:bg-emerald-600"
                                onClick={() => {
                                  const trimmed = editFolderName.trim()
                                  if (
                                    trimmed &&
                                    trimmed !== folder &&
                                    !computedAssetFolders.includes(trimmed)
                                  ) {
                                    setAssetFoldersList(prev =>
                                      prev.map(f => (f === folder ? trimmed : f))
                                    )
                                    setCourseAssets(prev =>
                                      prev.map(a =>
                                        a.folder === folder ? { ...a, folder: trimmed } : a
                                      )
                                    )
                                    toast.success(`Folder renamed to "${trimmed}"`)
                                  } else if (trimmed && trimmed !== folder) {
                                    toast.error(`Folder "${trimmed}" already exists`)
                                  }
                                  setEditingFolder(null)
                                  setEditFolderName('')
                                }}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                onClick={() => {
                                  setEditingFolder(null)
                                  setEditFolderName('')
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              className={cn(
                                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                                assetViewFolder === folder
                                  ? 'bg-blue-50 font-medium text-blue-600'
                                  : 'text-gray-600 hover:bg-gray-50'
                              )}
                              onClick={() => setAssetViewFolder(folder)}
                            >
                              <span className="flex items-center gap-2">
                                {assetViewFolder === folder ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                                <span
                                  className={
                                    assetViewFolder === folder ? 'text-blue-600' : 'text-gray-700'
                                  }
                                >
                                  {folder}
                                </span>
                              </span>
                              <span className="flex items-center gap-1">
                                {folder !== 'All' && (
                                  <>
                                    <button
                                      className="rounded p-0.5 text-gray-600 hover:bg-gray-100 hover:text-gray-600"
                                      onClick={e => {
                                        e.stopPropagation()
                                        setEditingFolder(folder)
                                        setEditFolderName(folder)
                                      }}
                                      title="Rename folder"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button
                                      className="rounded p-0.5 text-gray-600 hover:bg-red-50 hover:text-red-500"
                                      onClick={e => {
                                        e.stopPropagation()
                                        const assetCount = courseAssets.filter(
                                          a => a.folder === folder
                                        ).length
                                        const msg =
                                          assetCount > 0
                                            ? `Are you sure? ${assetCount} asset${assetCount > 1 ? 's' : ''} in this folder will become Uncategorized.`
                                            : 'Are you sure you want to delete this folder?'
                                        if (confirm(msg)) {
                                          setAssetFoldersList(prev =>
                                            prev.filter(f => f !== folder)
                                          )
                                          setCourseAssets(prev =>
                                            prev.map(a =>
                                              a.folder === folder ? { ...a, folder: undefined } : a
                                            )
                                          )
                                          if (assetViewFolder === folder) {
                                            setAssetViewFolder('All')
                                          }
                                          toast.success(`Folder "${folder}" deleted`)
                                        }
                                      }}
                                      title="Delete folder"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </>
                                )}
                                <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                                  {folder === 'All'
                                    ? courseAssets.length
                                    : courseAssets.filter(a => a.folder === folder).length}
                                </span>
                              </span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                {/* Asset list card */}
                <div className="flex flex-1 flex-col rounded-xl bg-white p-4 shadow-sm">
                  <ScrollArea className="flex-1">
                    <div className="space-y-2">
                      {filteredViewAssets.length === 0 ? (
                        <p className="py-8 text-center text-sm text-gray-600">
                          No assets in this folder.
                        </p>
                      ) : (
                        filteredViewAssets.map(asset => (
                          <div
                            key={asset.id}
                            draggable={!assetPickerTarget}
                            onDragStart={e => {
                              if (assetPickerTarget) {
                                e.preventDefault()
                                return
                              }
                              e.dataTransfer.setData(
                                'application/json',
                                JSON.stringify({ type: 'asset', asset })
                              )
                              // Hide modal visually so user can drop onto the builder
                              setIsDraggingFromModal(true)
                              document.body.classList.add('hide-radix-dialogs-for-drag')
                            }}
                            onDragEnd={() => {
                              if (assetPickerTarget) return
                              setIsDraggingFromModal(false)
                              document.body.classList.remove('hide-radix-dialogs-for-drag')
                              setAssetsViewOpen(false)
                            }}
                            onClick={() => {
                              if (assetPickerTarget) {
                                setAssetsViewOpen(false)
                                setTimeout(() => handleLoadAsset(asset), 50)
                              }
                            }}
                            className={cn(
                              'flex items-center justify-between rounded-xl px-4 py-3 transition-colors',
                              assetPickerTarget
                                ? 'cursor-pointer bg-emerald-500/50 ring-2 ring-transparent hover:bg-emerald-500/60 hover:ring-blue-400'
                                : 'cursor-grab bg-emerald-500/50 hover:bg-emerald-500/60 active:cursor-grabbing'
                            )}
                          >
                            <div className="mr-3 flex flex-1 items-center gap-3 overflow-hidden">
                              <FileText className="h-5 w-5 shrink-0 text-white" />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-white">
                                  {asset.name}
                                </p>
                                <p className="text-[11px] text-white/80">
                                  Folder: {asset.folder || 'Uncategorized'}
                                </p>
                              </div>
                            </div>
                            <div
                              className="flex shrink-0 items-center gap-2"
                              onClick={e => e.stopPropagation()}
                            >
                              {/* Folder assignment dropdown */}
                              <select
                                onClick={e => e.stopPropagation()}
                                className="h-7 rounded-md border border-gray-200 bg-white px-2 text-[11px] text-gray-600 outline-none focus-visible:border-blue-400"
                                value={asset.folder || ''}
                                onChange={e => {
                                  const folder = e.target.value || undefined
                                  setCourseAssets(prev =>
                                    prev.map(a => (a.id === asset.id ? { ...a, folder } : a))
                                  )
                                }}
                              >
                                <option value="">Uncategorized</option>
                                {computedAssetFolders
                                  .filter(f => f !== 'All')
                                  .map(f => (
                                    <option key={f} value={f}>
                                      {f}
                                    </option>
                                  ))}
                              </select>

                              {/* Kebab menu for Load / Delete */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-white hover:bg-white/20 hover:text-white"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="z-[600]">
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      setAssetsViewOpen(false)
                                      // Document's own kebab → always show the lesson picker.
                                      setTimeout(() => handleLoadAsset(asset, null), 50)
                                    }}
                                  >
                                    Load
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600"
                                    onClick={() => {
                                      setCourseAssets(prev => prev.filter(a => a.id !== asset.id))
                                    }}
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )

    const updateSelectedItem = (updates: PreviewUpdatePayload) => {
      if (!selectedItem) return
      const target = resolveSelectedItem(selectedItem, nodes)
      if (!target?.lessonId) return

      setCourseBuilderNodes(prev =>
        prev.map(mod => {
          if (mod.id !== target.nodeId) return mod
          return {
            ...mod,
            lessons: mod.lessons.map(lesson => {
              if (lesson.id !== target.lessonId) return lesson
              if (selectedItem.type === 'task') {
                const taskUpdates = updates as Partial<Task>
                return {
                  ...lesson,
                  tasks: lesson.tasks.map(task =>
                    task.id === selectedItem.id ? { ...task, ...taskUpdates } : task
                  ),
                }
              }
              if (selectedItem.type === 'homework') {
                const homeworkUpdates = updates as Partial<Assessment>
                return {
                  ...lesson,
                  homework: lesson.homework.map(hw =>
                    hw.id === selectedItem.id ? { ...hw, ...homeworkUpdates } : hw
                  ),
                }
              }
              return lesson
            }),
          }
        })
      )
    }

    const activeTaskExtension = taskBuilder.activeExtensionId
      ? taskBuilder.extensions.find(ext => ext.id === taskBuilder.activeExtensionId)
      : null

    // An extension is its own item: when one is active, show ONLY its document
    // (a new extension has none) — do not fall back to the parent task's, which
    // made extensions look like they inherited the task's content.
    const currentTaskDocument = activeTaskExtension
      ? activeTaskExtension.sourceDocument
      : taskSourceDocument || taskBuilder.sourceDocument
    const hasTaskDocument = !!currentTaskDocument
    const hasUploadedTaskDocument = !!currentTaskDocument && !currentTaskDocument.generatedFromText

    const currentAssessmentDocument = assessmentSourceDocument || assessmentBuilder.sourceDocument

    // An image scan or an Office file (Word / PowerPoint, modern or legacy) —
    // documents whose figures text/OCR extraction drops, but that we can turn
    // into images for the vision model (Office files via server-side rendering).
    const isImageOrOfficeDoc = (doc?: { mimeType?: string; fileName?: string }): boolean =>
      !!doc &&
      (!!doc.mimeType?.startsWith('image/') ||
        doc.mimeType === 'application/msword' ||
        doc.mimeType === 'application/vnd.ms-powerpoint' ||
        doc.mimeType ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        doc.mimeType ===
          'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        /\.(docx?|pptx?)$/i.test(doc.fileName || ''))
    // Documents the "Analyze diagrams" toggle can send to the AI as images: PDFs
    // (page-rendered) plus image scans and Office files (Word / PowerPoint).
    const docSupportsFigureAnalysis = (doc?: { mimeType?: string; fileName?: string }): boolean =>
      !!doc && (doc.mimeType === 'application/pdf' || isImageOrOfficeDoc(doc))
    const hasAssessmentDocument = !!currentAssessmentDocument

    // Auto-detect the exam Board from the ASSESSMENT itself — its file name,
    // title, and the start of its extracted text — so it reflects THIS paper
    // (e.g. an SAT paper reads "SAT") instead of being fixed to the course
    // folder. Falls back to the course category, and the tutor can always
    // override it in the Guided form. Board applies to assessments only.
    const detectedAssessmentBoard = useMemo(() => {
      const probe = [
        currentAssessmentDocument?.fileName,
        assessmentBuilder.title,
        (currentAssessmentDocument?.extractedText || '').slice(0, 1200),
      ]
        .filter(Boolean)
        .join('\n')
      return deriveExamContext(probe || null).examBody || ''
    }, [currentAssessmentDocument, assessmentBuilder.title])
    const pciBoard =
      pciBoardOverride ??
      (detectedAssessmentBoard || deriveExamContext(pciCategory || null, courseName).examBody || '')

    // DMI-first gate: an assessment's marking-policy (PCI) chat unlocks only once
    // the DMI exists with questions, marks, and an answer key/rubric (the "basic"
    // bar). Per-question gaps are surfaced but don't block. See assessmentDmiReadiness.
    const { totalMarks: assessmentDmiTotalMarks, ready: assessmentDmiReady } =
      assessmentDmiReadiness(assessmentDmiItems)

    // Build tiered context for the PCI assistant: the whole course, the specific
    // lesson that contains the active task/assessment, and the task itself. This
    // is sent on the first PCI turn only so the model does not hallucinate from
    // the filename.
    const { courseContext, lessonContext } = useMemo(() => {
      const courseCtx = buildCourseContext(courseName, courseDescription, nodes)
      let lessonCtx = ''
      if (loadedTaskId) {
        const found = findContainingLesson(nodes, lesson =>
          lesson.tasks.some(t => t.id === loadedTaskId)
        )
        if (found) lessonCtx = buildLessonContext(found.lesson)
      } else if (loadedAssessmentId) {
        const found = findContainingLesson(nodes, lesson =>
          lesson.homework.some(h => h.id === loadedAssessmentId)
        )
        if (found) lessonCtx = buildLessonContext(found.lesson)
      }
      return {
        courseContext: courseCtx.slice(0, 50000),
        lessonContext: lessonCtx.slice(0, 30000),
      }
    }, [courseName, courseDescription, nodes, loadedTaskId, loadedAssessmentId])

    // PCI assistant state + actions, consolidated into a reducer-backed hook.
    // Called late (all deps below are defined by here); the two early consumers
    // (task/assessment loaders and the blank-slate reset) reach it via the
    // stable refs assigned just below.
    const pciApi = usePci({
      loadedTaskId,
      loadedAssessmentId,
      taskBuilder,
      assessmentBuilder,
      setCurrentPci,
      taskSourceDocument,
      currentAssessmentDocument,
      courseContext,
      lessonContext,
      autoCreateTask,
      autoCreateAssessment,
      renderPdfToImages,
      pdfPageCache,
      // DMI digest (marks + rubric, no answers) so the policy chat sees the
      // actual questions/marks/rubrics.
      assessmentMarkingScheme: assessmentDmiItems
        .map(q => {
          const label = q.questionLabel || `Q${q.questionNumber ?? ''}`
          const text =
            q.questionText && q.questionText.trim() && q.questionText.trim() !== label
              ? ` ${q.questionText.trim()}`
              : ''
          const marks =
            typeof q.marks === 'number' && q.marks > 0
              ? ` [${q.marks} mark${q.marks === 1 ? '' : 's'}]`
              : ''
          const rubric = q.rubric?.trim() ? `\n  rubric: ${q.rubric.trim()}` : ''
          return `${label}:${text}${marks}${rubric}`
        })
        .join('\n'),
      // Per-type steering for the assessment PCI chat: composition from the DMI
      // question mix, source from the resolved documentKind. Forwarded as
      // context.variant; undefined fields simply fall back to the base prompt.
      assessmentPciVariant: {
        composition: resolvePciComposition(assessmentDmiItems.map(q => q.questionType)),
        documentKind: dmiDocumentKind.assessment,
      },
      // Task steering: source only (task answering is free-form, no composition).
      taskPciVariant: {
        documentKind: dmiDocumentKind.task,
      },
    })
    const { pci, handlePciSend, applyTaskPciDraft, applyAssessmentPciDraft, setPciInput } = pciApi
    const editSpecSoFar = pciApi.editSpecSoFar
    loadPciMessagesRef.current = pciApi.loadPciMessages
    resetPciRef.current = pciApi.resetPci

    // Reconstruct the old per-context views the render reads, from the reducer.
    const activeTaskTarget: PciTarget = taskBuilder.activeExtensionId
      ? { kind: 'taskExtension', id: taskBuilder.activeExtensionId }
      : { kind: 'task' }
    const activeTaskThread = getThread(pci, activeTaskTarget)
    const taskPciLoading = activeTaskThread.loading
    const taskPciErrorHint = activeTaskThread.errorHint
    const taskPciDraft = activeTaskThread.draft
    const taskPciGuardrailWarnings = activeTaskThread.guardrailWarnings
    // Assessment threads keyed by id (render reads these as maps with `|| default`).
    const assessmentPciMessagesMap = Object.fromEntries(
      Object.entries(pci.assessments).map(([k, t]) => [k, t.messages])
    )
    const assessmentPciInputMap = Object.fromEntries(
      Object.entries(pci.assessments).map(([k, t]) => [k, t.input])
    )
    const assessmentPciLoadingMap = Object.fromEntries(
      Object.entries(pci.assessments).map(([k, t]) => [k, t.loading])
    )
    const assessmentPciErrorHintMap = Object.fromEntries(
      Object.entries(pci.assessments).map(([k, t]) => [k, t.errorHint])
    )
    const assessmentPciDraftMap = Object.fromEntries(
      Object.entries(pci.assessments).map(([k, t]) => [k, t.draft])
    )
    const assessmentPciGuardrailWarningsMap = Object.fromEntries(
      Object.entries(pci.assessments).map(([k, t]) => [k, t.guardrailWarnings])
    )
    const assessmentPciSpecSoFarMap = Object.fromEntries(
      Object.entries(pci.assessments).map(([k, t]) => [k, t.specSoFar])
    )

    const activeTaskPciMessages = activeTaskThread.messages
    // The saved PCI (marking policy) for the active context — what grading uses.
    const activeTaskPci = taskBuilder.activeExtensionId
      ? (taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)?.pci ?? '')
      : taskBuilder.taskPci
    // Read-only-with-edit "Current marking policy" box shown atop a PCI tab.
    const renderCurrentPci = (source: 'task' | 'assessment', value: string) => (
      <div
        data-pci-anchor="current-pci"
        className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-700">Current marking policy (PCI)</span>
          <div className="flex items-center gap-2">
            {value.trim() && canEdit && (
              <button
                type="button"
                onClick={() => setCurrentPci(source, '')}
                className="text-slate-600 hover:text-red-600"
              >
                Clear
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setPciFormSource(prev => (prev === source ? null : source))}
                className="font-semibold text-indigo-700 hover:underline"
              >
                {pciFormSource === source ? 'Hide PCI form' : 'Guided PCI form'}
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                data-pci-anchor="edit-pci"
                onClick={() => setEditingCurrentPci(v => !v)}
                className="font-semibold text-blue-700 hover:underline"
              >
                {editingCurrentPci ? 'Done' : 'Edit'}
              </button>
            )}
          </div>
        </div>
        {pciFormSource === source && (
          // Manual, structured alternative to the conversational PCI assistant chat
          // (the single conversational surface). No competing chat here.
          <PciQuestionnaire
            source={source}
            title={source === 'task' ? taskBuilder.title : assessmentBuilder.title}
            content={source === 'task' ? taskBuilder.taskContent : assessmentBuilder.taskContent}
            currentPci={value}
            // The official marking scheme (DMI) loaded in "Edit marks & answers",
            // distilled to its policy-bearing bits (no answers) so the AI can
            // infer award conventions from it.
            markingScheme={(source === 'task' ? taskDmiItems : assessmentDmiItems)
              .map(q => ({
                label: q.questionLabel,
                marks: typeof q.marks === 'number' ? q.marks : undefined,
                rubric: q.rubric?.trim() || undefined,
                responseType: q.responseType?.trim() || undefined,
                hasVariants: (q.acceptableVariants?.length ?? 0) > 0,
              }))
              .filter(q => q.rubric || typeof q.marks === 'number' || q.hasVariants)}
            // Upload a marking scheme straight from the Guided form: fills the
            // DMI (marks & answers) via the same flow as "Edit marks & answers",
            // then the form auto-prefills the PCI from it.
            onUploadMarkingScheme={file => handleMarkingSchemeFile(file, source)}
            markingSchemeLoading={markingSchemeLoading}
            board={pciBoard}
            subject={pciCategory}
            categoryOptions={pciCategoryOptions}
            onExamContextChange={patch => handlePciExamContextChange(source, patch)}
            canEdit={canEdit}
            onSave={(specText, spec) => {
              setCurrentPci(source, specText, {
                approvedPci: specText,
                spec,
                transcript: [],
                approvedAt: Date.now(),
              })
              setPciFormSource(null)
              toast.success('Marking policy saved to PCI')
            }}
            onClose={() => setPciFormSource(null)}
          />
        )}
        {editingCurrentPci ? (
          <>
            <textarea
              value={value}
              readOnly={!canEdit}
              onChange={e => setCurrentPci(source, e.target.value)}
              placeholder="The marking policy used when grading… (chat below to draft one, then paste/refine it here)"
              className="mt-1.5 min-h-[80px] w-full resize-y rounded-md border border-gray-300 p-2 text-xs text-gray-900"
            />
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              <span className="font-semibold">Tip:</span> put scoring specifics — correct answers,
              acceptable variants, marks, per-question rubric — in the{' '}
              {source === 'assessment' ? 'marking scheme (DMI)' : 'question rubric'}. Use the PCI
              for cross-cutting <span className="font-semibold">policy</span>: method marks,
              accepted equivalents, unit penalties, tone, and retries. The PCI{' '}
              <span className="font-semibold">overrides</span> the rubric where they conflict, so
              avoid restating the same rules in both.
            </p>
          </>
        ) : value.trim() ? (
          <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-slate-700">
            {value}
          </p>
        ) : (
          <p className="mt-1 italic text-slate-600">
            None yet — chat below to draft one, then click <b>Edit</b> to paste or type it here.
            This is what guides AI grading.
          </p>
        )}
        {/* TASK-6: the structured specification mirror, when one was finalized. */}
        {(() => {
          const activeSpec = source === 'task' ? taskBuilder.pciSpec : assessmentBuilder.pciSpec
          if (!activeSpec || editingCurrentPci) return null
          return (
            <div className="mt-2 border-t border-slate-200 pt-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Structured specification
              </p>
              <dl className="space-y-1">
                {PCI_SPEC_FIELDS.filter(f => activeSpec[f.key]).map(f => (
                  <div key={f.key} className="grid grid-cols-[minmax(0,9rem)_1fr] gap-2">
                    <dt className="text-slate-500">{f.label}</dt>
                    <dd className="text-slate-700">{activeSpec[f.key]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )
        })()}
      </div>
    )
    const activeTaskPciInput = activeTaskThread.input
    const taskHeaderTitle = activeTaskExtension
      ? `${taskBuilder.title || 'Task'} ${activeTaskExtension.name}`
      : taskBuilder.title || 'Task'
    const taskHeaderDescription = activeTaskExtension
      ? activeTaskExtension.description || 'Add a short description'
      : taskBuilder.details || 'Add a short description'

    const [taskTextVisibleMap, setTaskTextVisibleMap] = useState<Record<string, boolean>>({})
    const [taskPdfVisibleMap, setTaskPdfVisibleMap] = useState<Record<string, boolean>>({})

    const [assessmentTextVisibleMap, setAssessmentTextVisibleMap] = useState<
      Record<string, boolean>
    >({})
    const [assessmentPdfVisibleMap, setAssessmentPdfVisibleMap] = useState<Record<string, boolean>>(
      {}
    )

    // Which content panes show (text editor / document preview / both). The rule
    // — including the invariant that a document-less item ALWAYS shows the text
    // editor so a stale view preference can't strand the tutor — lives in the
    // tested resolveDocPaneVisibility helper.
    const taskView = resolveDocPaneVisibility({
      hasDocument: hasUploadedTaskDocument,
      savedTextVisible: loadedTaskId ? taskTextVisibleMap[loadedTaskId] : undefined,
      savedPdfVisible: loadedTaskId ? taskPdfVisibleMap[loadedTaskId] : undefined,
    })
    const taskTextVisible = taskView.textVisible
    const taskPdfVisible = taskView.pdfVisible

    const setTaskTextVisible = (val: boolean) => {
      if (loadedTaskId) setTaskTextVisibleMap(prev => ({ ...prev, [loadedTaskId]: val }))
    }
    const setTaskPdfVisible = (val: boolean) => {
      if (loadedTaskId) setTaskPdfVisibleMap(prev => ({ ...prev, [loadedTaskId]: val }))
    }

    // Same rule for the assessment builder, via the same tested helper.
    const assessmentView = resolveDocPaneVisibility({
      hasDocument: hasAssessmentDocument,
      savedTextVisible: loadedAssessmentId
        ? assessmentTextVisibleMap[loadedAssessmentId]
        : undefined,
      savedPdfVisible: loadedAssessmentId ? assessmentPdfVisibleMap[loadedAssessmentId] : undefined,
    })
    const assessmentTextVisible = assessmentView.textVisible
    const assessmentPdfVisible = assessmentView.pdfVisible

    const setAssessmentTextVisible = (val: boolean) => {
      if (loadedAssessmentId)
        setAssessmentTextVisibleMap(prev => ({ ...prev, [loadedAssessmentId]: val }))
    }
    const setAssessmentPdfVisible = (val: boolean) => {
      if (loadedAssessmentId)
        setAssessmentPdfVisibleMap(prev => ({ ...prev, [loadedAssessmentId]: val }))
    }

    // Auto-switch task panels based on whether there is an uploaded document.
    // Generated-from-text snapshots are intentionally treated as "no document"
    // in the Slide builder so the tutor only sees the editable slide canvas there.
    useEffect(() => {
      if (loadedTaskId) {
        setTaskTextVisibleMap(prev => {
          const expected = !hasUploadedTaskDocument
          if (prev[loadedTaskId] === expected) return prev
          return { ...prev, [loadedTaskId]: expected }
        })
        setTaskPdfVisibleMap(prev => {
          const expected = hasUploadedTaskDocument
          if (prev[loadedTaskId] === expected) return prev
          return { ...prev, [loadedTaskId]: expected }
        })
      }
    }, [loadedTaskId, hasUploadedTaskDocument])

    // DMI-first kickoff: once the assessment's DMI is ready (chat unlocked) and
    // the marking-policy chat has no user messages yet, auto-start the guided flow
    // — the agent first summarizes the assessment (using the DMI it already has)
    // for the tutor to confirm, then walks the general marking policy. Fires
    // once per assessment.
    const pciKickoffRef = useRef<Set<string>>(new Set())
    useEffect(() => {
      const id = loadedAssessmentId
      if (!id || !assessmentDmiReady || !canEdit) return
      const thread = getThread(pci, { kind: 'assessment', id })
      const hasUserMessage = thread.messages.some(m => m.role === 'user')
      if (hasUserMessage || thread.loading) return
      if (pciKickoffRef.current.has(id)) return
      pciKickoffRef.current.add(id)
      // Defer to the next microtask so the render finishes and the once-per-target
      // guard survives React Strict Mode's double effect run. With setTimeout, the
      // first cleanup would clear the pending timeout and the second run would see
      // the id already in the ref, so the kickoff would never fire in dev.
      queueMicrotask(() => {
        handlePciSend(
          'assessment',
          'You already have the questions, sections, and marks (the DMI), so do not ask me about the questions, types, sections, or marks. First give me a brief summary of this assessment — what it covers, its sections / question types, and the total marks — so I can confirm you have understood it, then guide me through the GENERAL marking policy for the whole assessment one simple question at a time (how marks are awarded — method vs final answer, partial credit — how to handle wrong / partial / no answers, and tone), in clear, simple language with a small example each time. Only ask about a specific question if its marking differs from the general rule.'
        )
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadedAssessmentId, assessmentDmiReady, canEdit])

    // Task PCI first-open kickoff: when the tutor opens the PCI tab for a task
    // (or task extension) and no user message has been sent yet, auto-request the
    // grounded summary so the tutor does not have to type a first message. Saved
    // assistant-only policy is ignored because it is not a conversation turn.
    // Fires once per target.
    useEffect(() => {
      if (taskBuilderActiveTab !== 'pci') return
      const taskId = loadedTaskId
      if (!taskId) return
      const extId = taskBuilder.activeExtensionId
      const targetId = extId ? `ext:${extId}` : `task:${taskId}`
      const hasUserMessage = activeTaskThread.messages.some(m => m.role === 'user')
      if (hasUserMessage || activeTaskThread.loading) return
      if (pciKickoffRef.current.has(targetId)) return
      pciKickoffRef.current.add(targetId)
      // Defer to the next microtask so the render finishes and the once-per-target
      // guard survives React Strict Mode's double effect run. With setTimeout, the
      // first cleanup would clear the pending timeout and the second run would see
      // the target already in the ref, so the kickoff would never fire in dev.
      queueMicrotask(() => {
        handlePciSend(
          'task',
          'Please summarize this task based on the provided context, including its role in the lesson and course.',
          true
        )
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskBuilderActiveTab, loadedTaskId, taskBuilder.activeExtensionId])

    // Auto-scroll the task PCI chat so new messages / the loading indicator
    // stays pinned to the bottom without manual scrolling. Also re-pin when the
    // PCI tab becomes active, so the tutor always lands on the latest turn.
    useEffect(() => {
      const el = taskPciScrollRef.current
      if (!el) return
      const scroll = () => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      }
      // Defer one frame so the DOM has finished laying out the new message.
      const raf = requestAnimationFrame(() => {
        scroll()
        // Some browsers measure scrollHeight before layout; give a second chance.
        const t = setTimeout(scroll, 50)
        return () => clearTimeout(t)
      })
      return () => cancelAnimationFrame(raf)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTaskPciMessages.length, taskPciLoading, taskBuilderActiveTab])

    // Auto-switch assessment panels based on document presence
    useEffect(() => {
      if (loadedAssessmentId) {
        setAssessmentTextVisibleMap(prev => {
          const expected = !hasAssessmentDocument
          if (prev[loadedAssessmentId] === expected) return prev
          return { ...prev, [loadedAssessmentId]: expected }
        })
        setAssessmentPdfVisibleMap(prev => {
          const expected = hasAssessmentDocument
          if (prev[loadedAssessmentId] === expected) return prev
          return { ...prev, [loadedAssessmentId]: expected }
        })
      }
    }, [loadedAssessmentId, hasAssessmentDocument])

    const handleSaveAll = () => {
      if (!onSave) return
      onSave(
        nodes.map(n => n.lessons[0] || ({} as any)),
        { developmentMode: devMode, previewDifficulty }
      )
    }

    const isExtensionsCollapsed = (taskId: string) => collapsedTaskExtensions.has(taskId)

    const toggleExtensions = (taskId: string) => {
      setCollapsedTaskExtensions(prev => {
        const next = new Set(prev)
        if (next.has(taskId)) next.delete(taskId)
        else next.add(taskId)
        return next
      })
    }

    const leftResizeStartX = useRef(0)
    const leftResizeStartW = useRef(340)
    useEffect(() => {
      if (!leftPanelResizing) return
      const onMove = (e: MouseEvent) => {
        const delta = e.clientX - leftResizeStartX.current
        const newW = Math.max(300, Math.min(560, leftResizeStartW.current + delta))
        setLeftPanelWidth(newW)
      }
      const onUp = () => setLeftPanelResizing(false)
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      return () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
    }, [leftPanelResizing])

    // Auto-save course edits (debounced). Off in insights mode UNLESS the caller
    // opts in via insightsProps.autoSave (the in-session Edit-course modal), so
    // edits persist without a manual Save. Gated on a stable boolean — NOT the
    // insightsProps object — so a new-object-every-render doesn't reset the timer.
    const autoSaveEnabled = !insightsProps || !!insightsProps.autoSave
    useEffect(() => {
      if (!canEdit) return
      if (!autoSaveEnabled) return
      if (!onSave) return

      const timeoutId = setTimeout(() => {
        onSave(
          nodes.map(n => n.lessons[0] || ({} as any)),
          {
            developmentMode: devMode,
            previewDifficulty,
            courseName: coursePropsModal.name || courseName,
            courseDescription: coursePropsModal.description,
            isAutoSave: true,
          }
        )
      }, 2000)

      return () => clearTimeout(timeoutId)
    }, [
      nodes,
      devMode,
      previewDifficulty,
      coursePropsModal.name,
      coursePropsModal.description,
      courseName,
      onSave,
      autoSaveEnabled,
    ])

    const filteredCourseBuilderNodes = useMemo(() => {
      if (!searchQuery.trim()) return nodes
      const lowerQuery = searchQuery.toLowerCase()

      return nodes
        .map(node => {
          const nodeMatch = node.title.toLowerCase().includes(lowerQuery)

          const filteredLessons = node.lessons
            .map(lesson => {
              const lessonMatch = lesson.title.toLowerCase().includes(lowerQuery)

              const filteredTasks = (lesson.tasks || []).filter(
                task =>
                  task.title?.toLowerCase().includes(lowerQuery) ||
                  task.description?.toLowerCase().includes(lowerQuery) ||
                  task.extensions?.some(
                    ext =>
                      ext.name?.toLowerCase().includes(lowerQuery) ||
                      ext.content?.toLowerCase().includes(lowerQuery)
                  )
              )

              const filteredHomework = (lesson.homework || []).filter(
                hw =>
                  hw.title?.toLowerCase().includes(lowerQuery) ||
                  hw.description?.toLowerCase().includes(lowerQuery)
              )

              const hasMatchingContent = filteredTasks.length > 0 || filteredHomework.length > 0

              if (lessonMatch || nodeMatch || hasMatchingContent) {
                return {
                  ...lesson,
                  tasks: lessonMatch || nodeMatch ? lesson.tasks : filteredTasks,
                  homework: lessonMatch || nodeMatch ? lesson.homework : filteredHomework,
                }
              }
              return null
            })
            .filter(Boolean) as typeof node.lessons

          if (nodeMatch || filteredLessons.length > 0) {
            return {
              ...node,
              lessons: filteredLessons,
            }
          }
          return null
        })
        .filter(Boolean) as typeof nodes
    }, [nodes, searchQuery])

    const isLiveMode = saveMode !== undefined ? saveMode === 'live' : coursePropsModal.isLive

    return (
      <div className="course-builder-density relative flex h-full w-full flex-col items-stretch">
        {preparingTestPreview && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <span className="text-sm font-medium text-slate-700">Preparing task preview…</span>
            </div>
          </div>
        )}
        <Tabs
          value={mainTab}
          onValueChange={handleMainTabChange}
          className="flex h-full w-full flex-1 flex-col bg-gray-50/50 px-0 pt-0"
        >
          <div
            ref={layoutRowRef}
            className={cn(
              'relative flex h-full w-full pb-6 pl-[17px] pr-4 pt-0 sm:pl-[17px] sm:pr-4'
            )}
            style={{
              gap: '24px',
            }}
          >
            {/* LEFT PANEL - Course Structure (resizable, ~75% of original width) */}
            {/* Floating collapsed/expanded pill */}
            <div
              className={cn(
                'absolute top-1/2 z-50 flex h-16 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-full border border-l-0 shadow-[2px_0_8px_rgba(0,0,0,0.08)] transition-all duration-500 ease-in-out',
                leftPanelHidden && isLeftPeeking ? 'w-10' : 'w-8 hover:w-10',
                leftPanelHidden
                  ? 'border-[#1D4ED8]/30 bg-[linear-gradient(135deg,#0B3A9B_0%,#1D4ED8_35%,#0A2F78_100%)]'
                  : 'border-[#E5E7EB] bg-white'
              )}
              style={{ left: leftPanelHidden ? 0 : leftPanelWidth }}
              onClick={() => setLeftPanelHidden(!leftPanelHidden)}
              title={leftPanelHidden ? 'Show curriculum' : 'Hide curriculum'}
            >
              {leftPanelHidden ? (
                <ChevronRight className="h-5 w-5 text-white" />
              ) : (
                <ChevronLeft className="h-5 w-5 text-[#2B5FB8]" />
              )}
            </div>

            <div
              className={cn(
                'relative z-40 flex min-h-0 shrink-0 flex-col',
                panelsMounted ? 'transition-[width] duration-500 ease-in-out' : '',
                leftPanelHidden
                  ? 'bg-transparent shadow-none'
                  : 'shadow-[0_18px_45px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]'
              )}
              ref={leftPanelRef}
              style={{ width: effLeftPanelWidth, flexShrink: 0 }}
            >
              <div
                className={cn(
                  'flex h-full min-h-0 flex-col overflow-hidden rounded-[20px]',
                  panelsMounted ? 'transition-all duration-500 ease-in-out' : '',
                  leftPanelHidden ? 'w-0 opacity-0' : 'w-full opacity-100'
                )}
              >
                <Card
                  padding="none"
                  elevation="none"
                  className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-[rgba(0,0,0,0.04)] bg-[#FFFFFF]"
                >
                  <div className="sticky top-0 z-10 flex h-9 items-center justify-center rounded-t-[20px] bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] px-4 text-sm font-semibold text-white">
                    Curriculum
                  </div>
                  <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-0 pt-5">
                    {mainTab !== 'live' && mainTab !== 'test-pci' && canEdit && (
                      <Button
                        size="sm"
                        onClick={addCourseBuilderNode}
                        className="mb-4 h-8 w-full gap-1 border border-blue-600 bg-white text-xs text-blue-600 transition-colors hover:bg-blue-600 hover:text-white"
                      >
                        <Plus className="h-3 w-3" />
                        Lesson
                      </Button>
                    )}

                    {!hideDirectorySearch && (
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
                        <input
                          placeholder="Search course..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="w-full rounded-2xl border border-[#E5E7EB] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1F2933] outline-none placeholder:text-[#98A2B3] focus-visible:border-[#B8CCFF] focus-visible:ring-2 focus-visible:ring-[#DCEAFF]"
                        />
                      </div>
                    )}

                    <ScrollArea className="[&>[data-radix-scroll-area-viewport]]:scrollbar-none min-h-0 flex-1 pr-1">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="flex flex-col gap-2">
                          {/* Lessons (formerly nodes) - with drag sorting */}
                          <SortableContext
                            items={filteredCourseBuilderNodes.map(node => node.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {filteredCourseBuilderNodes.map((node, nodeIdx) => {
                              const primaryLesson = node.lessons[0] ?? DEFAULT_LESSON(0)
                              const taskCount = primaryLesson.tasks?.length || 0
                              const assessments = (primaryLesson.homework || []).filter(
                                h => h.category !== 'homework'
                              )
                              const totalItems = taskCount + assessments.length
                              return (
                                <SortableTreeItem
                                  key={node.id}
                                  id={node.id}
                                  depth={0}
                                  isLast={nodeIdx === nodes.length - 1}
                                  dragHandle={false}
                                  className="lesson-card mb-2 ml-0 overflow-hidden rounded-[24px] border border-[rgba(37,99,235,0.35)] bg-white pl-0 shadow-[0_14px_32px_rgba(0,0,0,0.16),0_4px_10px_rgba(37,99,235,0.10)] transition-[box-shadow,border-color] duration-[160ms] ease-[ease]"
                                >
                                  <div className="group">
                                    <div
                                      className={cn(
                                        'flex w-full cursor-pointer flex-nowrap items-center justify-between gap-3 border-b border-[#F1F5F9] px-4 py-3.5 transition-colors hover:bg-slate-50'
                                      )}
                                      onClick={() => toggleCourseBuilderNode(node.id)}
                                    >
                                      <div className="flex min-w-0 items-center gap-3">
                                        <button className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F2F4F7] text-[#667085]">
                                          {expandedCourseBuilderNodes.has(node.id) ? (
                                            <ChevronDown className="h-4 w-4" />
                                          ) : (
                                            <ChevronRight className="h-4 w-4" />
                                          )}
                                        </button>
                                        <div className="min-w-0">
                                          <div
                                            className="truncate text-sm font-semibold text-[#1F2933]"
                                            title={node.title}
                                          >
                                            {node.title}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex shrink-0 items-center gap-2">
                                        <div className="flex h-7 min-w-[28px] items-center justify-center rounded-full bg-[#1D4ED8] px-2 text-xs font-semibold text-white">
                                          {totalItems}
                                        </div>
                                        {mainTab !== 'builder' || !canEdit ? (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            disabled
                                            className={cn(
                                              'h-7 w-7 cursor-not-allowed rounded-full transition-opacity',
                                              directoryMenusAlwaysVisible
                                                ? 'opacity-30'
                                                : 'opacity-0 group-hover:opacity-30'
                                            )}
                                            onClick={e => e.stopPropagation()}
                                          >
                                            <MoreVertical className="h-4 w-4 text-[#98A2B3]" />
                                          </Button>
                                        ) : (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className={cn(
                                                  'h-7 w-7 rounded-full transition-opacity hover:bg-[#F2F4F7]',
                                                  directoryMenusAlwaysVisible
                                                    ? 'opacity-80 hover:opacity-100'
                                                    : 'opacity-0 group-hover:opacity-100'
                                                )}
                                                onClick={e => e.stopPropagation()}
                                              >
                                                <MoreVertical className="h-4 w-4 text-[#98A2B3]" />
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="z-[100]">
                                              <DropdownMenuItem
                                                onSelect={() => {
                                                  const newName = window.prompt(
                                                    'Rename Lesson (Max 25 chars)',
                                                    node.title
                                                  )
                                                  if (newName && newName.trim()) {
                                                    const sanitizedName = newName
                                                      .replace(/[@;'"]/g, '')
                                                      .substring(0, 25)
                                                      .trim()
                                                    if (!sanitizedName) return
                                                    setCourseBuilderNodes(prev =>
                                                      prev.map(n => {
                                                        if (n.id === node.id) {
                                                          const lessons = [...n.lessons]
                                                          if (lessons.length > 0) {
                                                            lessons[0] = {
                                                              ...lessons[0],
                                                              title: sanitizedName,
                                                            }
                                                          }
                                                          return {
                                                            ...n,
                                                            title: sanitizedName,
                                                            lessons,
                                                          }
                                                        }
                                                        return n
                                                      })
                                                    )
                                                  }
                                                }}
                                              >
                                                Rename
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onSelect={() => duplicateCourseBuilderNode(node)}
                                              >
                                                Duplicate
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                className="text-red-600 focus:text-red-600"
                                                onSelect={() => deleteCourseBuilderNode(node.id)}
                                              >
                                                Delete
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        )}
                                        <div onClick={e => e.stopPropagation()}>
                                          <DragHandle className="shrink-0" />
                                        </div>
                                      </div>
                                    </div>

                                    {expandedCourseBuilderNodes.has(node.id) && (
                                      <div
                                        ref={el => {
                                          nodeRefs.current[node.id] = el
                                        }}
                                        className="mt-1 flex flex-col gap-1.5 bg-white px-2 pb-2"
                                      >
                                        {/* Tasks - droppable so homework can be moved here */}
                                        <TreeItem
                                          depth={0}
                                          isLast={false}
                                          className="ml-0 border-l-0 pl-0"
                                        >
                                          <DroppableTaskZone
                                            nodeId={node.id}
                                            lessonId={primaryLesson.id}
                                            className="flex items-center justify-between gap-3 rounded-2xl border border-[#D5E5FF] bg-[#EEF4FF] px-3 py-1.5"
                                          >
                                            <div className="flex min-w-0 items-center gap-3">
                                              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#DCEAFF] text-[#2B5FB8]">
                                                <ClipboardList className="h-4 w-4" />
                                              </div>
                                              <div className="min-w-0">
                                                <div className="text-sm font-semibold text-[#2B5FB8]">
                                                  Tasks
                                                </div>
                                                <div className="text-[11px] text-[#667085]">
                                                  {taskCount > 0
                                                    ? `${taskCount} item${taskCount > 1 ? 's' : ''}`
                                                    : 'No items yet'}
                                                </div>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={mainTab !== 'builder' || !canEdit}
                                                className={cn(
                                                  'h-6 w-6 rounded-md bg-[#2B5FB8]/10 p-0 text-[#2B5FB8] hover:bg-[#2B5FB8]/20',
                                                  (mainTab !== 'builder' || !canEdit) &&
                                                    'cursor-not-allowed opacity-40'
                                                )}
                                                onClick={() => {
                                                  if (mainTab !== 'builder' || !canEdit) return
                                                  addTask(node.id, primaryLesson.id)
                                                }}
                                              >
                                                <Plus className="h-4 w-4" />
                                              </Button>
                                              <button
                                                type="button"
                                                className="flex h-6 w-6 items-center justify-center rounded-md text-[#2B5FB8] hover:bg-[#2B5FB8]/10"
                                                onClick={e => {
                                                  e.stopPropagation()
                                                  toggleSection(node.id, 'task')
                                                }}
                                              >
                                                {isSectionCollapsed(node.id, 'task') ? (
                                                  <ChevronRight className="h-4 w-4" />
                                                ) : (
                                                  <ChevronDown className="h-4 w-4" />
                                                )}
                                              </button>
                                            </div>
                                          </DroppableTaskZone>
                                        </TreeItem>
                                        {!isSectionCollapsed(node.id, 'task') && (
                                          <div
                                            ref={el => {
                                              sectionRefs.current[`${node.id}:task`] = el
                                            }}
                                            className="mt-1.5 space-y-1"
                                          >
                                            <SortableContext
                                              items={primaryLesson.tasks?.map(t => t.id) || []}
                                              strategy={verticalListSortingStrategy}
                                            >
                                              {(primaryLesson.tasks || []).map((task, idx) => (
                                                <div key={task.id} className="contents">
                                                  <SortableTreeItem
                                                    id={task.id}
                                                    depth={0}
                                                    dragHandle={false}
                                                    isLast={
                                                      idx === (primaryLesson.tasks?.length || 0) - 1
                                                    }
                                                  >
                                                    <div
                                                      data-curriculum-item={`task:${task.id}`}
                                                      className={cn(
                                                        'group/item relative mb-1.5 ml-0 mr-0 flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-xl border px-3 py-2 shadow-sm transition-colors',
                                                        selectedItem?.type === 'task' &&
                                                          selectedItem?.id === task.id
                                                          ? 'border-[#4A90FF] bg-[#F2F7FF] ring-1 ring-[#4A90FF]'
                                                          : 'border-[#E7ECF3] bg-white hover:bg-[#F8FAFC]',
                                                        mainTab === 'test-pci' &&
                                                          !(
                                                            testPciSource === 'task' &&
                                                            loadedTaskId === task.id
                                                          ) &&
                                                          'pointer-events-none opacity-40 grayscale'
                                                      )}
                                                      onClick={e => {
                                                        if (
                                                          (e.target as HTMLElement).closest('input')
                                                        )
                                                          return
                                                        // Auto-save current assessment if switching from one
                                                        if (loadedAssessmentId) {
                                                          setCourseBuilderNodes(prev =>
                                                            prev.map(node => ({
                                                              ...node,
                                                              lessons: node.lessons.map(lesson => ({
                                                                ...lesson,
                                                                homework: lesson.homework.map(hw =>
                                                                  hw.id === loadedAssessmentId
                                                                    ? {
                                                                        ...hw,
                                                                        title:
                                                                          assessmentBuilder.title,
                                                                        description:
                                                                          assessmentBuilder.taskContent,
                                                                        instructions:
                                                                          assessmentBuilder.taskPci,
                                                                        dmiItems:
                                                                          assessmentDmiItems,
                                                                        dmiVersions:
                                                                          assessmentDmiVersions,
                                                                        activeDmiVersionId:
                                                                          testPciSource ===
                                                                            'assessment' &&
                                                                          testPciViewMode.startsWith(
                                                                            'dmi_'
                                                                          )
                                                                            ? testPciViewMode.replace(
                                                                                'dmi_',
                                                                                ''
                                                                              )
                                                                            : hw.activeDmiVersionId,
                                                                        sourceDocument:
                                                                          assessmentBuilder.sourceDocument,
                                                                      }
                                                                    : hw
                                                                ),
                                                              })),
                                                            }))
                                                          )
                                                        }
                                                        // Auto-save current task if switching from another task
                                                        if (
                                                          loadedTaskId &&
                                                          loadedTaskId !== task.id
                                                        ) {
                                                          setCourseBuilderNodes(prev =>
                                                            prev.map(node => ({
                                                              ...node,
                                                              lessons: node.lessons.map(lesson => ({
                                                                ...lesson,
                                                                tasks: lesson.tasks.map(t =>
                                                                  t.id === loadedTaskId
                                                                    ? {
                                                                        ...t,
                                                                        title: taskBuilder.title,
                                                                        shortDescription:
                                                                          taskBuilder.details,
                                                                        description:
                                                                          taskBuilder.taskContent,
                                                                        instructions:
                                                                          taskBuilder.taskPci,
                                                                        extensions:
                                                                          taskBuilder.extensions,
                                                                        dmiItems: taskDmiItems,
                                                                        dmiVersions:
                                                                          taskDmiVersions,
                                                                        activeDmiVersionId:
                                                                          testPciSource ===
                                                                            'task' &&
                                                                          testPciViewMode.startsWith(
                                                                            'dmi_'
                                                                          )
                                                                            ? testPciViewMode.replace(
                                                                                'dmi_',
                                                                                ''
                                                                              )
                                                                            : t.activeDmiVersionId,
                                                                        sourceDocument:
                                                                          taskBuilder.sourceDocument,
                                                                      }
                                                                    : t
                                                                ),
                                                              })),
                                                            }))
                                                          )
                                                        }
                                                        setSelectedItem({
                                                          type: 'task',
                                                          id: task.id,
                                                        })
                                                        loadTaskIntoBuilder(task)
                                                        setMainBuilderTab('task')
                                                      }}
                                                    >
                                                      <div className="absolute bottom-0 left-0 top-0 w-1.5 bg-[#4A90FF]" />
                                                      <DragHandle className="shrink-0" />
                                                      <ListTodo className="h-3 w-3 shrink-0 text-[#2B5FB8]" />
                                                      {renamingItemId === task.id ? (
                                                        <Input
                                                          autoFocus
                                                          defaultValue={task.title}
                                                          className="h-6 flex-1 text-xs font-semibold text-[#1F2933]"
                                                          onClick={e => e.stopPropagation()}
                                                          onBlur={e => {
                                                            const newTitle = e.target.value.trim()
                                                            if (
                                                              newTitle &&
                                                              newTitle !== task.title
                                                            ) {
                                                              setCourseBuilderNodes(prev =>
                                                                prev.map(n => ({
                                                                  ...n,
                                                                  lessons: n.lessons.map(l => ({
                                                                    ...l,
                                                                    tasks: l.tasks.map(t =>
                                                                      t.id === task.id
                                                                        ? {
                                                                            ...t,
                                                                            title: newTitle,
                                                                          }
                                                                        : t
                                                                    ),
                                                                  })),
                                                                }))
                                                              )
                                                              if (loadedTaskId === task.id) {
                                                                setTaskBuilder(prev => ({
                                                                  ...prev,
                                                                  title: newTitle,
                                                                }))
                                                              }
                                                            }
                                                            setRenamingItemId(null)
                                                          }}
                                                          onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                              ;(e.target as HTMLInputElement).blur()
                                                            }
                                                          }}
                                                        />
                                                      ) : (
                                                        <div className="flex min-w-0 flex-1 flex-col">
                                                          <div className="flex items-center gap-2 truncate text-sm font-medium text-[#1F2933]">
                                                            {idx + 1}. {task.title}
                                                          </div>
                                                          {task.description && (
                                                            <div className="mt-0.5 truncate text-[11px] text-[#667085]">
                                                              {task.description.slice(0, 30)}...
                                                            </div>
                                                          )}
                                                        </div>
                                                      )}
                                                      {mainTab === 'test-pci' ? (
                                                        <Button
                                                          variant="ghost"
                                                          size="icon"
                                                          disabled
                                                          className={cn(
                                                            'h-7 w-7 cursor-not-allowed opacity-30',
                                                            directoryMenusAlwaysVisible
                                                              ? 'opacity-30'
                                                              : 'opacity-0 group-hover/item:opacity-30'
                                                          )}
                                                          onClick={e => e.stopPropagation()}
                                                        >
                                                          <MoreVertical className="h-5 w-5 text-[#98A2B3]" />
                                                        </Button>
                                                      ) : (
                                                        <DropdownMenu>
                                                          <DropdownMenuTrigger asChild>
                                                            <Button
                                                              variant="ghost"
                                                              size="icon"
                                                              className={cn(
                                                                'h-7 w-7 transition-opacity hover:bg-[#F2F4F7]',
                                                                directoryMenusAlwaysVisible
                                                                  ? 'opacity-80 hover:opacity-100'
                                                                  : 'opacity-0 group-hover/item:opacity-100'
                                                              )}
                                                              onClick={e => e.stopPropagation()}
                                                            >
                                                              <MoreVertical className="h-5 w-5 text-[#98A2B3]" />
                                                            </Button>
                                                          </DropdownMenuTrigger>
                                                          <DropdownMenuContent align="end">
                                                            {canEdit && (
                                                              <DropdownMenuItem
                                                                onClick={e => {
                                                                  e.stopPropagation()
                                                                  openMoveDialog(
                                                                    'task',
                                                                    task.id,
                                                                    task.title || 'Task',
                                                                    node.id
                                                                  )
                                                                }}
                                                              >
                                                                Move to lesson…
                                                              </DropdownMenuItem>
                                                            )}
                                                            {mainTab === 'live' &&
                                                              insightsProps?.onDeployTask && (
                                                                <DropdownMenuItem
                                                                  className="font-medium text-emerald-600 focus:text-emerald-600"
                                                                  onClick={e => {
                                                                    e.stopPropagation()
                                                                    const dmiVersion =
                                                                      (task.dmiVersions || []).find(
                                                                        v =>
                                                                          v.id ===
                                                                          task.activeDmiVersionId
                                                                      ) ||
                                                                      (task.dmiVersions || [])[0]
                                                                    deployTaskWithDialog({
                                                                      id: task.id,
                                                                      title: task.title,
                                                                      content:
                                                                        task.description ||
                                                                        task.title,
                                                                      source: 'task',
                                                                      dmiItems:
                                                                        dmiVersion?.items ||
                                                                        task.dmiItems ||
                                                                        [],
                                                                      sourceDocument:
                                                                        task.sourceDocument,
                                                                      deployedAt: Date.now(),
                                                                      polls: [],
                                                                      questions: [],
                                                                    })
                                                                  }}
                                                                >
                                                                  <Send className="mr-2 h-4 w-4" />
                                                                  Deploy
                                                                </DropdownMenuItem>
                                                              )}

                                                            {mainTab === 'live' && (
                                                              <DropdownMenuItem
                                                                onClick={e => {
                                                                  e.stopPropagation()
                                                                  moveToHomework(
                                                                    node.id,
                                                                    primaryLesson.id,
                                                                    'task',
                                                                    task
                                                                  )
                                                                }}
                                                              >
                                                                Move to homework
                                                              </DropdownMenuItem>
                                                            )}

                                                            {mainTab === 'builder' && canEdit && (
                                                              <>
                                                                <DropdownMenuItem
                                                                  onClick={e => {
                                                                    e.stopPropagation()
                                                                    setSelectedItem({
                                                                      type: 'task',
                                                                      id: task.id,
                                                                    })
                                                                    loadTaskIntoBuilder(task)
                                                                    setMainBuilderTab('task')
                                                                    setAssetPickerTarget('task')
                                                                    setAssetsViewOpen(true)
                                                                    setLoadAsStep('task-options')
                                                                  }}
                                                                >
                                                                  Load
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                  onClick={e => {
                                                                    e.stopPropagation()
                                                                    setRenamingItemId(task.id)
                                                                  }}
                                                                >
                                                                  Rename
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                  onClick={e => {
                                                                    e.stopPropagation()
                                                                    // Auto-save current task if switching from another task
                                                                    if (
                                                                      loadedTaskId &&
                                                                      loadedTaskId !== task.id
                                                                    ) {
                                                                      setCourseBuilderNodes(prev =>
                                                                        prev.map(node => ({
                                                                          ...node,
                                                                          lessons: node.lessons.map(
                                                                            lesson => ({
                                                                              ...lesson,
                                                                              tasks:
                                                                                lesson.tasks.map(
                                                                                  t =>
                                                                                    t.id ===
                                                                                    loadedTaskId
                                                                                      ? {
                                                                                          ...t,
                                                                                          title:
                                                                                            taskBuilder.title,
                                                                                          shortDescription:
                                                                                            taskBuilder.details,
                                                                                          description:
                                                                                            taskBuilder.taskContent,
                                                                                          instructions:
                                                                                            taskBuilder.taskPci,
                                                                                          extensions:
                                                                                            taskBuilder.extensions,
                                                                                          dmiItems:
                                                                                            taskDmiItems,
                                                                                          dmiVersions:
                                                                                            taskDmiVersions,
                                                                                          activeDmiVersionId:
                                                                                            testPciSource ===
                                                                                              'task' &&
                                                                                            testPciViewMode.startsWith(
                                                                                              'dmi_'
                                                                                            )
                                                                                              ? testPciViewMode.replace(
                                                                                                  'dmi_',
                                                                                                  ''
                                                                                                )
                                                                                              : t.activeDmiVersionId,
                                                                                          sourceDocument:
                                                                                            taskBuilder.sourceDocument,
                                                                                        }
                                                                                      : t
                                                                                ),
                                                                            })
                                                                          ),
                                                                        }))
                                                                      )
                                                                    }
                                                                    // Auto-save current assessment if any is loaded
                                                                    if (loadedAssessmentId) {
                                                                      setCourseBuilderNodes(prev =>
                                                                        prev.map(mod => ({
                                                                          ...mod,
                                                                          lessons: mod.lessons.map(
                                                                            lesson => ({
                                                                              ...lesson,
                                                                              homework:
                                                                                lesson.homework.map(
                                                                                  h =>
                                                                                    h.id ===
                                                                                    loadedAssessmentId
                                                                                      ? {
                                                                                          ...h,
                                                                                          title:
                                                                                            assessmentBuilder.title,
                                                                                          description:
                                                                                            assessmentBuilder.taskContent,
                                                                                          instructions:
                                                                                            assessmentBuilder.taskPci,
                                                                                          dmiItems:
                                                                                            assessmentDmiItems,
                                                                                          dmiVersions:
                                                                                            assessmentDmiVersions,
                                                                                          activeDmiVersionId:
                                                                                            testPciSource ===
                                                                                              'assessment' &&
                                                                                            testPciViewMode.startsWith(
                                                                                              'dmi_'
                                                                                            )
                                                                                              ? testPciViewMode.replace(
                                                                                                  'dmi_',
                                                                                                  ''
                                                                                                )
                                                                                              : h.activeDmiVersionId,
                                                                                          sourceDocument:
                                                                                            assessmentBuilder.sourceDocument,
                                                                                        }
                                                                                      : h
                                                                                ),
                                                                            })
                                                                          ),
                                                                        }))
                                                                      )
                                                                    }
                                                                    // Load the target task if not already loaded
                                                                    if (loadedTaskId !== task.id) {
                                                                      setSelectedItem({
                                                                        type: 'task',
                                                                        id: task.id,
                                                                      })
                                                                      loadTaskIntoBuilder(task)
                                                                    }
                                                                    setMainBuilderTab('task')
                                                                    const currentExtensions =
                                                                      loadedTaskId === task.id
                                                                        ? taskBuilder.extensions
                                                                        : task.extensions || []
                                                                    const extNumber =
                                                                      currentExtensions.length + 1
                                                                    const newExtension = {
                                                                      id: `ext-${Date.now()}`,
                                                                      name: `Extension ${extNumber}`,
                                                                      description: '',
                                                                      content: '',
                                                                      pci: '',
                                                                    }
                                                                    // PCI threads for a
                                                                    // new extension default
                                                                    // to empty in the reducer.
                                                                    setTaskBuilder(prev => ({
                                                                      ...prev,
                                                                      extensions: [
                                                                        ...prev.extensions,
                                                                        newExtension,
                                                                      ],
                                                                      activeExtensionId:
                                                                        newExtension.id,
                                                                    }))
                                                                    setCourseBuilderNodes(prev =>
                                                                      prev.map(mod => ({
                                                                        ...mod,
                                                                        lessons: mod.lessons.map(
                                                                          lesson => ({
                                                                            ...lesson,
                                                                            tasks: lesson.tasks.map(
                                                                              t =>
                                                                                t.id === task.id
                                                                                  ? {
                                                                                      ...t,
                                                                                      extensions: [
                                                                                        ...(t.extensions ||
                                                                                          []),
                                                                                        newExtension,
                                                                                      ],
                                                                                    }
                                                                                  : t
                                                                            ),
                                                                          })
                                                                        ),
                                                                      }))
                                                                    )
                                                                    toast.success(
                                                                      `Extension ${newExtension.name} added`
                                                                    )
                                                                  }}
                                                                >
                                                                  Add Extension
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                  onClick={e => {
                                                                    e.stopPropagation()
                                                                    duplicateTask(
                                                                      node.id,
                                                                      primaryLesson.id,
                                                                      task
                                                                    )
                                                                  }}
                                                                >
                                                                  Duplicate
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                  className="text-red-500"
                                                                  onClick={e => {
                                                                    e.stopPropagation()
                                                                    if (
                                                                      !confirm(
                                                                        `Delete "${task.title}"?`
                                                                      )
                                                                    )
                                                                      return
                                                                    deleteTask(
                                                                      node.id,
                                                                      primaryLesson.id,
                                                                      task.id
                                                                    )
                                                                  }}
                                                                >
                                                                  Delete
                                                                </DropdownMenuItem>
                                                              </>
                                                            )}
                                                          </DropdownMenuContent>
                                                        </DropdownMenu>
                                                      )}
                                                    </div>
                                                    {task.sourceDocument?.fileName && (
                                                      <div className="mb-1.5 ml-6 flex min-w-0 items-center gap-1.5 rounded-lg border border-[#E7ECF3] bg-white px-2.5 py-1 text-[11px] text-slate-600">
                                                        <FileText className="h-3 w-3 shrink-0 text-red-600" />
                                                        <span className="truncate">
                                                          {task.sourceDocument.fileName}
                                                        </span>
                                                      </div>
                                                    )}
                                                  </SortableTreeItem>
                                                  {loadedTaskId === task.id &&
                                                    taskBuilder.extensions.length > 0 && (
                                                      <div className="mb-px ml-0 mt-px space-y-px">
                                                        <div
                                                          className="flex cursor-pointer items-center justify-between rounded-none border-0 bg-gray-100/50 px-3 py-2 text-xs font-medium text-gray-500 shadow-inner transition-colors hover:bg-gray-100"
                                                          onClick={() => toggleExtensions(task.id)}
                                                        >
                                                          <div className="flex items-center gap-2">
                                                            {isExtensionsCollapsed(task.id) ? (
                                                              <ChevronRight className="h-3 w-3" />
                                                            ) : (
                                                              <ChevronDown className="h-3 w-3" />
                                                            )}
                                                            <span>
                                                              Extensions (
                                                              {taskBuilder.extensions.length})
                                                            </span>
                                                          </div>
                                                        </div>
                                                        {!isExtensionsCollapsed(task.id) && (
                                                          <div
                                                            ref={el => {
                                                              extensionRefs.current[task.id] = el
                                                            }}
                                                            className="ml-0 space-y-px"
                                                          >
                                                            {taskBuilder.extensions.map(
                                                              (ext, extIdx) => (
                                                                <div
                                                                  key={ext.id}
                                                                  className={cn(
                                                                    'group/extension mb-1 ml-0 flex cursor-pointer items-center gap-2 rounded-none border px-3 py-2 text-sm shadow-sm transition-colors',
                                                                    taskBuilder.activeExtensionId ===
                                                                      ext.id
                                                                      ? 'border-orange-200 bg-orange-50 ring-1 ring-orange-300'
                                                                      : 'border-orange-200/50 bg-orange-50/30 hover:bg-orange-50'
                                                                  )}
                                                                  onClick={() => {
                                                                    setSelectedItem({
                                                                      type: 'task',
                                                                      id: task.id,
                                                                    })
                                                                    loadTaskIntoBuilder(
                                                                      task,
                                                                      ext.id
                                                                    )
                                                                    setMainBuilderTab('task')
                                                                  }}
                                                                >
                                                                  <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                                                                  <span className="font-semibold text-orange-600">
                                                                    {idx + 1}.{extIdx + 1}
                                                                  </span>
                                                                  <span className="text-muted-foreground flex-1 truncate">
                                                                    {ext.name}
                                                                  </span>
                                                                  {canEdit && (
                                                                    <DropdownMenu>
                                                                      <DropdownMenuTrigger asChild>
                                                                        <Button
                                                                          variant="ghost"
                                                                          size="icon"
                                                                          className={cn(
                                                                            'h-7 w-7',
                                                                            directoryMenusAlwaysVisible
                                                                              ? 'opacity-80 hover:opacity-100'
                                                                              : 'opacity-0 group-hover/extension:opacity-100'
                                                                          )}
                                                                          onClick={(e: any) =>
                                                                            e.stopPropagation()
                                                                          }
                                                                        >
                                                                          <MoreVertical className="h-5 w-5 text-slate-700" />
                                                                        </Button>
                                                                      </DropdownMenuTrigger>
                                                                      <DropdownMenuContent align="end">
                                                                        {insightsProps?.onDeployTask && (
                                                                          <DropdownMenuItem
                                                                            className="font-medium text-emerald-600 focus:text-emerald-600"
                                                                            onClick={e => {
                                                                              e.stopPropagation()
                                                                              deployTaskWithDialog({
                                                                                id: ext.id,
                                                                                title: ext.name,
                                                                                content:
                                                                                  ext.description ||
                                                                                  ext.name,
                                                                                source: 'task',
                                                                                parentId: task.id,
                                                                                isExtension: true,
                                                                                // Carry the extension's OWN document so the
                                                                                // live session shows its content, not the
                                                                                // parent task's.
                                                                                sourceDocument:
                                                                                  ext.sourceDocument,
                                                                                deployedAt:
                                                                                  Date.now(),
                                                                                polls: [],
                                                                                questions: [],
                                                                              })
                                                                            }}
                                                                          >
                                                                            <Send className="mr-2 h-4 w-4" />
                                                                            Deploy
                                                                          </DropdownMenuItem>
                                                                        )}
                                                                        <DropdownMenuItem
                                                                          className="text-red-500"
                                                                          onClick={(e: any) => {
                                                                            e.stopPropagation()
                                                                            if (
                                                                              !confirm(
                                                                                `Delete "${ext.name}"?`
                                                                              )
                                                                            )
                                                                              return
                                                                            // The deleted
                                                                            // extension's PCI
                                                                            // thread becomes
                                                                            // unreachable; no
                                                                            // explicit prune
                                                                            // needed.
                                                                            setTaskBuilder(
                                                                              prev => ({
                                                                                ...prev,
                                                                                extensions:
                                                                                  prev.extensions.filter(
                                                                                    e =>
                                                                                      e.id !==
                                                                                      ext.id
                                                                                  ),
                                                                                activeExtensionId:
                                                                                  prev.activeExtensionId ===
                                                                                  ext.id
                                                                                    ? null
                                                                                    : prev.activeExtensionId,
                                                                              })
                                                                            )
                                                                            if (loadedTaskId) {
                                                                              setCourseBuilderNodes(
                                                                                prev =>
                                                                                  prev.map(mod => ({
                                                                                    ...mod,
                                                                                    lessons:
                                                                                      mod.lessons.map(
                                                                                        lesson => ({
                                                                                          ...lesson,
                                                                                          tasks:
                                                                                            lesson.tasks.map(
                                                                                              t =>
                                                                                                t.id ===
                                                                                                loadedTaskId
                                                                                                  ? {
                                                                                                      ...t,
                                                                                                      extensions:
                                                                                                        (
                                                                                                          t.extensions ||
                                                                                                          []
                                                                                                        ).filter(
                                                                                                          e =>
                                                                                                            e.id !==
                                                                                                            ext.id
                                                                                                        ),
                                                                                                    }
                                                                                                  : t
                                                                                            ),
                                                                                        })
                                                                                      ),
                                                                                  }))
                                                                              )
                                                                            }
                                                                          }}
                                                                        >
                                                                          <Trash2 className="mr-2 h-4 w-4" />
                                                                          Delete
                                                                        </DropdownMenuItem>
                                                                      </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                  )}
                                                                </div>
                                                              )
                                                            )}
                                                          </div>
                                                        )}
                                                      </div>
                                                    )}
                                                </div>
                                              ))}
                                            </SortableContext>
                                          </div>
                                        )}

                                        {/* Assessments - droppable so homework can be moved here */}
                                        <TreeItem
                                          depth={0}
                                          isLast={false}
                                          className="ml-0 border-l-0 pl-0"
                                        >
                                          <DroppableAssessmentZone
                                            nodeId={node.id}
                                            lessonId={primaryLesson.id}
                                            className="flex items-center justify-between gap-3 rounded-2xl border border-[#E2D8FF] bg-[#F3EEFF] px-3 py-1.5"
                                          >
                                            <div className="flex min-w-0 items-center gap-3">
                                              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E7DEFF] text-[#6D59D8]">
                                                <FileText className="h-4 w-4" />
                                              </div>
                                              <div className="min-w-0">
                                                <div className="text-sm font-semibold text-[#6D59D8]">
                                                  Assessments
                                                </div>
                                                <div className="text-[11px] text-[#667085]">
                                                  {assessments.length > 0
                                                    ? `${assessments.length} item${assessments.length > 1 ? 's' : ''}`
                                                    : 'No items yet'}
                                                </div>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={mainTab !== 'builder' || !canEdit}
                                                className={cn(
                                                  'h-6 w-6 rounded-md bg-[#6D59D8]/10 p-0 text-[#6D59D8] hover:bg-[#6D59D8]/20',
                                                  (mainTab !== 'builder' || !canEdit) &&
                                                    'cursor-not-allowed opacity-40'
                                                )}
                                                onClick={() => {
                                                  if (mainTab !== 'builder' || !canEdit) return
                                                  addAssessment(node.id, primaryLesson.id)
                                                }}
                                              >
                                                <Plus className="h-4 w-4" />
                                              </Button>
                                              <button
                                                type="button"
                                                className="flex h-6 w-6 items-center justify-center rounded-md text-[#6D59D8] hover:bg-[#6D59D8]/10"
                                                onClick={e => {
                                                  e.stopPropagation()
                                                  toggleSection(node.id, 'assessment')
                                                }}
                                              >
                                                {isSectionCollapsed(node.id, 'assessment') ? (
                                                  <ChevronRight className="h-4 w-4" />
                                                ) : (
                                                  <ChevronDown className="h-4 w-4" />
                                                )}
                                              </button>
                                            </div>
                                          </DroppableAssessmentZone>
                                        </TreeItem>
                                        {!isSectionCollapsed(node.id, 'assessment') && (
                                          <div
                                            ref={el => {
                                              sectionRefs.current[`${node.id}:assessment`] = el
                                            }}
                                            className="mt-1.5 space-y-1"
                                          >
                                            <SortableContext
                                              items={assessments.map(h => h.id)}
                                              strategy={verticalListSortingStrategy}
                                            >
                                              {assessments.map((hw, idx) => (
                                                <SortableTreeItem
                                                  key={hw.id}
                                                  id={hw.id}
                                                  depth={0}
                                                  dragHandle={false}
                                                  isLast={idx === assessments.length - 1}
                                                >
                                                  <div
                                                    data-curriculum-item={`homework:${hw.id}`}
                                                    className={cn(
                                                      'group/item relative mb-1.5 ml-0 mr-0 flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-xl border px-3 py-2 shadow-sm transition-colors',
                                                      selectedItem?.type === 'homework' &&
                                                        selectedItem?.id === hw.id
                                                        ? 'border-[#8B6DFF] bg-[#F3EEFF] ring-1 ring-[#8B6DFF]'
                                                        : 'border-[#E7ECF3] bg-white hover:bg-[#F8FAFC]',
                                                      mainTab === 'test-pci' &&
                                                        !(
                                                          testPciSource === 'assessment' &&
                                                          selectedItem?.id === hw.id
                                                        ) &&
                                                        'pointer-events-none opacity-40 grayscale'
                                                    )}
                                                    onClick={e => {
                                                      if (
                                                        (e.target as HTMLElement).closest('input')
                                                      )
                                                        return
                                                      // Auto-save current task if switching from one
                                                      if (loadedTaskId) {
                                                        setCourseBuilderNodes(prev =>
                                                          prev.map(mod => ({
                                                            ...mod,
                                                            lessons: mod.lessons.map(lesson => ({
                                                              ...lesson,
                                                              tasks: lesson.tasks.map(t =>
                                                                t.id === loadedTaskId
                                                                  ? {
                                                                      ...t,
                                                                      title: taskBuilder.title,
                                                                      shortDescription:
                                                                        taskBuilder.details,
                                                                      description:
                                                                        taskBuilder.taskContent,
                                                                      instructions:
                                                                        taskBuilder.taskPci,
                                                                      extensions:
                                                                        taskBuilder.extensions,
                                                                      dmiItems: taskDmiItems,
                                                                      dmiVersions: taskDmiVersions,
                                                                      activeDmiVersionId:
                                                                        testPciSource === 'task' &&
                                                                        testPciViewMode.startsWith(
                                                                          'dmi_'
                                                                        )
                                                                          ? testPciViewMode.replace(
                                                                              'dmi_',
                                                                              ''
                                                                            )
                                                                          : t.activeDmiVersionId,
                                                                      sourceDocument:
                                                                        taskBuilder.sourceDocument,
                                                                    }
                                                                  : t
                                                              ),
                                                            })),
                                                          }))
                                                        )
                                                      }
                                                      // Auto-save current assessment if switching from another assessment
                                                      if (
                                                        loadedAssessmentId &&
                                                        loadedAssessmentId !== hw.id
                                                      ) {
                                                        setCourseBuilderNodes(prev =>
                                                          prev.map(mod => ({
                                                            ...mod,
                                                            lessons: mod.lessons.map(lesson => ({
                                                              ...lesson,
                                                              homework: lesson.homework.map(h =>
                                                                h.id === loadedAssessmentId
                                                                  ? {
                                                                      ...h,
                                                                      title:
                                                                        assessmentBuilder.title,
                                                                      description:
                                                                        assessmentBuilder.taskContent,
                                                                      instructions:
                                                                        assessmentBuilder.taskPci,
                                                                      dmiItems: assessmentDmiItems,
                                                                      dmiVersions:
                                                                        assessmentDmiVersions,
                                                                      activeDmiVersionId:
                                                                        testPciSource ===
                                                                          'assessment' &&
                                                                        testPciViewMode.startsWith(
                                                                          'dmi_'
                                                                        )
                                                                          ? testPciViewMode.replace(
                                                                              'dmi_',
                                                                              ''
                                                                            )
                                                                          : h.activeDmiVersionId,
                                                                      sourceDocument:
                                                                        assessmentBuilder.sourceDocument,
                                                                    }
                                                                  : h
                                                              ),
                                                            })),
                                                          }))
                                                        )
                                                      }
                                                      setSelectedItem({
                                                        type: 'homework',
                                                        id: hw.id,
                                                      })
                                                      loadAssessmentIntoBuilder(hw)
                                                      setMainBuilderTab('assessment')
                                                    }}
                                                  >
                                                    <div className="absolute bottom-0 left-0 top-0 w-1.5 bg-[#8B6DFF]" />
                                                    <DragHandle className="shrink-0" />
                                                    <FileQuestion className="h-3 w-3 shrink-0 text-[#6D59D8]" />
                                                    {renamingItemId === hw.id ? (
                                                      <Input
                                                        autoFocus
                                                        defaultValue={hw.title}
                                                        className="h-6 flex-1 text-xs font-semibold text-indigo-700"
                                                        onClick={e => e.stopPropagation()}
                                                        onBlur={e => {
                                                          const newTitle = e.target.value.trim()
                                                          if (newTitle && newTitle !== hw.title) {
                                                            setCourseBuilderNodes(prev =>
                                                              prev.map(n => ({
                                                                ...n,
                                                                lessons: n.lessons.map(l => ({
                                                                  ...l,
                                                                  homework: l.homework.map(h =>
                                                                    h.id === hw.id
                                                                      ? { ...h, title: newTitle }
                                                                      : h
                                                                  ),
                                                                })),
                                                              }))
                                                            )
                                                            if (loadedAssessmentId === hw.id) {
                                                              setAssessmentBuilder(prev => ({
                                                                ...prev,
                                                                title: newTitle,
                                                              }))
                                                            }
                                                          }
                                                          setRenamingItemId(null)
                                                        }}
                                                        onKeyDown={e => {
                                                          if (e.key === 'Enter') {
                                                            ;(e.target as HTMLInputElement).blur()
                                                          }
                                                        }}
                                                      />
                                                    ) : (
                                                      <div className="flex min-w-0 flex-1 flex-col">
                                                        <div className="flex items-center gap-2 truncate text-sm font-medium text-[#1F2933]">
                                                          {idx + 1}. {hw.title}
                                                        </div>
                                                        {hw.description && (
                                                          <div className="mt-0.5 truncate text-[11px] text-[#667085]">
                                                            {hw.description.slice(0, 30)}...
                                                          </div>
                                                        )}
                                                      </div>
                                                    )}

                                                    {mainTab === 'test-pci' ? (
                                                      <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        disabled
                                                        className={cn(
                                                          'h-7 w-7 cursor-not-allowed opacity-30',
                                                          directoryMenusAlwaysVisible
                                                            ? 'opacity-30'
                                                            : 'opacity-0 group-hover/item:opacity-30'
                                                        )}
                                                        onClick={e => e.stopPropagation()}
                                                      >
                                                        <MoreVertical className="h-5 w-5 text-[#98A2B3]" />
                                                      </Button>
                                                    ) : (
                                                      <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                          <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className={cn(
                                                              'h-7 w-7 transition-opacity hover:bg-[#F2F4F7]',
                                                              directoryMenusAlwaysVisible
                                                                ? 'opacity-80 hover:opacity-100'
                                                                : 'opacity-0 group-hover/item:opacity-100'
                                                            )}
                                                            onClick={e => e.stopPropagation()}
                                                          >
                                                            <MoreVertical className="h-5 w-5 text-[#98A2B3]" />
                                                          </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                          {canEdit && (
                                                            <DropdownMenuItem
                                                              onClick={e => {
                                                                e.stopPropagation()
                                                                openMoveDialog(
                                                                  'assessment',
                                                                  hw.id,
                                                                  hw.title || 'Assessment',
                                                                  node.id
                                                                )
                                                              }}
                                                            >
                                                              Move to lesson…
                                                            </DropdownMenuItem>
                                                          )}
                                                          {mainTab === 'live' &&
                                                            insightsProps?.onDeployTask && (
                                                              <DropdownMenuItem
                                                                className="font-medium text-emerald-600 focus:text-emerald-600"
                                                                onClick={e => {
                                                                  e.stopPropagation()
                                                                  const dmiVersion =
                                                                    (hw.dmiVersions || []).find(
                                                                      v =>
                                                                        v.id ===
                                                                        hw.activeDmiVersionId
                                                                    ) || (hw.dmiVersions || [])[0]
                                                                  deployTaskWithDialog({
                                                                    id: hw.id,
                                                                    title: hw.title,
                                                                    content:
                                                                      hw.description || hw.title,
                                                                    source: 'assessment',
                                                                    dmiItems:
                                                                      dmiVersion?.items ||
                                                                      hw.dmiItems ||
                                                                      [],
                                                                    sourceDocument:
                                                                      hw.sourceDocument,
                                                                    deployedAt: Date.now(),
                                                                    polls: [],
                                                                    questions: [],
                                                                  })
                                                                }}
                                                              >
                                                                <Send className="mr-2 h-4 w-4" />
                                                                Deploy
                                                              </DropdownMenuItem>
                                                            )}

                                                          {mainTab === 'live' && (
                                                            <DropdownMenuItem
                                                              onClick={e => {
                                                                e.stopPropagation()
                                                                moveToHomework(
                                                                  node.id,
                                                                  primaryLesson.id,
                                                                  'assessment',
                                                                  hw
                                                                )
                                                              }}
                                                            >
                                                              Move to homework
                                                            </DropdownMenuItem>
                                                          )}

                                                          {mainTab === 'builder' && canEdit && (
                                                            <>
                                                              <DropdownMenuItem
                                                                onClick={e => {
                                                                  e.stopPropagation()
                                                                  setSelectedItem({
                                                                    type: 'assessment',
                                                                    id: hw.id,
                                                                  })
                                                                  loadAssessmentIntoBuilder(hw)
                                                                  setMainBuilderTab('assessment')
                                                                  setAssetPickerTarget('assessment')
                                                                  setAssetsViewOpen(true)
                                                                  setLoadAsStep(
                                                                    'assessment-options'
                                                                  )
                                                                }}
                                                              >
                                                                Load
                                                              </DropdownMenuItem>
                                                              <DropdownMenuItem
                                                                onClick={e => {
                                                                  e.stopPropagation()
                                                                  setRenamingItemId(hw.id)
                                                                }}
                                                              >
                                                                Rename
                                                              </DropdownMenuItem>
                                                              <DropdownMenuItem
                                                                onClick={e => {
                                                                  e.stopPropagation()
                                                                  duplicateAssessment(
                                                                    node.id,
                                                                    primaryLesson.id,
                                                                    hw
                                                                  )
                                                                }}
                                                              >
                                                                Duplicate
                                                              </DropdownMenuItem>
                                                              <DropdownMenuItem
                                                                className="text-red-500"
                                                                onClick={e => {
                                                                  e.stopPropagation()
                                                                  if (
                                                                    !confirm(
                                                                      `Delete "${hw.title}"?`
                                                                    )
                                                                  )
                                                                    return
                                                                  deleteAssessment(
                                                                    node.id,
                                                                    primaryLesson.id,
                                                                    hw.id
                                                                  )
                                                                }}
                                                              >
                                                                Delete
                                                              </DropdownMenuItem>
                                                            </>
                                                          )}
                                                        </DropdownMenuContent>
                                                      </DropdownMenu>
                                                    )}
                                                  </div>
                                                  {hw.sourceDocument?.fileName && (
                                                    <div className="mb-1.5 ml-6 flex min-w-0 items-center gap-1.5 rounded-lg border border-[#E7ECF3] bg-white px-2.5 py-1 text-[11px] text-slate-600">
                                                      <FileText className="h-3 w-3 shrink-0 text-red-600" />
                                                      <span className="truncate">
                                                        {hw.sourceDocument.fileName}
                                                      </span>
                                                    </div>
                                                  )}
                                                </SortableTreeItem>
                                              ))}
                                            </SortableContext>
                                          </div>
                                        )}

                                        {/* Homework (per-lesson) - drop zone; header + description in one box; sortable items with drag handle */}
                                        {(() => {
                                          const hwItems = (primaryLesson.homework || []).filter(
                                            h => h.category === 'homework'
                                          )
                                          return (
                                            <>
                                              <TreeItem
                                                depth={0}
                                                isLast={false}
                                                className="ml-0 border-l-0 pl-0"
                                              >
                                                <DroppableHomeworkZone
                                                  nodeId={node.id}
                                                  lessonId={primaryLesson.id}
                                                  className="flex items-center justify-between gap-3 rounded-2xl border border-[#D2F3E3] bg-[#ECFBF4] px-3 py-1.5"
                                                >
                                                  <div className="flex min-w-0 items-center gap-3">
                                                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#D7F6E8] text-[#1E9E72]">
                                                      <FolderOpen className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                      <div className="text-sm font-semibold text-[#1E9E72]">
                                                        Homework
                                                      </div>
                                                      <div className="text-[11px] text-[#667085]">
                                                        {hwItems.length > 0
                                                          ? `${hwItems.length} item${hwItems.length > 1 ? 's' : ''}`
                                                          : 'No items yet'}
                                                      </div>
                                                    </div>
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                    <button
                                                      type="button"
                                                      className="flex h-6 w-6 items-center justify-center rounded-md text-[#1E9E72] hover:bg-[#1E9E72]/10"
                                                      onClick={e => {
                                                        e.stopPropagation()
                                                        toggleSection(node.id, 'homework')
                                                      }}
                                                    >
                                                      {isSectionCollapsed(node.id, 'homework') ? (
                                                        <ChevronRight className="h-4 w-4" />
                                                      ) : (
                                                        <ChevronDown className="h-4 w-4" />
                                                      )}
                                                    </button>
                                                  </div>
                                                </DroppableHomeworkZone>
                                              </TreeItem>
                                              {!isSectionCollapsed(node.id, 'homework') && (
                                                <div
                                                  ref={el => {
                                                    sectionRefs.current[`${node.id}:homework`] = el
                                                  }}
                                                  className="mt-1.5 space-y-1"
                                                >
                                                  <SortableContext
                                                    items={hwItems.map(h => h.id)}
                                                    strategy={verticalListSortingStrategy}
                                                  >
                                                    {hwItems.map((hw, hwIdx) => (
                                                      <SortableTreeItem
                                                        key={hw.id}
                                                        id={hw.id}
                                                        depth={0}
                                                        dragHandle={false}
                                                        isLast={hwIdx === hwItems.length - 1}
                                                      >
                                                        <div
                                                          className={cn(
                                                            'group/item relative mb-1.5 ml-0 mr-0 flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-xl border px-3 py-2 shadow-sm transition-colors',
                                                            selectedItem?.type === 'homework' &&
                                                              selectedItem?.id === hw.id
                                                              ? 'border-[#2FC98F] bg-[#ECFBF4] ring-1 ring-[#2FC98F]'
                                                              : 'border-[#E7ECF3] bg-white hover:bg-[#F8FAFC]',
                                                            mainTab === 'test-pci' &&
                                                              !(
                                                                testPciSource === 'assessment' &&
                                                                selectedItem?.id === hw.id
                                                              ) &&
                                                              'pointer-events-none opacity-40 grayscale'
                                                          )}
                                                          onClick={() => {
                                                            setSelectedItem({
                                                              type: 'homework',
                                                              id: hw.id,
                                                            })
                                                            loadAssessmentIntoBuilder(hw)
                                                            setMainBuilderTab('assessment')
                                                          }}
                                                        >
                                                          <div className="absolute bottom-0 left-0 top-0 w-1.5 bg-[#2FC98F]" />
                                                          <DragHandle className="shrink-0" />
                                                          <FolderOpen className="h-3 w-3 shrink-0 text-[#1E9E72]" />
                                                          {renamingItemId === hw.id ? (
                                                            <Input
                                                              autoFocus
                                                              defaultValue={hw.title}
                                                              className="h-6 flex-1 text-xs font-semibold text-emerald-700"
                                                              onClick={e => e.stopPropagation()}
                                                              onBlur={e => {
                                                                const newTitle =
                                                                  e.target.value.trim()
                                                                if (
                                                                  newTitle &&
                                                                  newTitle !== hw.title
                                                                ) {
                                                                  setCourseBuilderNodes(prev =>
                                                                    prev.map(n => ({
                                                                      ...n,
                                                                      lessons: n.lessons.map(l => ({
                                                                        ...l,
                                                                        homework: l.homework.map(
                                                                          h =>
                                                                            h.id === hw.id
                                                                              ? {
                                                                                  ...h,
                                                                                  title: newTitle,
                                                                                }
                                                                              : h
                                                                        ),
                                                                      })),
                                                                    }))
                                                                  )
                                                                  if (
                                                                    loadedAssessmentId === hw.id
                                                                  ) {
                                                                    setAssessmentBuilder(prev => ({
                                                                      ...prev,
                                                                      title: newTitle,
                                                                    }))
                                                                  }
                                                                }
                                                                setRenamingItemId(null)
                                                              }}
                                                              onKeyDown={e => {
                                                                if (e.key === 'Enter') {
                                                                  ;(
                                                                    e.target as HTMLInputElement
                                                                  ).blur()
                                                                }
                                                              }}
                                                            />
                                                          ) : (
                                                            <div className="flex min-w-0 flex-1 flex-col">
                                                              <div className="flex items-center gap-2 truncate text-sm font-medium text-[#1F2933]">
                                                                {hwIdx + 1}. {hw.title}
                                                              </div>
                                                              {hw.description && (
                                                                <div className="mt-0.5 truncate text-[11px] text-[#667085]">
                                                                  {hw.description.slice(0, 30)}...
                                                                </div>
                                                              )}
                                                            </div>
                                                          )}
                                                          {mainTab === 'test-pci' ? (
                                                            <Button
                                                              variant="ghost"
                                                              size="icon"
                                                              disabled
                                                              className={cn(
                                                                'h-7 w-7 cursor-not-allowed opacity-30',
                                                                directoryMenusAlwaysVisible
                                                                  ? 'opacity-30'
                                                                  : 'opacity-0 group-hover/item:opacity-30'
                                                              )}
                                                              onClick={e => e.stopPropagation()}
                                                            >
                                                              <MoreVertical className="h-5 w-5 text-[#98A2B3]" />
                                                            </Button>
                                                          ) : (
                                                            <DropdownMenu>
                                                              <DropdownMenuTrigger asChild>
                                                                <Button
                                                                  variant="ghost"
                                                                  size="icon"
                                                                  className={cn(
                                                                    'h-7 w-7 transition-opacity hover:bg-[#F2F4F7]',
                                                                    directoryMenusAlwaysVisible
                                                                      ? 'opacity-80 hover:opacity-100'
                                                                      : 'opacity-0 group-hover/item:opacity-100'
                                                                  )}
                                                                  onClick={e => e.stopPropagation()}
                                                                >
                                                                  <MoreVertical className="h-5 w-5 text-[#98A2B3]" />
                                                                </Button>
                                                              </DropdownMenuTrigger>
                                                              <DropdownMenuContent align="end">
                                                                {mainTab === 'live' &&
                                                                  insightsProps?.onDeployTask && (
                                                                    <DropdownMenuItem
                                                                      className="font-medium text-emerald-600 focus:text-emerald-600"
                                                                      onClick={e => {
                                                                        e.stopPropagation()
                                                                        const dmiVersion =
                                                                          (
                                                                            hw.dmiVersions || []
                                                                          ).find(
                                                                            v =>
                                                                              v.id ===
                                                                              hw.activeDmiVersionId
                                                                          ) ||
                                                                          (hw.dmiVersions || [])[0]
                                                                        deployTaskWithDialog({
                                                                          id: hw.id,
                                                                          title: hw.title,
                                                                          content:
                                                                            hw.description ||
                                                                            hw.title,
                                                                          source: 'assessment',
                                                                          dmiItems:
                                                                            dmiVersion?.items ||
                                                                            hw.dmiItems ||
                                                                            [],
                                                                          sourceDocument:
                                                                            hw.sourceDocument,
                                                                          deployedAt: Date.now(),
                                                                          polls: [],
                                                                          questions: [],
                                                                        })
                                                                      }}
                                                                    >
                                                                      <Send className="mr-2 h-4 w-4" />
                                                                      Deploy
                                                                    </DropdownMenuItem>
                                                                  )}

                                                                {mainTab === 'builder' &&
                                                                  canEdit && (
                                                                    <>
                                                                      <DropdownMenuItem
                                                                        onClick={e => {
                                                                          e.stopPropagation()
                                                                          setSelectedItem({
                                                                            type: 'homework',
                                                                            id: hw.id,
                                                                          })
                                                                          loadAssessmentIntoBuilder(
                                                                            hw
                                                                          )
                                                                          setMainBuilderTab(
                                                                            'assessment'
                                                                          )
                                                                          setAssetPickerTarget(
                                                                            'assessment'
                                                                          )
                                                                          setAssetsViewOpen(true)
                                                                          setLoadAsStep(
                                                                            'assessment-options'
                                                                          )
                                                                        }}
                                                                      >
                                                                        Load
                                                                      </DropdownMenuItem>
                                                                      <DropdownMenuItem
                                                                        onClick={e => {
                                                                          e.stopPropagation()
                                                                          setRenamingItemId(hw.id)
                                                                        }}
                                                                      >
                                                                        Rename
                                                                      </DropdownMenuItem>
                                                                      <DropdownMenuItem
                                                                        onClick={e => {
                                                                          e.stopPropagation()
                                                                          duplicateAssessment(
                                                                            node.id,
                                                                            primaryLesson.id,
                                                                            hw
                                                                          )
                                                                        }}
                                                                      >
                                                                        Duplicate
                                                                      </DropdownMenuItem>
                                                                      <DropdownMenuItem
                                                                        className="text-red-500"
                                                                        onClick={e => {
                                                                          e.stopPropagation()
                                                                          if (
                                                                            !confirm(
                                                                              `Delete "${hw.title}"?`
                                                                            )
                                                                          )
                                                                            return
                                                                          setCourseBuilderNodes(
                                                                            prev =>
                                                                              prev.map(mod =>
                                                                                mod.id !== node.id
                                                                                  ? mod
                                                                                  : {
                                                                                      ...mod,
                                                                                      lessons:
                                                                                        mod.lessons.map(
                                                                                          les =>
                                                                                            les.id !==
                                                                                            primaryLesson.id
                                                                                              ? les
                                                                                              : {
                                                                                                  ...les,
                                                                                                  homework:
                                                                                                    (
                                                                                                      les.homework ||
                                                                                                      []
                                                                                                    ).filter(
                                                                                                      x =>
                                                                                                        x.id !==
                                                                                                        hw.id
                                                                                                    ),
                                                                                                }
                                                                                        ),
                                                                                    }
                                                                              )
                                                                          )
                                                                        }}
                                                                      >
                                                                        Delete
                                                                      </DropdownMenuItem>
                                                                    </>
                                                                  )}
                                                              </DropdownMenuContent>
                                                            </DropdownMenu>
                                                          )}
                                                        </div>
                                                      </SortableTreeItem>
                                                    ))}
                                                  </SortableContext>
                                                </div>
                                              )}
                                            </>
                                          )
                                        })()}

                                        {/* End of CourseBuilderNode Quizzes */}
                                        {(node.quizzes || []).map((quiz, quizIdx) => (
                                          <TreeItem
                                            key={quiz.id}
                                            depth={0}
                                            isLast={quizIdx === (node.quizzes?.length || 0) - 1}
                                            className="ml-0 mt-1 border-l-0 pl-0"
                                          >
                                            <div
                                              className="group flex cursor-pointer items-center gap-1.5 rounded-none border bg-red-500 px-3 py-2 shadow-sm transition-colors hover:bg-red-600"
                                              onClick={() =>
                                                setSelectedItem({ type: 'nodeQuiz', id: quiz.id })
                                              }
                                            >
                                              <FileQuestion className="h-4 w-4 text-white" />
                                              <span className="flex-1 truncate text-sm font-semibold text-white">
                                                {quiz.title}
                                              </span>
                                              <Badge
                                                variant="default"
                                                className="h-5 bg-white/20 px-2 text-[10px] text-white hover:bg-white/30"
                                              >
                                                Summative
                                              </Badge>
                                              {canEdit && (
                                                <>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-[10px] text-white opacity-0 hover:bg-white/20 group-hover:opacity-100"
                                                    onClick={(e: any) => {
                                                      e.stopPropagation()
                                                      setEditingData(quiz)
                                                      setActiveModal({
                                                        type: 'nodeQuiz',
                                                        isOpen: true,
                                                        nodeId: node.id,
                                                        itemId: quiz.id,
                                                      })
                                                    }}
                                                  >
                                                    Edit
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-[10px] text-white opacity-0 hover:bg-white/20 group-hover:opacity-100"
                                                    onClick={(e: any) => {
                                                      e.stopPropagation()
                                                      duplicateCourseBuilderNodeQuiz(node.id, quiz)
                                                    }}
                                                  >
                                                    Duplicate
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-white opacity-0 hover:bg-white/20 group-hover:opacity-100"
                                                    onClick={(e: any) => {
                                                      e.stopPropagation()
                                                      deleteCourseBuilderNodeQuiz(node.id, quiz.id)
                                                    }}
                                                  >
                                                    <Trash2 className="h-4 w-4" />
                                                  </Button>
                                                </>
                                              )}
                                            </div>
                                          </TreeItem>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </SortableTreeItem>
                              )
                            })}
                          </SortableContext>

                          {nodes.length === 0 && (
                            <div className="text-muted-foreground py-2 text-center">
                              <Layers className="mx-auto mb-2 h-8 w-8 opacity-30" />
                              <p className="text-sm">No lessons yet. Click "Lesson" to add one.</p>
                            </div>
                          )}
                        </div>
                      </DndContext>
                    </ScrollArea>
                    {/* Assets Folder added to the bottom of the left panel */}
                    <div>{renderAssetsFolder()}</div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* CENTER PANEL - width tracks the visible side panels (expands when
                one is hidden), animated to match the panel collapse. */}
            <div
              className={cn(
                'flex min-h-0 flex-col items-center',
                panelsMounted ? 'transition-[width] duration-500 ease-in-out' : ''
              )}
              style={{ width: centerColWidth, flexShrink: 0 }}
            >
              <div className="flex h-full min-h-0 w-full flex-col items-stretch">
                {mainTab !== 'builder' && (
                  <Card
                    padding="none"
                    className={cn(
                      'flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border-0 bg-[#FFFFFF] shadow-[0_18px_45px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-9 shrink-0 items-center justify-center rounded-t-[20px] px-4 text-sm font-semibold text-white',
                        mainTab === 'live'
                          ? 'bg-gradient-to-br from-orange-500 to-orange-600'
                          : 'bg-gradient-to-br from-violet-500 to-purple-600'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {mainTab === 'live' ? (
                          <MonitorPlay className="h-4 w-4" />
                        ) : (
                          <TestTube2 className="h-4 w-4" />
                        )}
                        {mainTab === 'live' ? 'Classroom' : 'Test'}
                      </div>
                    </div>
                    <CardContent className="flex h-full min-h-0 w-full flex-col overflow-hidden px-4 pb-4">
                      <div className="flex min-h-0 w-full flex-1 flex-col items-stretch gap-0 overflow-hidden">
                        {/* Main content with tabs */}
                        <div className="flex min-h-0 w-full flex-1 flex-col pb-0">
                          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
                            <Tabs
                              value={testPciActiveTab}
                              onValueChange={value => {
                                if (mainTab === 'live' && value === 'student1') {
                                  setTestPciActiveTab(value)
                                  return
                                }
                                setTestPciActiveTab(value)
                              }}
                              className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-stretch overflow-hidden"
                            >
                              <TabsList
                                className={cn(
                                  'mb-4 grid w-full gap-2 bg-transparent p-0 shadow-none',
                                  visibleTestPciTabs.length === 3 ? 'grid-cols-3' : 'grid-cols-4'
                                )}
                              >
                                {visibleTestPciTabs.map(tab => (
                                  <div key={tab.id} className="relative w-full">
                                    {editingTabId === tab.id ? (
                                      <Input
                                        value={tab.label}
                                        onChange={(e: any) => {
                                          setTestPciTabs(prev =>
                                            prev.map(t =>
                                              t.id === tab.id ? { ...t, label: e.target.value } : t
                                            )
                                          )
                                        }}
                                        onBlur={() => setEditingTabId(null)}
                                        onKeyDown={(e: any) => {
                                          if (e.key === 'Enter') setEditingTabId(null)
                                        }}
                                        className="w-full rounded-xl border border-[#CFE0FF] bg-[#EEF4FF] px-3 py-2.5 text-center text-sm font-medium text-[#2B5FB8] focus:outline-none focus-visible:ring-0"
                                        autoFocus
                                      />
                                    ) : (
                                      <TabsTrigger
                                        value={tab.id}
                                        className={cn(
                                          'relative flex w-full items-center justify-center truncate rounded-xl border border-[#E5E7EB] bg-white px-2 py-2.5 text-[11px] font-medium text-[#667085] transition-all data-[state=inactive]:hover:bg-slate-50 sm:text-xs',
                                          mainTab === 'live'
                                            ? 'data-[state=active]:border-orange-200 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-600'
                                            : 'data-[state=active]:border-violet-200 data-[state=active]:bg-violet-50 data-[state=active]:text-violet-600'
                                        )}
                                        onDoubleClick={() => setEditingTabId(tab.id)}
                                      >
                                        {tab.label}
                                      </TabsTrigger>
                                    )}
                                  </div>
                                ))}
                              </TabsList>
                              {visibleTestPciTabs.map(tab => (
                                <TabsContent
                                  key={tab.id}
                                  value={tab.id}
                                  padding="none"
                                  className="mt-2 flex w-full min-w-0 flex-1 flex-col self-stretch overflow-hidden bg-transparent data-[state=active]:flex data-[state=inactive]:hidden"
                                >
                                  {tab.id === 'insights' ? (
                                    insightsProps ? (
                                      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-blue-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-1 shadow-[0_10px_40px_-20px_rgba(29,78,216,0.45)] ring-1 ring-blue-200/60">
                                        {/* Recording status removed from Insights tab */}

                                        <Tabs
                                          value={insightsTab}
                                          onValueChange={value =>
                                            setInsightsTab(
                                              value as 'analytics' | 'poll' | 'question'
                                            )
                                          }
                                          className="flex h-full min-h-0 flex-col"
                                        >
                                          <SlidingPillTabsList
                                            value={insightsTab}
                                            variant="white"
                                            tabs={[
                                              { value: 'analytics', label: 'Analytics' },
                                              { value: 'poll', label: 'Poll' },
                                              { value: 'question', label: 'Question' },
                                            ]}
                                            listClassName="mb-2 grid grid-cols-3 gap-2 shadow-none"
                                            triggerClassName="h-7 rounded-md px-2 text-[11px]"
                                          />

                                          <TabsContent
                                            value="analytics"
                                            className="flex h-full flex-1 flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                          >
                                            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
                                              <AiAssistantPanel
                                                sessionId={insightsProps.sessionId}
                                                courseName={courseName}
                                                sessions={insightsProps.sessions?.map((s: any) => ({
                                                  id: s.id,
                                                  title: s.title,
                                                  scheduledAt: s.scheduledAt,
                                                  status: s.status,
                                                }))}
                                                studentsCount={
                                                  (insightsProps.students || []).length
                                                }
                                                liveSubmissions={
                                                  insightsProps.liveSubmissions || []
                                                }
                                              />
                                            </div>
                                          </TabsContent>

                                          <TabsContent
                                            value="poll"
                                            className="flex flex-1 flex-col justify-end overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                          >
                                            {pollComposeMode ? (
                                              <div className="mb-2 flex flex-1 flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
                                                {/* Header with toggle */}
                                                <div className="flex items-center justify-between border-b border-blue-100 px-4 py-2">
                                                  <span className="flex-1 text-center text-xs font-semibold text-blue-700">
                                                    New Poll
                                                  </span>
                                                  {pollResults.length > 0 && (
                                                    <button
                                                      type="button"
                                                      onClick={() => setPollComposeMode(false)}
                                                      className="text-xs text-blue-600 hover:text-blue-800"
                                                    >
                                                      View Results
                                                    </button>
                                                  )}
                                                </div>
                                                {/* Editable question area */}
                                                <div className="flex-1 overflow-y-auto p-4">
                                                  <textarea
                                                    value={pollPrompt}
                                                    onChange={e => setPollPrompt(e.target.value)}
                                                    placeholder={getPollPlaceholder(pollOptionMode)}
                                                    className="w-full resize-none border-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none"
                                                    rows={3}
                                                  />
                                                  {/* Poll options preview */}
                                                  <div className="mt-4">
                                                    {pollOptionMode === '1-10' && (
                                                      <div className="grid grid-cols-5 gap-2">
                                                        {Array.from(
                                                          { length: 10 },
                                                          (_, i) => i + 1
                                                        ).map(num => (
                                                          <button
                                                            key={num}
                                                            type="button"
                                                            className="flex h-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700"
                                                          >
                                                            {num}
                                                          </button>
                                                        ))}
                                                      </div>
                                                    )}
                                                    {pollOptionMode === 'likert' && (
                                                      <div className="flex flex-col gap-2">
                                                        {likertLabels.map((label, i) => (
                                                          <EditableLikertItem
                                                            key={i}
                                                            index={i}
                                                            label={label}
                                                            onChange={setLikertLabel}
                                                            onDelete={deleteLikertLabel}
                                                            canDelete={likertLabels.length > 2}
                                                          />
                                                        ))}
                                                        <button
                                                          type="button"
                                                          onClick={addLikertLabel}
                                                          className="flex h-8 items-center justify-center gap-1 rounded-md border border-dashed border-blue-300 bg-blue-50/50 text-xs font-medium text-blue-600 hover:bg-blue-100"
                                                        >
                                                          <Plus className="h-3.5 w-3.5" />
                                                          Add option
                                                        </button>
                                                      </div>
                                                    )}
                                                    {pollOptionMode === 'ae' && (
                                                      <div className="flex flex-wrap gap-2">
                                                        {['A', 'B', 'C', 'D', 'E'].map(letter => (
                                                          <button
                                                            key={letter}
                                                            type="button"
                                                            className="flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700"
                                                          >
                                                            {letter}
                                                          </button>
                                                        ))}
                                                      </div>
                                                    )}
                                                    {pollOptionMode === 'tf' && (
                                                      <div className="flex flex-wrap gap-2">
                                                        {['True', 'False'].map(option => (
                                                          <button
                                                            key={option}
                                                            type="button"
                                                            className="flex h-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-4 text-xs font-medium text-blue-700"
                                                          >
                                                            {option}
                                                          </button>
                                                        ))}
                                                      </div>
                                                    )}
                                                    {pollOptionMode === 'yn' && (
                                                      <div className="flex flex-wrap gap-2">
                                                        {['Yes', 'No'].map(option => (
                                                          <button
                                                            key={option}
                                                            type="button"
                                                            className="flex h-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-4 text-xs font-medium text-blue-700"
                                                          >
                                                            {option}
                                                          </button>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>
                                                {/* Bottom button row */}
                                                <div className="relative flex items-center gap-1.5 border-t border-blue-100 px-4 py-3">
                                                  {/* Speed Dial */}
                                                  <div className="relative">
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        setSpeedDialOpen(!speedDialOpen)
                                                      }
                                                      className={cn(
                                                        'flex h-8 w-[100px] items-center justify-center rounded-md px-2 text-xs font-medium transition-colors',
                                                        'bg-[#2563EB] text-white hover:bg-white hover:text-[#2563EB] hover:ring-1 hover:ring-[#2563EB]'
                                                      )}
                                                    >
                                                      {POLL_OPTION_PRESETS.find(
                                                        p => p.id === pollOptionMode
                                                      )?.label || 'Type'}
                                                    </button>
                                                    {speedDialOpen && (
                                                      <div className="absolute bottom-full left-1/2 z-20 mb-2 flex -translate-x-1/2 flex-col items-center">
                                                        {POLL_OPTION_PRESETS.map(
                                                          (preset, index) => (
                                                            <Fragment key={preset.id}>
                                                              {index > 0 && (
                                                                <div className="h-2 w-px bg-blue-200" />
                                                              )}
                                                              <button
                                                                type="button"
                                                                onClick={() => {
                                                                  setPollOptionMode(preset.id)
                                                                  setSpeedDialOpen(false)
                                                                }}
                                                                className={cn(
                                                                  'flex h-8 w-[100px] items-center justify-center rounded-md px-2 text-xs font-medium transition-colors',
                                                                  pollOptionMode === preset.id
                                                                    ? 'bg-[#2563EB] text-white'
                                                                    : 'border border-blue-200 bg-white text-blue-700 hover:bg-blue-50'
                                                                )}
                                                              >
                                                                {preset.label}
                                                              </button>
                                                            </Fragment>
                                                          )
                                                        )}
                                                      </div>
                                                    )}
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setPollPrompt('')
                                                      setPollCustomOptions('')
                                                      setPollOptionMode('1-10')
                                                    }}
                                                    className={cn(
                                                      'flex h-8 flex-1 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors',
                                                      'bg-[#2563EB] text-white hover:bg-white hover:text-[#2563EB] hover:ring-1 hover:ring-[#2563EB]'
                                                    )}
                                                  >
                                                    New
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setPollPrompt('')
                                                      setPollCustomOptions('')
                                                    }}
                                                    className={cn(
                                                      'flex h-8 flex-1 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors',
                                                      'bg-[#2563EB] text-white hover:bg-white hover:text-[#2563EB] hover:ring-1 hover:ring-[#2563EB]'
                                                    )}
                                                  >
                                                    Clear
                                                  </button>
                                                  <Button
                                                    size="sm"
                                                    className="h-8 flex-1 rounded-md bg-[#2563EB] px-3 text-xs text-white hover:bg-white hover:text-[#2563EB] hover:ring-1 hover:ring-[#2563EB] disabled:opacity-30"
                                                    disabled={
                                                      !activeInsightsTaskId ||
                                                      !insightsProps.sessionId ||
                                                      !pollPrompt.trim()
                                                    }
                                                    onClick={() => {
                                                      if (
                                                        !activeInsightsTaskId ||
                                                        !insightsProps.sessionId
                                                      )
                                                        return
                                                      const opts = resolvePollOptions()
                                                      insightsProps.onSendPoll({
                                                        taskId: currentInsightsId,
                                                        question: pollPrompt,
                                                        options: opts,
                                                      })
                                                      setPollComposeMode(false)
                                                    }}
                                                  >
                                                    <Send className="mr-1 h-3 w-3" />
                                                    Poll
                                                  </Button>
                                                </div>
                                              </div>
                                            ) : (
                                              <>
                                                <InsightsReportView
                                                  type="poll"
                                                  pollResults={pollResults}
                                                  onClose={handleCloseInsight}
                                                  onMentionStudent={name =>
                                                    setPollPrompt(
                                                      pollPrompt
                                                        ? `${pollPrompt} @[${name}](student:${name}) `
                                                        : `@[${name}](student:${name}) `
                                                    )
                                                  }
                                                />
                                                <div className="flex items-center justify-center py-2">
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      // Pre-fill with the last poll's question if available
                                                      const lastPoll = pollResults[0]
                                                      if (lastPoll) {
                                                        setPollPrompt(lastPoll.question)
                                                      }
                                                      setPollComposeMode(true)
                                                    }}
                                                    className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                                                  >
                                                    <Send className="h-3 w-3" />
                                                    New Poll
                                                  </button>
                                                </div>
                                              </>
                                            )}
                                          </TabsContent>

                                          <TabsContent
                                            value="question"
                                            className="flex flex-1 flex-col justify-end overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                          >
                                            {showAIQuestion ? (
                                              <div className="mb-2 flex-1 overflow-hidden rounded-2xl border border-blue-100 bg-white/60 shadow-sm backdrop-blur-md">
                                                <AITeachingAssistant
                                                  mode="question"
                                                  currentTopic={
                                                    activeInsightsTask?.title ||
                                                    'General Course Content'
                                                  }
                                                  nodes={nodes}
                                                  onSelectPrompt={text => {
                                                    setQuestionPrompt(text)
                                                    setShowAIQuestion(false)
                                                  }}
                                                  onClose={() => setShowAIQuestion(false)}
                                                />
                                              </div>
                                            ) : (
                                              <InsightsReportView
                                                type="question"
                                                questionResults={questionResults}
                                                onClose={handleCloseInsight}
                                                onMentionStudent={name =>
                                                  setQuestionPrompt(
                                                    questionPrompt
                                                      ? `${questionPrompt} @[${name}](student:${name}) `
                                                      : `@[${name}](student:${name}) `
                                                  )
                                                }
                                              />
                                            )}
                                            <div className="mt-2 rounded-2xl border border-blue-100 bg-white p-2 shadow-sm">
                                              <div className="relative">
                                                <MentionTextarea
                                                  mentionItems={mentionItems}
                                                  className="min-h-[72px] w-full resize-none border-0 bg-transparent py-2 pl-3 pr-24 text-sm shadow-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                                  disableAutoResize
                                                  value={questionPrompt}
                                                  onChange={event =>
                                                    setQuestionPrompt(event.target.value)
                                                  }
                                                />
                                                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                                                  <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className={cn(
                                                      'h-8 w-8 rounded-xl hover:bg-blue-100 hover:text-blue-700 disabled:opacity-30',
                                                      showAIQuestion
                                                        ? 'bg-blue-100 text-blue-700'
                                                        : 'text-blue-600'
                                                    )}
                                                    title="Generate with Socratic AI"
                                                    onClick={() =>
                                                      setShowAIQuestion(!showAIQuestion)
                                                    }
                                                    disabled={!activeInsightsTaskId}
                                                  >
                                                    <Sparkles className="h-4 w-4" />
                                                  </Button>
                                                  <Button
                                                    size="icon"
                                                    className="h-8 w-8 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-30"
                                                    disabled={
                                                      !activeInsightsTaskId ||
                                                      !insightsProps.sessionId ||
                                                      !questionPrompt.trim()
                                                    }
                                                    onClick={() => {
                                                      if (
                                                        !activeInsightsTaskId ||
                                                        !insightsProps.sessionId
                                                      )
                                                        return
                                                      insightsProps.onSendQuestion({
                                                        taskId: currentInsightsId,
                                                        prompt: questionPrompt,
                                                      })
                                                      setQuestionPrompt('')
                                                    }}
                                                  >
                                                    <Send className="h-4 w-4" />
                                                  </Button>
                                                </div>
                                              </div>
                                            </div>
                                          </TabsContent>
                                        </Tabs>
                                      </div>
                                    ) : null
                                  ) : (
                                    <div
                                      className={cn(
                                        'flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-white p-0',
                                        mainTab === 'live'
                                          ? 'border-orange-300'
                                          : 'border-violet-300'
                                      )}
                                    >
                                      <PanelErrorBoundary
                                        label="this view"
                                        resetKeys={[
                                          tab.id,
                                          mainTab,
                                          testPciViewMode,
                                          testPciSource,
                                        ]}
                                      >
                                        {(() => {
                                          if (mainTab === 'live' && tab.id === 'student1') {
                                            if (monitorSelectedStudents.length > 0) {
                                              const count = monitorSelectedStudents.length
                                              const gridCols =
                                                count === 1
                                                  ? 'grid-cols-1'
                                                  : count === 2
                                                    ? 'grid-cols-1 lg:grid-cols-2'
                                                    : 'grid-cols-1 md:grid-cols-2'
                                              return (
                                                <Dialog
                                                  open
                                                  onOpenChange={open => {
                                                    if (!open) {
                                                      setMonitorSelectedStudents([])
                                                      setTestPciActiveTab('student-monitor')
                                                    }
                                                  }}
                                                >
                                                  <DialogContent className="h-[92vh] w-[94vw] max-w-none overflow-hidden p-4">
                                                    <div className="flex h-full w-full flex-col overflow-hidden">
                                                      <div className="mb-2 flex items-center justify-between">
                                                        <div className="text-sm font-semibold text-slate-800">
                                                          Viewing {count} student whiteboard
                                                          {count === 1 ? '' : 's'}
                                                        </div>
                                                        <Button
                                                          variant="ghost"
                                                          size="sm"
                                                          className="h-8 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                                          onClick={() =>
                                                            setMonitorSelectedStudents([])
                                                          }
                                                        >
                                                          Close all
                                                        </Button>
                                                      </div>
                                                      <div
                                                        className={cn(
                                                          'grid min-h-0 flex-1 gap-3 overflow-auto',
                                                          gridCols
                                                        )}
                                                      >
                                                        {monitorSelectedStudents.map(s => {
                                                          const board =
                                                            insightsProps?.studentBoards?.[s.id]
                                                          const pages =
                                                            (board?.pages as WhiteboardPages) ||
                                                            createDefaultWhiteboardPages()
                                                          const pageCount = Math.max(
                                                            pages.length,
                                                            1
                                                          )
                                                          const pageIndex =
                                                            typeof board?.pageIndex === 'number'
                                                              ? Math.min(
                                                                  Math.max(board.pageIndex, 0),
                                                                  pageCount - 1
                                                                )
                                                              : 0
                                                          return (
                                                            <div
                                                              key={s.id}
                                                              className="flex min-h-[300px] flex-col overflow-hidden rounded-[12px] border border-slate-200 bg-white shadow-sm"
                                                            >
                                                              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
                                                                <span className="min-w-0 truncate font-semibold text-slate-700">
                                                                  {s.name}
                                                                </span>
                                                                <div className="flex items-center gap-2">
                                                                  <span className="text-slate-600">
                                                                    Page {pageIndex + 1}/{pageCount}
                                                                  </span>
                                                                  <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6 text-slate-500 hover:bg-white hover:text-slate-800"
                                                                    onClick={() =>
                                                                      removeMonitorStudent(s.id)
                                                                    }
                                                                    title={`Stop viewing ${s.name}`}
                                                                  >
                                                                    <X className="h-4 w-4" />
                                                                  </Button>
                                                                </div>
                                                              </div>
                                                              <div className="min-h-0 flex-1">
                                                                <EnhancedWhiteboard
                                                                  videoOverlay={false}
                                                                  pages={pages}
                                                                  currentPageIndex={pageIndex}
                                                                  readOnly
                                                                />
                                                              </div>
                                                            </div>
                                                          )
                                                        })}
                                                      </div>
                                                    </div>
                                                  </DialogContent>
                                                </Dialog>
                                              )
                                            }

                                            return (
                                              <div className="flex h-full w-full flex-col">
                                                <EnhancedWhiteboard
                                                  videoOverlay={false}
                                                  pages={tutorBoardPages}
                                                  currentPageIndex={tutorBoardPageIndex}
                                                  onPagesChange={setTutorBoardPages}
                                                  onPageIndexChange={setTutorBoardPageIndex}
                                                  socket={insightsProps?.socket}
                                                  roomId={insightsProps?.sessionId ?? undefined}
                                                  userId={insightsProps?.tutorId ?? undefined}
                                                  // Tutor board shows only the tutor's own strokes (broadcast to
                                                  // students); students' boards are scoped separately.
                                                  filterByUserId={
                                                    insightsProps?.tutorId ?? undefined
                                                  }
                                                  userName={insightsProps?.tutorName || 'Tutor'}
                                                  userColor={stringToColor(
                                                    insightsProps?.tutorId || ''
                                                  )}
                                                />
                                              </div>
                                            )
                                          }

                                          if (mainTab === 'live' && tab.id === 'student-monitor') {
                                            if (
                                              !insightsProps?.socket ||
                                              !insightsProps?.sessionId
                                            ) {
                                              return (
                                                <div className="flex h-full w-full items-center justify-center rounded-2xl bg-white p-6 text-sm text-slate-500">
                                                  Monitor is unavailable without an active session.
                                                </div>
                                              )
                                            }
                                            return (
                                              <div className="relative h-full w-full">
                                                <div className="h-full w-full">
                                                  <MonitoringPanel
                                                    socket={insightsProps.socket}
                                                    sessionId={insightsProps.sessionId}
                                                    tutorId={insightsProps.tutorId}
                                                    students={insightsProps?.students || []}
                                                    liveTasks={insightsProps?.liveTasks || []}
                                                    selectedStudentIds={monitorSelectedStudents.map(
                                                      s => s.id
                                                    )}
                                                    onToggleWhiteboardSelection={(
                                                      studentId,
                                                      studentName
                                                    ) => {
                                                      toggleMonitorStudent(studentId, studentName)
                                                    }}
                                                    onOpenWhiteboards={(studentId, studentName) => {
                                                      addMonitorStudent(studentId, studentName)
                                                      setTestPciActiveTab('student1')
                                                    }}
                                                  />
                                                </div>
                                              </div>
                                            )
                                          }

                                          const liveTask =
                                            mainTab === 'live' && testPciSource === 'task'
                                              ? findTaskById(loadedTaskId || '')
                                              : null
                                          const liveAssessment =
                                            mainTab === 'live' && testPciSource === 'assessment'
                                              ? findAssessmentById(loadedAssessmentId || '')
                                              : null

                                          // In the Classroom, honor the selected extension just
                                          // like the Build tab: an extension shows its OWN
                                          // document, not the parent task's. Falls back to the
                                          // task document when no extension is active.
                                          const liveTaskExtension =
                                            liveTask && taskBuilder.activeExtensionId
                                              ? liveTask.extensions?.find(
                                                  e => e.id === taskBuilder.activeExtensionId
                                                ) || null
                                              : null

                                          const doc =
                                            mainTab === 'live'
                                              ? testPciSource === 'task'
                                                ? liveTaskExtension
                                                  ? liveTaskExtension.sourceDocument
                                                  : liveTask?.sourceDocument
                                                : liveAssessment?.sourceDocument
                                              : testPciSource === 'task'
                                                ? currentTaskDocument
                                                : currentAssessmentDocument
                                          const versionId = testPciViewMode.startsWith('dmi_')
                                            ? testPciViewMode.replace('dmi_', '')
                                            : null
                                          const versions =
                                            mainTab === 'live'
                                              ? []
                                              : testPciSource === 'task'
                                                ? taskDmiVersions
                                                : assessmentDmiVersions
                                          const version = versionId
                                            ? versions.find(v => v.id === versionId)
                                            : versions[0]
                                          const hasDoc = !!(
                                            doc?.fileUrl ||
                                            doc?.fileKey ||
                                            doc?.extractedText
                                          )
                                          const hasDmi = !!version

                                          // Test-tab task preview: render the exact student chat flow
                                          // (the document collapses into the chat on the first sample
                                          // answer) filling this panel — instead of a separate PDF +
                                          // chat, so the tutor previews what students actually see.
                                          // This branch runs first so text-only tasks with no document
                                          // still get a functional chat preview.
                                          if (mainTab === 'test-pci' && testPciSource === 'task') {
                                            const previewExt = taskBuilder.activeExtensionId
                                              ? taskBuilder.extensions.find(
                                                  e => e.id === taskBuilder.activeExtensionId
                                                )
                                              : null
                                            const previewKey = `${previewExt ? previewExt.id : 'base'}:${tab.id}`
                                            const extKey = previewExt ? previewExt.id : 'base'
                                            const isClassroomTab = tab.id === 'classroom'
                                            const studentTabName =
                                              tab.id === 'student1'
                                                ? 'Test Student 1'
                                                : tab.id === 'student2'
                                                  ? 'Test Student 2'
                                                  : 'Student'

                                            return (
                                              <div className="h-full min-h-0 w-full">
                                                <TestTaskChat
                                                  pci={
                                                    (previewExt
                                                      ? previewExt.pci
                                                      : taskBuilder.taskPci) || ''
                                                  }
                                                  pciSpec={
                                                    previewExt ? undefined : taskBuilder.pciSpec
                                                  }
                                                  questionText={
                                                    loadedTaskId
                                                      ? `${taskBuilder.title}\n\n${previewExt ? previewExt.content : taskBuilder.taskContent}`
                                                      : undefined
                                                  }
                                                  sourceDocument={
                                                    loadedTaskId
                                                      ? previewExt
                                                        ? previewExt.sourceDocument
                                                        : currentTaskDocument
                                                      : undefined
                                                  }
                                                  initialState={
                                                    isClassroomTab
                                                      ? undefined
                                                      : testTaskChatStore.current[previewKey]
                                                  }
                                                  incomingMessages={
                                                    isClassroomTab
                                                      ? classroomMessages[extKey]
                                                      : undefined
                                                  }
                                                  onPersist={s => {
                                                    if (!isClassroomTab) {
                                                      testTaskChatStore.current[previewKey] = s
                                                      try {
                                                        localStorage.setItem(
                                                          'tutor-test-chat-store-v1',
                                                          JSON.stringify(testTaskChatStore.current)
                                                        )
                                                      } catch {
                                                        // ignore
                                                      }
                                                    }
                                                  }}
                                                  onBroadcast={msg => {
                                                    if (isClassroomTab) {
                                                      // Tutor message from classroom → broadcast to all student tabs
                                                      const tutorMsg = { ...msg, name: 'Tutor' }
                                                      ;['student1', 'student2'].forEach(st => {
                                                        const sk = `${extKey}:${st}`
                                                        const existing =
                                                          testTaskChatStore.current[sk]
                                                        testTaskChatStore.current[sk] = {
                                                          messages: [
                                                            ...(existing?.messages ?? []),
                                                            tutorMsg,
                                                          ],
                                                          draft: existing?.draft ?? '',
                                                          completed: existing?.completed ?? false,
                                                        }
                                                      })
                                                      // Also append to classroom state so it appears in the classroom view
                                                      setClassroomMessages(prev => ({
                                                        ...prev,
                                                        [extKey]: [
                                                          ...(prev[extKey] ?? []),
                                                          tutorMsg,
                                                        ],
                                                      }))
                                                    } else {
                                                      // Student message → add to classroom view with student name
                                                      const studentMsg = {
                                                        ...msg,
                                                        name: studentTabName,
                                                      }
                                                      setClassroomMessages(prev => ({
                                                        ...prev,
                                                        [extKey]: [
                                                          ...(prev[extKey] ?? []),
                                                          studentMsg,
                                                        ],
                                                      }))
                                                    }
                                                  }}
                                                  onReset={() => {
                                                    // Clear all test data for this extension
                                                    // 1. Clear classroom messages
                                                    setClassroomMessages(prev => {
                                                      const next = { ...prev }
                                                      delete next[extKey]
                                                      try {
                                                        localStorage.setItem(
                                                          'tutor-classroom-messages-v1',
                                                          JSON.stringify(next)
                                                        )
                                                      } catch {
                                                        // ignore
                                                      }
                                                      return next
                                                    })
                                                    // 2. Clear all student tab stores for this extension
                                                    ;['student1', 'student2'].forEach(st => {
                                                      const sk = `${extKey}:${st}`
                                                      delete testTaskChatStore.current[sk]
                                                    })
                                                    // 3. Clear classroom tab store
                                                    delete testTaskChatStore.current[
                                                      `${extKey}:classroom`
                                                    ]
                                                    try {
                                                      localStorage.setItem(
                                                        'tutor-test-chat-store-v1',
                                                        JSON.stringify(testTaskChatStore.current)
                                                      )
                                                    } catch {
                                                      // ignore
                                                    }
                                                  }}
                                                  mode={
                                                    isClassroomTab ? 'classroom' : 'test-student'
                                                  }
                                                  tutorAvatarUrl={tutorAvatarUrl}
                                                  studentAvatarUrl={
                                                    isClassroomTab
                                                      ? undefined
                                                      : (studentAvatarPool.current ?? [])[
                                                          tab.id === 'student1' ? 0 : 1
                                                        ]
                                                  }
                                                  onTutorNote={
                                                    isClassroomTab
                                                      ? note =>
                                                          appendClassroomAiMessage(note, 'SAI')
                                                      : undefined
                                                  }
                                                  onAddAnswer={
                                                    isClassroomTab
                                                      ? undefined
                                                      : answer =>
                                                          emitClassroomAiEvent('student-answer', {
                                                            answer,
                                                            extensionId: extKey,
                                                            studentName: studentTabName,
                                                          })
                                                  }
                                                  onAsk={
                                                    isClassroomTab
                                                      ? undefined
                                                      : question =>
                                                          emitClassroomAiEvent('student-ask', {
                                                            question,
                                                            extensionId: extKey,
                                                            studentName: studentTabName,
                                                          })
                                                  }
                                                  onComplete={
                                                    isClassroomTab
                                                      ? undefined
                                                      : answers =>
                                                          emitClassroomAiEvent('task-complete', {
                                                            answers,
                                                            extensionId: extKey,
                                                            studentName: studentTabName,
                                                          })
                                                  }
                                                />
                                              </div>
                                            )
                                          }

                                          // Nothing to render as a document or DMI — fall back to
                                          // plain text (e.g. assessments/live with no source doc).
                                          if (!hasDoc && !hasDmi) {
                                            return (
                                              <div className="h-full min-h-0 w-full overflow-y-auto p-4">
                                                <p className="text-muted-foreground whitespace-pre-wrap text-sm">
                                                  {testPciContent[tab.id] || ''}
                                                </p>
                                              </div>
                                            )
                                          }

                                          // Document-only: render directly without ResizablePanelGroup
                                          // so the PDF fills the entire tab area.
                                          if (hasDoc && !hasDmi) {
                                            return (
                                              <div className="relative min-h-0 w-full flex-1">
                                                {doc?.fileUrl || doc?.fileKey ? (
                                                  <PDFViewer
                                                    key={doc.fileUrl || doc.fileKey || 'doc'}
                                                    fileUrl={doc.fileUrl || ''}
                                                    fileKey={doc.fileKey}
                                                    className="absolute inset-0 h-full w-full"
                                                    fitToWidth
                                                  />
                                                ) : (
                                                  <p className="text-muted-foreground absolute inset-0 h-full w-full overflow-y-auto whitespace-pre-wrap p-2 text-sm">
                                                    {mainTab === 'live'
                                                      ? testPciSource === 'task'
                                                        ? liveTask?.description
                                                        : liveAssessment?.description
                                                      : doc?.extractedText}
                                                  </p>
                                                )}
                                              </div>
                                            )
                                          }

                                          // Document + DMI: use resizable panels side-by-side
                                          return (
                                            <ResizablePanelGroup
                                              orientation="horizontal"
                                              className="h-full w-full"
                                            >
                                              <ResizablePanel
                                                defaultSize={50}
                                                minSize={20}
                                                className="h-full"
                                              >
                                                <div className="relative h-full w-full pr-1">
                                                  {doc?.fileUrl || doc?.fileKey ? (
                                                    <PDFViewer
                                                      key={doc.fileUrl || doc.fileKey || 'doc'}
                                                      fileUrl={doc.fileUrl || ''}
                                                      fileKey={doc.fileKey}
                                                      className="absolute inset-0 h-full w-full"
                                                      fitToWidth
                                                    />
                                                  ) : (
                                                    <p className="text-muted-foreground absolute inset-0 h-full w-full overflow-y-auto whitespace-pre-wrap p-2 text-sm">
                                                      {mainTab === 'live'
                                                        ? testPciSource === 'task'
                                                          ? liveTask?.description
                                                          : liveAssessment?.description
                                                        : doc?.extractedText}
                                                    </p>
                                                  )}
                                                </div>
                                              </ResizablePanel>
                                              <ResizableHandle withHandle />
                                              <ResizablePanel
                                                defaultSize={50}
                                                minSize={20}
                                                className="h-full"
                                              >
                                                <div className="ml-1 h-full w-full overflow-y-auto bg-white p-4">
                                                  <div className="space-y-4">
                                                    {mainTab === 'test-pci' &&
                                                      testPciSource === 'assessment' &&
                                                      canEdit &&
                                                      (version?.items ?? []).length > 0 && (
                                                        <div className="flex items-center gap-2 text-xs">
                                                          <span className="text-slate-500">
                                                            Test with:
                                                          </span>
                                                          <select
                                                            value={testPciBasis}
                                                            aria-label="Marking basis to test against (debug — does not affect student grading)"
                                                            onChange={e =>
                                                              setTestPciBasis(
                                                                e.target.value as
                                                                  | 'all'
                                                                  | 'pci'
                                                                  | 'rubric'
                                                                  | 'model'
                                                              )
                                                            }
                                                            title="Debug: isolate one marking basis to see its effect (test only — never affects student grading)"
                                                            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-700"
                                                          >
                                                            <option value="all">All bases</option>
                                                            <option value="pci">PCI only</option>
                                                            <option value="rubric">
                                                              Rubric only
                                                            </option>
                                                            <option value="model">
                                                              Model answer only
                                                            </option>
                                                          </select>
                                                        </div>
                                                      )}
                                                    {dmiDocumentKind[testPciSource] && canEdit && (
                                                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                                        <span>
                                                          Detected as{' '}
                                                          <span className="font-semibold">
                                                            {dmiDocumentKind[testPciSource] ===
                                                            'question_paper'
                                                              ? 'a question paper'
                                                              : 'study material'}
                                                          </span>
                                                          {dmiDocumentKind[testPciSource] ===
                                                          'question_paper'
                                                            ? ' — extracted the question numbers.'
                                                            : ' — authored questions from the content.'}
                                                        </span>
                                                        <button
                                                          type="button"
                                                          disabled={dmiGenerating}
                                                          onClick={() =>
                                                            handleGenerateDMI(
                                                              testPciSource,
                                                              undefined,
                                                              dmiDocumentKind[testPciSource] ===
                                                                'question_paper'
                                                                ? 'study_material'
                                                                : 'question_paper'
                                                            )
                                                          }
                                                          className="ml-auto rounded-md border border-amber-300 bg-white px-2 py-1 font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                                                        >
                                                          Not right? Regenerate as{' '}
                                                          {dmiDocumentKind[testPciSource] ===
                                                          'question_paper'
                                                            ? 'study material'
                                                            : 'a question paper'}
                                                        </button>
                                                      </div>
                                                    )}
                                                    {(version?.items ?? []).length === 0 && (
                                                      <p className="text-muted-foreground text-sm">
                                                        No questions in this DMI yet. Open{' '}
                                                        <span className="font-medium">
                                                          Edit marks &amp; answers
                                                        </span>{' '}
                                                        and generate the DMI — for study material
                                                        the AI will author questions from the
                                                        content.
                                                      </p>
                                                    )}
                                                    {(version?.items ?? []).map(item => (
                                                      <div
                                                        key={item.id}
                                                        className="rounded-lg border bg-gray-50 p-3"
                                                      >
                                                        <div className="flex items-start justify-between gap-2">
                                                          <p className="text-sm font-medium text-gray-900">
                                                            <span className="mr-1 text-indigo-600">
                                                              Q
                                                              {item.questionLabel ??
                                                                item.questionNumber}
                                                              :
                                                            </span>
                                                            {item.questionText}
                                                          </p>
                                                          <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                                            {typeof item.marks === 'number' &&
                                                            item.marks > 0
                                                              ? item.marks
                                                              : 1}{' '}
                                                            {(typeof item.marks === 'number' &&
                                                            item.marks > 0
                                                              ? item.marks
                                                              : 1) === 1
                                                              ? 'mark'
                                                              : 'marks'}
                                                          </span>
                                                        </div>
                                                        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                                                          <span className="font-medium">
                                                            Answer:
                                                          </span>{' '}
                                                          {item.answer}
                                                        </p>
                                                        {item.rubric && (
                                                          <p className="mt-1 whitespace-pre-wrap rounded bg-sky-50 px-2 py-1 text-xs text-sky-800">
                                                            <span className="font-semibold">
                                                              Marking:
                                                            </span>{' '}
                                                            {item.rubric}
                                                          </p>
                                                        )}
                                                        {mainTab === 'test-pci' &&
                                                          testPciSource === 'assessment' &&
                                                          canEdit &&
                                                          (() => {
                                                            const ak = `${testPciActiveTab}:${item.id}`
                                                            const result = testDmiResults[ak]
                                                            return (
                                                              <div className="mt-2 border-t border-gray-200 pt-2">
                                                                <textarea
                                                                  value={testDmiAnswers[ak] || ''}
                                                                  onChange={e =>
                                                                    setTestDmiAnswers(prev => ({
                                                                      ...prev,
                                                                      [ak]: e.target.value,
                                                                    }))
                                                                  }
                                                                  rows={2}
                                                                  placeholder="Type a test answer to grade against this question…"
                                                                  aria-label={`Test answer for question ${item.questionLabel ?? item.questionNumber}`}
                                                                  className="w-full resize-none rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-violet-400"
                                                                />
                                                                <div className="mt-1 flex items-center gap-2">
                                                                  <button
                                                                    type="button"
                                                                    disabled={
                                                                      result?.loading ||
                                                                      !(
                                                                        testDmiAnswers[ak] || ''
                                                                      ).trim()
                                                                    }
                                                                    onClick={() =>
                                                                      gradeTestDmiItem(item)
                                                                    }
                                                                    aria-label={`Grade test answer for question ${item.questionLabel ?? item.questionNumber}`}
                                                                    className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                                                                  >
                                                                    {result?.loading
                                                                      ? 'Grading…'
                                                                      : 'Grade'}
                                                                  </button>
                                                                  {result &&
                                                                    !result.loading &&
                                                                    typeof result.score ===
                                                                      'number' && (
                                                                      <span className="text-xs font-semibold text-violet-700">
                                                                        Score: {result.score}%
                                                                      </span>
                                                                    )}
                                                                </div>
                                                                {result &&
                                                                  !result.loading &&
                                                                  result.feedback && (
                                                                    <p className="mt-1 whitespace-pre-wrap rounded bg-violet-50 px-2 py-1 text-xs text-violet-900">
                                                                      {result.feedback}
                                                                    </p>
                                                                  )}
                                                              </div>
                                                            )
                                                          })()}
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              </ResizablePanel>
                                            </ResizablePanelGroup>
                                          )
                                        })()}
                                      </PanelErrorBoundary>
                                      {/* Show AI scores if any */}
                                      {testPciScores[tab.id]?.length > 0 && (
                                        <div className="mt-3 border-t border-gray-400 pt-3">
                                          <p className="mb-2 text-xs font-medium text-gray-600">
                                            AI Feedback:
                                          </p>
                                          {testPciScores[tab.id].map((score, idx) => (
                                            <div
                                              key={idx}
                                              className="mb-1 rounded border border-gray-400 bg-white p-1"
                                            >
                                              <div className="flex items-center gap-2">
                                                <Badge
                                                  variant={
                                                    score.score >= 80
                                                      ? 'default'
                                                      : score.score >= 50
                                                        ? 'secondary'
                                                        : 'destructive'
                                                  }
                                                  className="text-[10px]"
                                                >
                                                  {score.score}%
                                                </Badge>
                                              </div>
                                              <p className="mt-1 text-xs text-gray-600">
                                                {score.feedback}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </TabsContent>
                              ))}
                            </Tabs>
                            {testPciActiveTab !== 'insights' &&
                              testPciActiveTab !== 'student-monitor' &&
                              !(mainTab === 'live' && testPciActiveTab === 'student1') &&
                              // For a TASK in the Test tab, preview the new chat-based
                              // flow students get (chat → Task complete → per-answer
                              // responses → follow-up); assessments keep the composer.
                              (mainTab === 'test-pci' && testPciSource === 'task' ? (
                                // A task is previewed via the chat flow rendered in the panel
                                // above (the document collapses into the chat), so nothing
                                // extra is needed here.
                                <></>
                              ) : mainTab === 'test-pci' && testPciSource === 'assessment' ? (
                                // Assessments are answered in the DMI: test-grade per question
                                // above (type an answer under a question and click Grade) rather
                                // than a separate free-text box, which caused confusion.
                                <div className="mt-1 rounded-2xl border border-violet-200 bg-violet-50/40 px-4 py-3 text-xs text-slate-600">
                                  To test grading, type a sample answer under any question above and
                                  click <span className="font-medium text-violet-700">Grade</span> —
                                  each answer is marked against that question&rsquo;s rubric, model
                                  answer, and the assessment PCI.
                                </div>
                              ) : (
                                <div
                                  className={cn(
                                    'mt-1 w-full rounded-2xl border bg-white transition-all duration-300',
                                    mainTab === 'live' ? 'border-orange-300' : 'border-violet-300'
                                  )}
                                >
                                  <div className="relative flex w-full flex-col p-px">
                                    {/* Test controls: per-question selector (grade against
                                        ONE question's basis like production, or the whole
                                        scheme) + a badge of which marking basis is present,
                                        so the tutor knows what the grade will rest on. */}
                                    {(() => {
                                      const isTask = testPciSource === 'task'
                                      const activeExt =
                                        isTask && taskBuilder.activeExtensionId
                                          ? taskBuilder.extensions.find(
                                              e => e.id === taskBuilder.activeExtensionId
                                            )
                                          : null
                                      const pci = (
                                        activeExt
                                          ? activeExt.pci
                                          : isTask
                                            ? taskBuilder.taskPci
                                            : assessmentBuilder.taskPci
                                      ) as string | undefined
                                      const spec = isTask
                                        ? activeExt
                                          ? undefined
                                          : taskBuilder.pciSpec
                                        : assessmentBuilder.pciSpec
                                      const testDmi = isTask ? taskDmiItems : assessmentDmiItems
                                      const idOf = (d: DMIQuestion) =>
                                        String(d.id ?? d.questionNumber ?? '')
                                      const known = testDmi.some(d => idOf(d) === testPciQuestionId)
                                      const selected = known
                                        ? testDmi.find(d => idOf(d) === testPciQuestionId)
                                        : undefined

                                      const specKeys = [
                                        'evaluationLogic',
                                        'correctResponseBehavior',
                                        'incorrectResponseBehavior',
                                        'partialUnderstandingBehavior',
                                      ] as const
                                      const hasSpec =
                                        !!spec &&
                                        specKeys.some(
                                          k => typeof spec[k] === 'string' && spec[k]!.trim()
                                        )
                                      const hasPci = (pci?.trim().length ?? 0) > 0 || hasSpec
                                      const hasRubric = selected
                                        ? !!selected.rubric?.trim()
                                        : testDmi.some(d => d.rubric?.trim())
                                      const hasModel = selected
                                        ? !!selected.answer?.trim()
                                        : testDmi.some(d => d.answer?.trim())
                                      const anyBasis = hasPci || hasRubric || hasModel

                                      const Chip = ({
                                        ok,
                                        children,
                                      }: {
                                        ok: boolean
                                        children: React.ReactNode
                                      }) => (
                                        <span
                                          className={cn(
                                            'inline-flex items-center gap-0.5',
                                            ok ? 'text-emerald-600' : 'text-slate-300'
                                          )}
                                        >
                                          {ok ? '✓' : '✗'} {children}
                                        </span>
                                      )

                                      return (
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2 text-xs">
                                          {testDmi.length > 0 && (
                                            <div className="flex items-center gap-1.5 text-slate-500">
                                              <span className="shrink-0">Grade as answer to:</span>
                                              <select
                                                value={known ? testPciQuestionId : ''}
                                                onChange={e => setTestPciQuestionId(e.target.value)}
                                                className="min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                                              >
                                                <option value="">
                                                  Whole scheme (all questions)
                                                </option>
                                                {testDmi.map((d, i) => {
                                                  const id = idOf(d)
                                                  if (!id) return null
                                                  return (
                                                    <option key={id} value={id}>
                                                      {d.questionLabel || `Question ${i + 1}`}
                                                    </option>
                                                  )
                                                })}
                                              </select>
                                            </div>
                                          )}
                                          <div className="flex items-center gap-2">
                                            <span className="text-slate-500">Basis:</span>
                                            <Chip ok={hasPci}>PCI</Chip>
                                            <Chip ok={hasRubric}>Rubric</Chip>
                                            <Chip ok={hasModel}>Model answer</Chip>
                                          </div>
                                          {anyBasis && (
                                            <div className="flex items-center gap-1">
                                              <span className="text-slate-500">Test with:</span>
                                              <select
                                                value={testPciBasis}
                                                aria-label="Marking basis to test against (debug — does not affect student grading)"
                                                onChange={e =>
                                                  setTestPciBasis(
                                                    e.target.value as
                                                      | 'all'
                                                      | 'pci'
                                                      | 'rubric'
                                                      | 'model'
                                                  )
                                                }
                                                title="Debug: isolate one marking basis to see its effect (test only — never affects student grading)"
                                                className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-700"
                                              >
                                                <option value="all">All bases</option>
                                                <option value="pci" disabled={!hasPci}>
                                                  PCI only
                                                </option>
                                                <option value="rubric" disabled={!hasRubric}>
                                                  Rubric only
                                                </option>
                                                <option value="model" disabled={!hasModel}>
                                                  Model answer only
                                                </option>
                                              </select>
                                            </div>
                                          )}
                                          {!anyBasis && (
                                            <span className="text-amber-600">
                                              Add a PCI, rubric, or model answer to grade.
                                            </span>
                                          )}
                                        </div>
                                      )
                                    })()}
                                    <div className="relative flex w-full items-end">
                                      <MentionTextarea
                                        mentionItems={mentionItems}
                                        className="min-h-[64px] w-full flex-1 resize-none border-0 bg-transparent px-4 py-2 pr-24 text-sm shadow-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                        maxRows={3}
                                        value={testPciInputs[testPciActiveTab] || ''}
                                        onChange={(e: any) =>
                                          setTestPciInputs(prev => ({
                                            ...prev,
                                            [testPciActiveTab]: e.target.value,
                                          }))
                                        }
                                        onKeyDown={(e: any) => {
                                          if (e.key === 'Enter' && !e.shiftKey) {
                                            const currentInput =
                                              testPciInputs[testPciActiveTab] || ''
                                            if (currentInput.trim() && !testPciLoading) {
                                              e.preventDefault()
                                              handleTestPciSubmit()
                                            }
                                          }
                                        }}
                                      />
                                      <div className="absolute bottom-1.5 right-2 flex items-center gap-1">
                                        {testPciActiveTab === 'classroom' &&
                                          liveDmiItems.length > 0 && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-8 gap-1 rounded-lg border-[#F17623] px-2 text-xs text-[#F17623] shadow-sm hover:bg-[#FFF4EC]"
                                              title="View the loaded DMI"
                                              onClick={() => setShowLiveDmiModal(true)}
                                            >
                                              <FileText className="h-3.5 w-3.5" />
                                              DMI ({liveDmiItems.length})
                                            </Button>
                                          )}
                                        <Button
                                          size="icon"
                                          className="h-8 w-8 rounded-lg bg-slate-400 shadow-sm hover:bg-slate-500 disabled:opacity-30"
                                          disabled={
                                            !(testPciInputs[testPciActiveTab] || '').trim() ||
                                            testPciLoading
                                          }
                                          onClick={handleTestPciSubmit}
                                          title="Send"
                                        >
                                          <Send className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {mainTab === 'builder' && (
                  <div className="h-full w-full flex-1">
                    {/* COMBINED BUILDER: Task & Assessment Tabs */}
                    <Card
                      padding="none"
                      className={cn(
                        'flex h-full w-full flex-shrink-0 flex-col overflow-hidden rounded-[20px] border-0 bg-[#FFFFFF] shadow-[0_18px_45px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]'
                      )}
                    >
                      <div
                        className={cn(
                          'sticky top-0 z-10 flex h-9 shrink-0 items-center justify-center rounded-t-[20px] px-4 text-sm font-semibold text-white transition-colors duration-300',
                          mainBuilderTab === 'assessment'
                            ? 'bg-gradient-to-br from-[#EC4899] to-[#DB2777]'
                            : 'bg-gradient-to-br from-[#2563EB] to-[#1D4ED8]'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Wrench className="h-4 w-4" />
                          Build
                        </div>
                      </div>
                      <CardContent className="flex h-full flex-col overflow-hidden px-4 pb-4 pt-4">
                        <Tabs
                          value={mainBuilderTab}
                          onValueChange={v => setMainBuilderTab(v as 'task' | 'assessment')}
                          className="flex h-full w-full flex-col"
                        >
                          {/* Main Builder Tabs — nested pill design */}
                          <div className="mb-4 flex w-full items-center justify-between gap-4">
                            {/* Left: current task name */}
                            <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-sm font-semibold text-[#1F2933]">
                              {mainBuilderTab === 'task' && (
                                <input
                                  className="w-full truncate bg-transparent outline-none placeholder:text-gray-500 focus-visible:border-b focus-visible:border-blue-300"
                                  placeholder="Select or name a Task"
                                  readOnly={!canEdit}
                                  value={
                                    taskBuilder.activeExtensionId
                                      ? taskBuilder.extensions.find(
                                          x => x.id === taskBuilder.activeExtensionId
                                        )?.name || ''
                                      : taskBuilder.title || ''
                                  }
                                  onChange={e => {
                                    const sanitized = e.target.value
                                      .replace(/[@;'"]/g, '')
                                      .substring(0, 25)
                                    setTaskBuilder(prev => {
                                      if (prev.activeExtensionId) {
                                        return {
                                          ...prev,
                                          extensions: prev.extensions.map(x =>
                                            x.id === prev.activeExtensionId
                                              ? { ...x, name: sanitized }
                                              : x
                                          ),
                                        }
                                      }
                                      return { ...prev, title: sanitized }
                                    })
                                  }}
                                />
                              )}
                            </div>

                            <TabsList className="grid h-[46px] w-[400px] shrink-0 grid-cols-2 gap-2 bg-transparent p-0 shadow-none">
                              <TabsTrigger
                                value="task"
                                className="relative flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-transparent py-2.5 text-sm font-medium text-[#667085] transition-all data-[state=active]:border-[#2563EB] data-[state=active]:bg-[#2563EB] data-[state=active]:font-semibold data-[state=active]:text-white data-[state=inactive]:hover:bg-slate-50"
                              >
                                <Wrench className="h-4 w-4 shrink-0" />
                                Task Builder
                              </TabsTrigger>
                              <TabsTrigger
                                value="assessment"
                                className="relative flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-transparent py-2.5 text-sm font-medium text-[#667085] transition-all data-[state=active]:border-[#EC4899] data-[state=active]:bg-[#EC4899] data-[state=active]:font-semibold data-[state=active]:text-white data-[state=inactive]:hover:bg-slate-50"
                              >
                                <FileCheck2 className="h-4 w-4 shrink-0" />
                                Assessment Builder
                              </TabsTrigger>
                            </TabsList>

                            {/* Right: current assessment name */}
                            <div className="flex min-w-0 flex-1 items-center justify-end gap-2 px-3 text-sm font-semibold text-[#1F2933]">
                              {mainBuilderTab === 'assessment' && (
                                <input
                                  className="w-full truncate bg-transparent text-right outline-none placeholder:text-gray-500 focus-visible:border-b focus-visible:border-purple-300"
                                  placeholder="Select or name an Assessment"
                                  readOnly={!canEdit}
                                  value={assessmentBuilder.title || ''}
                                  onChange={e => {
                                    const sanitized = e.target.value
                                      .replace(/[@;'"]/g, '')
                                      .substring(0, 25)
                                    setAssessmentBuilder(prev => ({
                                      ...prev,
                                      title: sanitized,
                                    }))
                                  }}
                                />
                              )}
                            </div>
                          </div>

                          {/* Content area */}
                          <div className="relative min-h-0 flex-1 rounded-none border-0 bg-transparent p-0 shadow-none">
                            {/* Task Builder Tab */}
                            <TabsContent
                              value="task"
                              className="flex h-full flex-col space-y-px overflow-hidden data-[state=inactive]:hidden"
                            >
                              <div className="flex min-h-0 flex-1 gap-px overflow-hidden">
                                {/* Main content with tabs */}
                                <div className="flex flex-1 flex-col overflow-hidden">
                                  <Tabs
                                    value={taskBuilderActiveTab}
                                    onValueChange={v => {
                                      setTaskBuilderActiveTab(v as 'content' | 'pci')
                                    }}
                                    className="flex h-full w-full flex-col"
                                  >
                                    <TabsList className="mb-px grid h-[46px] w-full grid-cols-2 gap-2 rounded-xl bg-transparent p-0 shadow-none">
                                      <TabsTrigger
                                        value="content"
                                        className="w-full rounded-xl border border-[#E5E7EB] text-sm font-medium text-[#667085] transition-all data-[state=active]:border-[#CFE0FF] data-[state=active]:bg-[#EEF4FF] data-[state=inactive]:bg-white data-[state=active]:font-medium data-[state=active]:text-[#2B5FB8] data-[state=inactive]:hover:bg-slate-50"
                                      >
                                        <LayoutPanelTop className="mr-2 h-4 w-4 shrink-0" />
                                        Slide
                                      </TabsTrigger>
                                      <TabsTrigger
                                        value="pci"
                                        className="w-full rounded-xl border border-[#E5E7EB] text-sm font-medium text-[#667085] transition-all data-[state=active]:border-[#CFE0FF] data-[state=active]:bg-[#EEF4FF] data-[state=inactive]:bg-white data-[state=active]:font-medium data-[state=active]:text-[#2B5FB8] data-[state=inactive]:hover:bg-slate-50"
                                      >
                                        <Brain className="mr-2 h-4 w-4 shrink-0" />
                                        PCI
                                      </TabsTrigger>
                                    </TabsList>
                                    <TabsContent
                                      value="content"
                                      className="mt-3 flex h-full min-h-0 flex-1 flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                    >
                                      {/* View controls: switch between the text
                                          editor (left) and the document (right),
                                          or show both side by side. Only relevant
                                          once an uploaded document is present. */}
                                      {hasUploadedTaskDocument && (
                                        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-3">
                                          <div className="flex items-center gap-0.5 self-start rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
                                            {[
                                              {
                                                key: 'text',
                                                label: 'Text',
                                                icon: <Type className="h-3.5 w-3.5" />,
                                                active: taskTextVisible && !taskPdfVisible,
                                                onClick: () => {
                                                  setTaskTextVisible(true)
                                                  setTaskPdfVisible(false)
                                                },
                                              },
                                              {
                                                key: 'split',
                                                label: 'Split',
                                                icon: <LayoutPanelTop className="h-3.5 w-3.5" />,
                                                active: taskTextVisible && taskPdfVisible,
                                                onClick: () => {
                                                  setTaskTextVisible(true)
                                                  setTaskPdfVisible(true)
                                                },
                                              },
                                              {
                                                key: 'document',
                                                label: 'Document',
                                                icon: <FileText className="h-3.5 w-3.5" />,
                                                active: !taskTextVisible && taskPdfVisible,
                                                onClick: () => {
                                                  setTaskTextVisible(false)
                                                  setTaskPdfVisible(true)
                                                },
                                              },
                                            ].map(view => (
                                              <button
                                                key={view.key}
                                                type="button"
                                                onClick={view.onClick}
                                                title={`${view.label} view`}
                                                aria-pressed={view.active}
                                                className={cn(
                                                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                                                  view.active
                                                    ? 'bg-[#EEF4FF] text-[#2B5FB8]'
                                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                                                )}
                                              >
                                                {view.icon}
                                                {view.label}
                                              </button>
                                            ))}
                                          </div>
                                          {docSupportsFigureAnalysis(currentTaskDocument) && (
                                            <label
                                              className="flex cursor-pointer items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                                              title="Also send the document's images to the AI so it can read diagrams and figures the extracted text can't capture (slower)."
                                            >
                                              <input
                                                type="checkbox"
                                                checked={dmiAnalyzeFigures}
                                                onChange={e =>
                                                  setDmiAnalyzeFigures(e.target.checked)
                                                }
                                                className="h-3.5 w-3.5 rounded border-slate-300 accent-[#2B5FB8]"
                                              />
                                              <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                                              Analyze diagrams
                                            </label>
                                          )}
                                        </div>
                                      )}
                                      <div
                                        className="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm"
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={(e: any) => {
                                          if (!canEdit) return
                                          handleDragFiles(
                                            e,
                                            text => {
                                              const activeExt = taskBuilder.activeExtensionId
                                              const currentContent = activeExt
                                                ? taskBuilder.extensions.find(
                                                    ext => ext.id === activeExt
                                                  )?.content || ''
                                                : taskBuilder.taskContent
                                              const combined =
                                                currentContent +
                                                (currentContent ? '\n\n' : '') +
                                                text
                                              if (isTaskSlideOverflowing(combined)) {
                                                toast.error(
                                                  'Dropped text would exceed the slide area'
                                                )
                                                return
                                              }
                                              setTaskBuilder(prev => {
                                                if (prev.activeExtensionId) {
                                                  return {
                                                    ...prev,
                                                    extensions: prev.extensions.map(ext =>
                                                      ext.id === prev.activeExtensionId
                                                        ? { ...ext, content: combined }
                                                        : ext
                                                    ),
                                                  }
                                                }
                                                return { ...prev, taskContent: combined }
                                              })
                                            },
                                            'task'
                                          )
                                        }}
                                      >
                                        {!hasUploadedTaskDocument ? (
                                          // Text-only task: locked 1100 x 620 slide canvas.
                                          // No PDF preview here; the snapshot is generated only when entering Test/Live.
                                          <div className="flex h-full w-full items-center justify-center overflow-auto bg-slate-50">
                                            <div className="relative h-[620px] w-[1100px] flex-shrink-0 bg-white shadow-md">
                                              <AutoTextarea
                                                ref={taskTextareaRef}
                                                className="h-full w-full resize-none overflow-hidden border-0 bg-transparent p-12 text-[20px] leading-relaxed text-[#1F2933] focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                                disableAutoResize
                                                readOnly={!canEdit}
                                                placeholder="Type the task content here — or load a document above to work from it."
                                                value={
                                                  taskBuilder.activeExtensionId
                                                    ? taskBuilder.extensions.find(
                                                        e => e.id === taskBuilder.activeExtensionId
                                                      )?.content || ''
                                                    : taskBuilder.taskContent
                                                }
                                                onChange={(e: any) => {
                                                  const target = e.target as HTMLTextAreaElement
                                                  if (target.scrollHeight > target.clientHeight) {
                                                    return
                                                  }
                                                  const newContent = target.value
                                                  if (
                                                    !loadedTaskId &&
                                                    !taskBuilder.activeExtensionId
                                                  ) {
                                                    autoCreateTask()
                                                  }
                                                  if (taskBuilder.activeExtensionId) {
                                                    setTaskBuilder(prev => ({
                                                      ...prev,
                                                      extensions: prev.extensions.map(ext =>
                                                        ext.id === prev.activeExtensionId
                                                          ? { ...ext, content: newContent }
                                                          : ext
                                                      ),
                                                    }))
                                                  } else {
                                                    setTaskBuilder(prev => ({
                                                      ...prev,
                                                      taskContent: newContent,
                                                    }))
                                                  }
                                                }}
                                              />
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="flex h-full w-full flex-row">
                                            {taskTextVisible && (
                                              <div
                                                className={cn(
                                                  'relative flex h-full flex-col bg-[#FBFCFD]',
                                                  taskPdfVisible ? 'w-1/2 border-r' : 'w-full'
                                                )}
                                              >
                                                <AutoTextarea
                                                  className="h-full min-h-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent p-4 text-[#1F2933] focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                                  style={{ fontSize: `${extractedTextFontSize}px` }}
                                                  disableAutoResize
                                                  readOnly={!canEdit}
                                                  placeholder="Type the task content here — or load a document above to work from it."
                                                  onDrop={(e: any) =>
                                                    handleDragFiles(
                                                      e,
                                                      text => {
                                                        setTaskBuilder(prev => {
                                                          if (prev.activeExtensionId) {
                                                            const ext = prev.extensions.find(
                                                              x => x.id === prev.activeExtensionId
                                                            )
                                                            const combined = ext
                                                              ? ext.content +
                                                                (ext.content ? '\n\n' : '') +
                                                                text
                                                              : text
                                                            return {
                                                              ...prev,
                                                              extensions: prev.extensions.map(x =>
                                                                x.id === prev.activeExtensionId
                                                                  ? { ...x, content: combined }
                                                                  : x
                                                              ),
                                                            }
                                                          } else {
                                                            return {
                                                              ...prev,
                                                              taskContent:
                                                                prev.taskContent +
                                                                (prev.taskContent ? '\n\n' : '') +
                                                                text,
                                                            }
                                                          }
                                                        })
                                                      },
                                                      'task'
                                                    )
                                                  }
                                                  value={
                                                    taskBuilder.activeExtensionId
                                                      ? taskBuilder.extensions.find(
                                                          e =>
                                                            e.id === taskBuilder.activeExtensionId
                                                        )?.content || ''
                                                      : taskBuilder.taskContent
                                                  }
                                                  onChange={(e: any) => {
                                                    const newContent = e.target.value
                                                    if (
                                                      !loadedTaskId &&
                                                      !taskBuilder.activeExtensionId
                                                    ) {
                                                      autoCreateTask()
                                                    }
                                                    if (taskBuilder.activeExtensionId) {
                                                      setTaskBuilder(prev => {
                                                        return {
                                                          ...prev,
                                                          extensions: prev.extensions.map(ext =>
                                                            ext.id === prev.activeExtensionId
                                                              ? { ...ext, content: newContent }
                                                              : ext
                                                          ),
                                                        }
                                                      })
                                                    } else {
                                                      setTaskBuilder(prev => ({
                                                        ...prev,
                                                        taskContent: newContent,
                                                      }))
                                                    }
                                                  }}
                                                />
                                                {/* Floating font size control */}
                                                <div
                                                  className="absolute bottom-6 right-6 z-20 flex origin-bottom-right scale-150 items-center gap-1 rounded-md px-2 py-1 text-white"
                                                  style={{
                                                    background: 'rgba(40,40,40,0.78)',
                                                    backdropFilter: 'blur(8px)',
                                                  }}
                                                >
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setExtractedTextFontSize(
                                                        Math.max(10, extractedTextFontSize - 2)
                                                      )
                                                    }
                                                    className="cursor-pointer px-1 py-0.5 text-xs opacity-80 hover:opacity-100"
                                                  >
                                                    -
                                                  </button>
                                                  <span className="min-w-[1.5rem] text-center text-[11px] font-medium">
                                                    {extractedTextFontSize}px
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setExtractedTextFontSize(
                                                        Math.min(32, extractedTextFontSize + 2)
                                                      )
                                                    }
                                                    className="cursor-pointer px-1 py-0.5 text-xs opacity-80 hover:opacity-100"
                                                  >
                                                    +
                                                  </button>
                                                </div>
                                              </div>
                                            )}

                                            {/* Right Panel (Preview) */}
                                            {taskPdfVisible && (
                                              <div
                                                className={cn(
                                                  'relative flex h-full flex-col bg-[#FBFCFD]',
                                                  taskTextVisible ? 'w-1/2' : 'w-full'
                                                )}
                                              >
                                                <div className="relative min-h-0 flex-1 overflow-hidden">
                                                  {currentTaskDocument?.mimeType ===
                                                    'application/pdf' ||
                                                  (currentTaskDocument?.fileKey &&
                                                    (!currentTaskDocument?.mimeType ||
                                                      currentTaskDocument?.mimeType ===
                                                        'application/pdf')) ? (
                                                    <PDFViewer
                                                      key={
                                                        currentTaskDocument.fileUrl ||
                                                        currentTaskDocument.fileKey ||
                                                        'task-doc'
                                                      }
                                                      fileUrl={currentTaskDocument.fileUrl || ''}
                                                      fileKey={currentTaskDocument.fileKey}
                                                      className="absolute inset-0 h-full w-full"
                                                      fitToScreen
                                                      onHidePreview={() => {
                                                        if (!taskTextVisible)
                                                          setTaskTextVisible(true)
                                                        setTaskPdfVisible(false)
                                                      }}
                                                    />
                                                  ) : currentTaskDocument &&
                                                    currentTaskDocument.mimeType !==
                                                      'application/pdf' &&
                                                    currentTaskDocument.mimeType?.startsWith(
                                                      'image/'
                                                    ) ? (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-white p-4">
                                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                                      <img
                                                        src={
                                                          currentTaskDocument.fileKey
                                                            ? `/api/proxy-file?key=${encodeURIComponent(currentTaskDocument.fileKey)}`
                                                            : currentTaskDocument.fileUrl
                                                        }
                                                        alt={currentTaskDocument.fileName}
                                                        className="max-h-full max-w-full object-contain"
                                                      />
                                                    </div>
                                                  ) : currentTaskDocument &&
                                                    currentTaskDocument.mimeType !==
                                                      'application/pdf' &&
                                                    !currentTaskDocument.mimeType?.startsWith(
                                                      'image/'
                                                    ) ? (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white p-6">
                                                      <FileText className="mb-4 h-16 w-16 text-blue-500" />
                                                      <a
                                                        href={
                                                          currentTaskDocument.fileKey
                                                            ? `/api/proxy-file?key=${encodeURIComponent(currentTaskDocument.fileKey)}`
                                                            : currentTaskDocument.fileUrl
                                                        }
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-center text-sm font-medium text-blue-600 hover:underline"
                                                      >
                                                        Open {currentTaskDocument.fileName} in new
                                                        tab
                                                      </a>
                                                    </div>
                                                  ) : (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                                                      <FileText className="mb-4 h-16 w-16 text-gray-300" />
                                                      <p className="text-lg font-medium text-gray-500">
                                                        No document selected
                                                      </p>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      {/* Uploaded Files List - only show for task (not extensions) */}
                                      {/* Upload button - only for task (not extensions) */}
                                      {/* Assets Folder added to Slide Tab removed from here */}
                                    </TabsContent>
                                    <TabsContent
                                      value="pci"
                                      className="mt-0.5 flex h-full min-h-0 flex-1 flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                    >
                                      <div
                                        data-pci-container="task"
                                        className="relative flex h-full min-h-0 flex-col rounded-2xl border border-blue-200 bg-white p-4 shadow-sm"
                                      >
                                        <div
                                          ref={taskPciScrollRef}
                                          className="min-h-0 flex-1 space-y-4 overflow-y-auto p-1"
                                        >
                                          {activeTaskPciMessages.length === 0 && (
                                            <p className="text-muted-foreground text-xs">
                                              Start a PCI chat to build instructions with the
                                              assistant.
                                            </p>
                                          )}
                                          {activeTaskPciMessages.map((msg, idx) => (
                                            <div
                                              key={idx}
                                              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                            >
                                              <div
                                                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                                                  msg.role === 'user'
                                                    ? 'bg-blue-50 text-gray-900'
                                                    : 'bg-gray-100 text-gray-800'
                                                }`}
                                              >
                                                <div className="whitespace-pre-wrap">
                                                  {msg.content}
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                          {taskPciLoading && (
                                            <div className="flex justify-start">
                                              <div className="flex items-center gap-px rounded-lg bg-gray-100 px-px py-px text-sm">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                <span className="text-xs text-gray-600">
                                                  Thinking...
                                                </span>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                        <div className="mt-auto p-0">
                                          {taskPciDraft && (
                                            <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                                              <span>
                                                Rubric ready — click Apply to save it as your
                                                marking policy.
                                              </span>
                                              <Button
                                                size="sm"
                                                className="h-7 bg-emerald-600 text-white hover:bg-emerald-500"
                                                onClick={applyTaskPciDraft}
                                              >
                                                Apply to PCI
                                              </Button>
                                            </div>
                                          )}
                                          {taskPciErrorHint && (
                                            <div className="mb-px rounded-md border border-rose-200 bg-rose-50 px-px py-px text-xs text-rose-700">
                                              PCI assistant error: {taskPciErrorHint}
                                            </div>
                                          )}
                                          <GuardrailWarningsBanner
                                            warnings={taskPciGuardrailWarnings}
                                          />
                                          <div
                                            data-pci-anchor="chat-input"
                                            className="mt-2 w-full rounded-2xl border border-blue-300 bg-white/90 backdrop-blur-md transition-all duration-300"
                                          >
                                            <div className="relative flex w-full flex-col p-px">
                                              <div className="flex w-full flex-col">
                                                <MentionTextarea
                                                  mentionItems={mentionItems}
                                                  className="min-h-[100px] w-full flex-1 border-0 bg-transparent px-4 py-4 text-sm shadow-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                                  value={activeTaskPciInput}
                                                  readOnly={!canEdit}
                                                  onChange={(e: any) => {
                                                    setPciInput(
                                                      taskBuilder.activeExtensionId
                                                        ? {
                                                            kind: 'taskExtension',
                                                            id: taskBuilder.activeExtensionId,
                                                          }
                                                        : { kind: 'task' },
                                                      e.target.value
                                                    )
                                                  }}
                                                  onKeyDown={(e: any) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                      e.preventDefault()
                                                      handlePciSend('task')
                                                    }
                                                  }}
                                                />
                                                <div className="flex w-full items-center justify-end gap-2 px-2 pb-2">
                                                  <Button
                                                    type="button"
                                                    variant="default"
                                                    size="icon"
                                                    className="h-8 w-8 shrink-0 rounded-full"
                                                    disabled={
                                                      taskPciLoading || !activeTaskPciInput.trim()
                                                    }
                                                    data-pci-anchor="send"
                                                    onClick={() => handlePciSend('task')}
                                                    aria-label="Send"
                                                  >
                                                    {taskPciLoading ? (
                                                      <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                      <Send className="h-4 w-4" />
                                                    )}
                                                  </Button>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </TabsContent>
                                  </Tabs>
                                </div>
                              </div>
                            </TabsContent>

                            {/* Assessment Builder Tab */}
                            <TabsContent
                              value="assessment"
                              className="flex h-full flex-col space-y-px overflow-hidden data-[state=inactive]:hidden"
                            >
                              <div className="flex min-h-0 flex-1 gap-px overflow-hidden">
                                {/* Main content with tabs */}
                                <div className="flex flex-1 flex-col overflow-hidden">
                                  <Tabs
                                    value={assessmentBuilderActiveTab}
                                    onValueChange={v => {
                                      setAssessmentBuilderActiveTab(v as 'content' | 'pci')
                                    }}
                                    className="flex h-full w-full flex-col"
                                  >
                                    <TabsList className="mb-px grid h-[46px] w-full grid-cols-2 gap-2 rounded-xl bg-transparent p-0 shadow-none">
                                      <TabsTrigger
                                        value="content"
                                        className="w-full rounded-xl border border-[#E5E7EB] text-sm font-medium text-[#667085] transition-all data-[state=active]:border-[#FBCFE8] data-[state=active]:bg-[#FDF2F8] data-[state=inactive]:bg-white data-[state=active]:font-medium data-[state=active]:text-[#EC4899] data-[state=inactive]:hover:bg-slate-50"
                                      >
                                        <LayoutPanelTop className="mr-2 h-4 w-4 shrink-0" />
                                        Assessment
                                      </TabsTrigger>
                                      <TabsTrigger
                                        value="pci"
                                        className="w-full rounded-xl border border-[#E5E7EB] text-sm font-medium text-[#667085] transition-all data-[state=active]:border-[#FBCFE8] data-[state=active]:bg-[#FDF2F8] data-[state=inactive]:bg-white data-[state=active]:font-medium data-[state=active]:text-[#EC4899] data-[state=inactive]:hover:bg-slate-50"
                                      >
                                        <Brain className="mr-2 h-4 w-4 shrink-0" />
                                        PCI
                                      </TabsTrigger>
                                    </TabsList>
                                    <TabsContent
                                      value="content"
                                      className="mt-3 flex h-full min-h-0 flex-1 flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                    >
                                      {/* View controls: switch between the text
                                          editor (left) and the document (right),
                                          or show both side by side. Only relevant
                                          once a document is present. */}
                                      {hasAssessmentDocument && (
                                        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-3">
                                          <div className="flex items-center gap-0.5 self-start rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
                                            {[
                                              {
                                                key: 'text',
                                                label: 'Text',
                                                icon: <Type className="h-3.5 w-3.5" />,
                                                active:
                                                  assessmentTextVisible && !assessmentPdfVisible,
                                                onClick: () => {
                                                  setAssessmentTextVisible(true)
                                                  setAssessmentPdfVisible(false)
                                                },
                                              },
                                              {
                                                key: 'split',
                                                label: 'Split',
                                                icon: <LayoutPanelTop className="h-3.5 w-3.5" />,
                                                active:
                                                  assessmentTextVisible && assessmentPdfVisible,
                                                onClick: () => {
                                                  setAssessmentTextVisible(true)
                                                  setAssessmentPdfVisible(true)
                                                },
                                              },
                                              {
                                                key: 'document',
                                                label: 'Document',
                                                icon: <FileText className="h-3.5 w-3.5" />,
                                                active:
                                                  !assessmentTextVisible && assessmentPdfVisible,
                                                onClick: () => {
                                                  setAssessmentTextVisible(false)
                                                  setAssessmentPdfVisible(true)
                                                },
                                              },
                                            ].map(view => (
                                              <button
                                                key={view.key}
                                                type="button"
                                                onClick={view.onClick}
                                                title={`${view.label} view`}
                                                aria-pressed={view.active}
                                                className={cn(
                                                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                                                  view.active
                                                    ? 'bg-[#EEF4FF] text-[#2B5FB8]'
                                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                                                )}
                                              >
                                                {view.icon}
                                                {view.label}
                                              </button>
                                            ))}
                                          </div>
                                          {docSupportsFigureAnalysis(currentAssessmentDocument) && (
                                            <label
                                              className="flex cursor-pointer items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                                              title="Also send the document's images to the AI so it can read diagrams and figures the extracted text can't capture (slower)."
                                            >
                                              <input
                                                type="checkbox"
                                                checked={dmiAnalyzeFigures}
                                                onChange={e =>
                                                  setDmiAnalyzeFigures(e.target.checked)
                                                }
                                                className="h-3.5 w-3.5 rounded border-slate-300 accent-[#2B5FB8]"
                                              />
                                              <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                                              Analyze diagrams
                                            </label>
                                          )}
                                        </div>
                                      )}
                                      <div
                                        className="relative flex min-h-0 flex-1 flex-row overflow-hidden rounded-2xl border border-pink-200 bg-white shadow-sm"
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={(e: any) => {
                                          if (!canEdit) return
                                          handleDragFiles(
                                            e,
                                            text => {
                                              setAssessmentBuilder(prev => ({
                                                ...prev,
                                                taskContent:
                                                  prev.taskContent +
                                                  (prev.taskContent ? '\n\n' : '') +
                                                  text,
                                              }))
                                            },
                                            'assessment'
                                          )
                                        }}
                                      >
                                        {/* Left Panel (Text) */}
                                        {assessmentTextVisible && (
                                          <div
                                            className={cn(
                                              'relative flex h-full flex-col bg-[#FBFCFD]',
                                              assessmentPdfVisible ? 'w-1/2' : 'w-full'
                                            )}
                                          >
                                            <AutoTextarea
                                              className="h-full min-h-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent p-4 text-[#1F2933] focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                              style={{ fontSize: `${extractedTextFontSize}px` }}
                                              disableAutoResize
                                              readOnly={!canEdit}
                                              placeholder="Type your assessment questions here — or load a document above to work from it."
                                              onDrop={(e: any) =>
                                                handleDragFiles(
                                                  e,
                                                  text => {
                                                    setAssessmentBuilder(prev => {
                                                      const combined =
                                                        prev.taskContent +
                                                        (prev.taskContent ? '\n\n' : '') +
                                                        text
                                                      return {
                                                        ...prev,
                                                        taskContent: combined,
                                                      }
                                                    })
                                                  },
                                                  'assessment'
                                                )
                                              }
                                              value={assessmentBuilder.taskContent}
                                              onChange={(e: any) => {
                                                const newContent = e.target.value
                                                if (!loadedAssessmentId) {
                                                  autoCreateAssessment()
                                                }
                                                setAssessmentBuilder(prev => ({
                                                  ...prev,
                                                  taskContent: newContent,
                                                }))
                                              }}
                                            />
                                            {/* Floating font size control */}
                                            <div
                                              className="absolute bottom-6 right-6 z-20 flex origin-bottom-right scale-150 items-center gap-1 rounded-md px-2 py-1 text-white"
                                              style={{
                                                background: 'rgba(40,40,40,0.78)',
                                                backdropFilter: 'blur(8px)',
                                              }}
                                            >
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setExtractedTextFontSize(
                                                    Math.max(10, extractedTextFontSize - 2)
                                                  )
                                                }
                                                className="cursor-pointer px-1 py-0.5 text-xs opacity-80 hover:opacity-100"
                                              >
                                                -
                                              </button>
                                              <span className="min-w-[1.5rem] text-center text-[11px] font-medium">
                                                {extractedTextFontSize}px
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setExtractedTextFontSize(
                                                    Math.min(32, extractedTextFontSize + 2)
                                                  )
                                                }
                                                className="cursor-pointer px-1 py-0.5 text-xs opacity-80 hover:opacity-100"
                                              >
                                                +
                                              </button>
                                            </div>
                                          </div>
                                        )}

                                        {/* Right Panel (Preview) */}
                                        {assessmentPdfVisible && (
                                          <div
                                            className={cn(
                                              'relative flex h-full flex-col bg-[#FBFCFD]',
                                              assessmentTextVisible ? 'w-1/2' : 'w-full'
                                            )}
                                          >
                                            <div className="relative min-h-0 flex-1 overflow-hidden">
                                              {currentAssessmentDocument?.mimeType ===
                                                'application/pdf' ||
                                              (currentAssessmentDocument?.fileKey &&
                                                (!currentAssessmentDocument?.mimeType ||
                                                  currentAssessmentDocument?.mimeType ===
                                                    'application/pdf')) ? (
                                                <PDFViewer
                                                  key={
                                                    currentAssessmentDocument.fileUrl ||
                                                    currentAssessmentDocument.fileKey ||
                                                    'assessment-doc'
                                                  }
                                                  fileUrl={currentAssessmentDocument.fileUrl || ''}
                                                  fileKey={currentAssessmentDocument.fileKey}
                                                  className="absolute inset-0 h-full w-full"
                                                  defaultScale={0.75}
                                                  onHidePreview={() => {
                                                    if (!assessmentTextVisible)
                                                      setAssessmentTextVisible(true)
                                                    setAssessmentPdfVisible(false)
                                                  }}
                                                />
                                              ) : currentAssessmentDocument &&
                                                currentAssessmentDocument.mimeType !==
                                                  'application/pdf' &&
                                                currentAssessmentDocument.mimeType?.startsWith(
                                                  'image/'
                                                ) ? (
                                                <div className="absolute inset-0 flex items-center justify-center bg-white p-4">
                                                  <div className="relative h-full w-full">
                                                    <NextImage
                                                      src={
                                                        currentAssessmentDocument.fileKey
                                                          ? `/api/proxy-file?key=${encodeURIComponent(currentAssessmentDocument.fileKey)}`
                                                          : currentAssessmentDocument.fileUrl
                                                      }
                                                      alt={currentAssessmentDocument.fileName}
                                                      fill
                                                      className="object-contain"
                                                      unoptimized
                                                    />
                                                  </div>
                                                </div>
                                              ) : currentAssessmentDocument &&
                                                currentAssessmentDocument.fileUrl ? (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white p-6">
                                                  <FileText className="mb-4 h-16 w-16 text-blue-500" />
                                                  <a
                                                    href={
                                                      currentAssessmentDocument.fileKey
                                                        ? `/api/proxy-file?key=${encodeURIComponent(currentAssessmentDocument.fileKey)}`
                                                        : currentAssessmentDocument.fileUrl
                                                    }
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-center text-sm font-medium text-blue-600 hover:underline"
                                                  >
                                                    Open {currentAssessmentDocument.fileName} in new
                                                    tab
                                                  </a>
                                                </div>
                                              ) : (
                                                <div className="flex h-full flex-col items-center justify-center text-gray-600">
                                                  <FileText className="mb-4 h-16 w-16 text-gray-300" />
                                                  <p className="text-lg font-medium text-gray-600">
                                                    No document selected
                                                  </p>
                                                  <p className="mt-2 text-sm">
                                                    Drag & drop an asset here, or use the Load
                                                    button
                                                  </p>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      {/* Uploaded Files List - only show for assessment (not extensions) */}
                                      {/* Upload button - only for assessment (not extensions) */}
                                      {/* Assets Folder added to Slide Tab removed from here */}
                                    </TabsContent>
                                    <TabsContent
                                      value="pci"
                                      className="mt-2 flex h-full min-h-0 flex-1 flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                    >
                                      <div
                                        data-pci-container="assessment"
                                        className="relative flex h-full min-h-0 flex-col rounded-2xl border border-pink-200 bg-white p-4 shadow-sm"
                                      >
                                        {/* Centered Pill for Test, Generate DMI, and Version History */}
                                        <div className="pointer-events-none absolute left-1/2 top-0 z-20 flex -translate-x-1/2 items-center justify-center">
                                          <div className="pointer-events-auto flex h-11 items-center gap-1 rounded-b-xl border-x border-b border-[#E5E7EB] bg-white/90 px-2 shadow-sm backdrop-blur-sm">
                                            <span className="text-xs font-light text-gray-600">
                                              (
                                            </span>

                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              data-pci-anchor="generate-dmi"
                                              className="h-6 px-2 text-xs font-medium text-gray-600 hover:text-gray-900"
                                              disabled={dmiGenerating || !canEdit}
                                              onClick={() => {
                                                if (!canEdit) return
                                                const content = assessmentBuilder.taskContent
                                                const hasPdf =
                                                  currentAssessmentDocument?.mimeType ===
                                                  'application/pdf'
                                                if (!content.trim() && !hasPdf) {
                                                  toast.error(
                                                    'Please add content to the Assessment tab or load a PDF first'
                                                  )
                                                  return
                                                }
                                                handleGenerateDMI('assessment')
                                              }}
                                            >
                                              {dmiGenerating ? (
                                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                              ) : null}
                                              {/* A loaded document auto-generates the DMI, so the
                                                  manual control becomes a re-run; only a text-only
                                                  assessment still needs an initial "Generate". */}
                                              {currentAssessmentDocument?.mimeType ===
                                                'application/pdf' || assessmentDmiItems.length > 0
                                                ? 'Regenerate DMI'
                                                : 'Generate DMI'}
                                            </Button>

                                            {assessmentDmiItems.length > 0 && (
                                              <>
                                                <div className="h-3 w-px bg-gray-300" />
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  data-pci-anchor="edit-marks"
                                                  className="h-6 px-2 text-xs font-medium text-[#F17623] hover:text-[#d9651a]"
                                                  disabled={!canEdit}
                                                  title="Set marks per question and review the AI answers"
                                                  onClick={() =>
                                                    setDmiEditor({ source: 'assessment' })
                                                  }
                                                >
                                                  Edit marks & answers
                                                </Button>
                                              </>
                                            )}

                                            <div className="h-3 w-px bg-gray-300" />

                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 px-2 text-xs font-medium text-gray-600 hover:text-gray-900"
                                              onClick={() => setShowDmiVersionList(true)}
                                              title="View DMI Versions"
                                            >
                                              <History className="h-3 w-3" />
                                              {assessmentDmiVersions.length > 0 && (
                                                <span className="ml-1">
                                                  ({assessmentDmiVersions.length})
                                                </span>
                                              )}
                                            </Button>

                                            <span className="text-xs font-light text-gray-600">
                                              )
                                            </span>
                                          </div>
                                        </div>

                                        <div className="mt-6 min-h-0 flex-1 space-y-4 overflow-y-auto p-1">
                                          <PciGuidance kind="assessment" />
                                          {renderCurrentPci(
                                            'assessment',
                                            assessmentBuilder.taskPci
                                          )}
                                          {!assessmentDmiReady && (
                                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
                                              <p className="font-semibold">
                                                Set up the questions &amp; marking scheme first
                                              </p>
                                              <p className="mt-1">
                                                The marking-policy chat unlocks once your DMI has
                                                questions, marks, and an answer key or rubric.{' '}
                                                {assessmentDmiItems.length === 0
                                                  ? 'Generate the DMI from your document to begin.'
                                                  : assessmentDmiTotalMarks === 0
                                                    ? 'Open “Edit marks & answers” to set the marks.'
                                                    : 'Open “Edit marks & answers” to add the answer key / rubric.'}
                                              </p>
                                              {canEdit && (
                                                <div className="mt-2 flex gap-2">
                                                  {assessmentDmiItems.length === 0 ? (
                                                    <button
                                                      type="button"
                                                      disabled={dmiGenerating}
                                                      onClick={() =>
                                                        handleGenerateDMI('assessment')
                                                      }
                                                      className="rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                                                    >
                                                      {dmiGenerating
                                                        ? 'Generating…'
                                                        : 'Generate DMI'}
                                                    </button>
                                                  ) : (
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        setDmiEditor({ source: 'assessment' })
                                                      }
                                                      className="rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700"
                                                    >
                                                      Edit marks &amp; answers
                                                    </button>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                          <PciSpecSoFar
                                            spec={
                                              assessmentPciSpecSoFarMap[loadedAssessmentId || '']
                                            }
                                            board={pciBoard}
                                            subject={pciCategory}
                                            editable={canEdit}
                                            onEditField={(key, value) =>
                                              editSpecSoFar(
                                                {
                                                  kind: 'assessment',
                                                  id: loadedAssessmentId || '',
                                                },
                                                key,
                                                value
                                              )
                                            }
                                          />
                                          {assessmentDmiReady &&
                                            (
                                              assessmentPciMessagesMap[loadedAssessmentId || ''] ||
                                              []
                                            ).length === 0 && (
                                              <p className="text-muted-foreground text-xs">
                                                Start a PCI chat to build instructions with the
                                                assistant.
                                              </p>
                                            )}
                                          {(
                                            assessmentPciMessagesMap[loadedAssessmentId || ''] || []
                                          ).map((msg, idx) => (
                                            <div
                                              key={idx}
                                              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                            >
                                              <div
                                                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                                                  msg.role === 'user'
                                                    ? 'bg-blue-50 text-gray-900'
                                                    : 'bg-gray-100 text-gray-800'
                                                }`}
                                              >
                                                <div className="whitespace-pre-wrap">
                                                  {msg.content}
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                          {(assessmentPciLoadingMap[loadedAssessmentId || ''] ||
                                            false) && (
                                            <div className="flex justify-start">
                                              <div className="flex items-center gap-px rounded-lg bg-gray-100 px-px py-px text-sm">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                <span className="text-xs text-gray-600">
                                                  Thinking...
                                                </span>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                        <div className="mt-auto p-0">
                                          {assessmentPciDraftMap[loadedAssessmentId || ''] && (
                                            <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                                              <span>
                                                Rubric ready — click Apply to save it as your
                                                marking policy.
                                              </span>
                                              <Button
                                                size="sm"
                                                className="h-7 bg-emerald-600 text-white hover:bg-emerald-500"
                                                onClick={() =>
                                                  applyAssessmentPciDraft(loadedAssessmentId || '')
                                                }
                                              >
                                                Apply to PCI
                                              </Button>
                                            </div>
                                          )}
                                          {(assessmentPciErrorHintMap[loadedAssessmentId || ''] ||
                                            '') && (
                                            <div className="mb-px rounded-md border border-rose-200 bg-rose-50 px-px py-px text-xs text-rose-700">
                                              PCI assistant error:{' '}
                                              {assessmentPciErrorHintMap[
                                                loadedAssessmentId || ''
                                              ] || ''}
                                            </div>
                                          )}
                                          <GuardrailWarningsBanner
                                            warnings={
                                              assessmentPciGuardrailWarningsMap[
                                                loadedAssessmentId || ''
                                              ] || []
                                            }
                                          />
                                          <div
                                            data-pci-anchor="chat-input"
                                            className="mt-2 w-full rounded-2xl border border-pink-200 bg-white/90 backdrop-blur-md transition-all duration-300"
                                          >
                                            <div className="relative flex w-full flex-col p-px">
                                              <div className="flex w-full flex-col">
                                                <MentionTextarea
                                                  mentionItems={mentionItems}
                                                  className="min-h-[100px] w-full flex-1 border-0 bg-transparent px-4 py-4 text-sm shadow-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                                  value={
                                                    assessmentPciInputMap[
                                                      loadedAssessmentId || ''
                                                    ] || ''
                                                  }
                                                  readOnly={!canEdit || !assessmentDmiReady}
                                                  placeholder={
                                                    assessmentDmiReady
                                                      ? undefined
                                                      : 'Complete the DMI (questions, marks, answer key) to unlock the marking-policy chat'
                                                  }
                                                  onChange={(e: any) =>
                                                    setPciInput(
                                                      {
                                                        kind: 'assessment',
                                                        id: loadedAssessmentId || '',
                                                      },
                                                      e.target.value
                                                    )
                                                  }
                                                  onKeyDown={(e: any) => {
                                                    if (
                                                      e.key === 'Enter' &&
                                                      !e.shiftKey &&
                                                      assessmentDmiReady
                                                    ) {
                                                      e.preventDefault()
                                                      handlePciSend('assessment')
                                                    }
                                                  }}
                                                />
                                                <div className="flex w-full items-center justify-end gap-2 px-2 pb-2">
                                                  <Button
                                                    type="button"
                                                    variant="default"
                                                    size="icon"
                                                    className="h-8 w-8 shrink-0 rounded-full"
                                                    disabled={
                                                      !assessmentDmiReady ||
                                                      assessmentPciLoadingMap[
                                                        loadedAssessmentId || ''
                                                      ] ||
                                                      false ||
                                                      !(
                                                        assessmentPciInputMap[
                                                          loadedAssessmentId || ''
                                                        ] || ''
                                                      ).trim()
                                                    }
                                                    data-pci-anchor="send"
                                                    onClick={() => handlePciSend('assessment')}
                                                    aria-label="Send"
                                                  >
                                                    {assessmentPciLoadingMap[
                                                      loadedAssessmentId || ''
                                                    ] || false ? (
                                                      <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                      <Send className="h-4 w-4" />
                                                    )}
                                                  </Button>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </TabsContent>
                                  </Tabs>
                                </div>
                              </div>
                            </TabsContent>
                          </div>
                        </Tabs>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </div>
            {!isStudentView && (
              <>
                {/* Right panel toggle button - always rendered outside grid flow */}
                <div
                  className={cn(
                    'absolute top-1/2 z-50 flex h-16 -translate-y-1/2 cursor-pointer items-center justify-center rounded-l-full border border-r-0 shadow-[-2px_0_8px_rgba(0,0,0,0.08)] transition-all duration-500 ease-in-out',
                    rightPanelHidden && isRightPeeking ? 'w-10' : 'w-8 hover:w-10',
                    rightPanelHidden
                      ? 'border-[#1D4ED8]/30 bg-[linear-gradient(135deg,#0B3A9B_0%,#1D4ED8_35%,#0A2F78_100%)]'
                      : 'border-[#E5E7EB] bg-white'
                  )}
                  style={{ right: rightPanelHidden ? 0 : rightPanelWidth }}
                  onClick={() => setRightPanelHidden(!rightPanelHidden)}
                  title={rightPanelHidden ? 'Show desk' : 'Hide desk'}
                >
                  {rightPanelHidden ? (
                    <ChevronLeft className="h-5 w-5 text-white" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-[#2B5FB8]" />
                  )}
                </div>

                {/* Right panel content - grid child with consistent wrapper */}
                <div
                  className={cn(
                    'relative z-40 flex min-h-0 shrink-0 flex-col items-end',
                    panelsMounted ? 'transition-[width] duration-500 ease-in-out' : '',
                    rightPanelHidden
                      ? 'bg-transparent shadow-none'
                      : 'shadow-[0_18px_45px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]'
                  )}
                  style={{ width: effRightPanelWidth, flexShrink: 0 }}
                >
                  <div
                    className={cn(
                      'flex h-full min-h-0 flex-col overflow-hidden rounded-[20px]',
                      panelsMounted ? 'transition-all duration-500 ease-in-out' : '',
                      rightPanelHidden ? 'w-0 opacity-0' : 'w-full opacity-100'
                    )}
                  >
                    {mainTab === 'live' && liveRightPanelTab === 'insights' ? (
                      <div className="flex h-full min-h-0 flex-col">
                        <Card
                          padding="none"
                          elevation="none"
                          className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-[rgba(0,0,0,0.04)] bg-[#FFFFFF]"
                        >
                          <div className="sticky top-0 z-10 flex h-9 items-center justify-center rounded-t-[20px] bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] px-4 text-sm font-semibold text-white">
                            Desk
                          </div>
                          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                            <div className="shrink-0 px-4 pt-4">
                              <Tabs
                                value={liveRightPanelTab}
                                onValueChange={value => {
                                  if (value === 'insights' && mainTab !== 'live') return
                                  setLiveRightPanelTab(value as 'submissions' | 'insights')
                                }}
                              >
                                <SlidingPillTabsList
                                  value={liveRightPanelTab}
                                  variant="gray"
                                  tabs={[
                                    { value: 'submissions', label: 'Submissions' },
                                    {
                                      value: 'insights',
                                      label: 'Insights',
                                      disabled: mainTab !== 'live',
                                    },
                                  ]}
                                  triggerClassName="h-8 rounded-md px-3"
                                />
                              </Tabs>
                            </div>
                            <div className="min-h-0 flex-1 overflow-hidden p-4 pt-2">
                              {insightsProps ? (
                                <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-blue-50 p-4 pb-4">
                                  <Tabs
                                    value={insightsTab}
                                    onValueChange={value =>
                                      setInsightsTab(value as 'analytics' | 'poll' | 'question')
                                    }
                                    className="flex h-full min-h-0 flex-col"
                                  >
                                    <SlidingPillTabsList
                                      value={insightsTab}
                                      variant="white"
                                      tabs={[
                                        { value: 'analytics', label: 'Analytics' },
                                        { value: 'poll', label: 'Poll' },
                                        { value: 'question', label: 'Question' },
                                      ]}
                                      listClassName="mb-2 grid shrink-0 grid-cols-3 gap-2 shadow-none"
                                      triggerClassName="h-7 rounded-md px-2 text-[11px]"
                                    />
                                    <TabsContent
                                      value="analytics"
                                      className="flex h-full flex-1 flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                    >
                                      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
                                        <AiAssistantPanel
                                          sessionId={insightsProps.sessionId}
                                          courseName={courseName}
                                          sessions={insightsProps.sessions?.map((s: any) => ({
                                            id: s.id,
                                            title: s.title,
                                            scheduledAt: s.scheduledAt,
                                            status: s.status,
                                          }))}
                                          studentsCount={(insightsProps.students || []).length}
                                          liveSubmissions={insightsProps.liveSubmissions || []}
                                          isActive={insightsTab === 'analytics'}
                                        />
                                      </div>
                                    </TabsContent>
                                    <TabsContent
                                      value="poll"
                                      className="flex flex-1 flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                    >
                                      {pollComposeMode ? (
                                        <div className="mb-2 flex flex-1 flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
                                          {/* Header with toggle */}
                                          <div className="flex items-center justify-between border-b border-blue-100 px-4 py-2">
                                            <span className="text-xs font-semibold text-blue-700">
                                              New Poll
                                            </span>
                                            {pollResults.length > 0 && (
                                              <button
                                                type="button"
                                                onClick={() => setPollComposeMode(false)}
                                                className="text-xs text-blue-600 hover:text-blue-800"
                                              >
                                                View Results
                                              </button>
                                            )}
                                          </div>
                                          {/* Editable question area */}
                                          <div className="flex-1 overflow-y-auto p-4">
                                            <textarea
                                              value={pollPrompt}
                                              onChange={e => setPollPrompt(e.target.value)}
                                              placeholder={getPollPlaceholder(pollOptionMode)}
                                              className="w-full resize-none border-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none"
                                              rows={3}
                                            />
                                            {/* Poll options preview */}
                                            <div className="mt-4">
                                              {pollOptionMode === '1-10' && (
                                                <div className="grid grid-cols-5 gap-2">
                                                  {Array.from({ length: 10 }, (_, i) => i + 1).map(
                                                    num => (
                                                      <button
                                                        key={num}
                                                        type="button"
                                                        className="flex h-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700"
                                                      >
                                                        {num}
                                                      </button>
                                                    )
                                                  )}
                                                </div>
                                              )}
                                              {pollOptionMode === 'likert' && (
                                                <div className="flex flex-col gap-2">
                                                  {likertLabels.map((label, i) => (
                                                    <EditableLikertItem
                                                      key={i}
                                                      index={i}
                                                      label={label}
                                                      onChange={setLikertLabel}
                                                      onDelete={deleteLikertLabel}
                                                      canDelete={likertLabels.length > 2}
                                                    />
                                                  ))}
                                                  <button
                                                    type="button"
                                                    onClick={addLikertLabel}
                                                    className="flex h-8 items-center justify-center gap-1 rounded-md border border-dashed border-blue-300 bg-blue-50/50 text-xs font-medium text-blue-600 hover:bg-blue-100"
                                                  >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    Add option
                                                  </button>
                                                </div>
                                              )}
                                              {pollOptionMode === 'ae' && (
                                                <div className="flex flex-wrap gap-2">
                                                  {['A', 'B', 'C', 'D', 'E'].map(letter => (
                                                    <button
                                                      key={letter}
                                                      type="button"
                                                      className="flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700"
                                                    >
                                                      {letter}
                                                    </button>
                                                  ))}
                                                </div>
                                              )}
                                              {pollOptionMode === 'tf' && (
                                                <div className="flex flex-wrap gap-2">
                                                  {['True', 'False'].map(option => (
                                                    <button
                                                      key={option}
                                                      type="button"
                                                      className="flex h-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-4 text-xs font-medium text-blue-700"
                                                    >
                                                      {option}
                                                    </button>
                                                  ))}
                                                </div>
                                              )}
                                              {pollOptionMode === 'yn' && (
                                                <div className="flex flex-wrap gap-2">
                                                  {['Yes', 'No'].map(option => (
                                                    <button
                                                      key={option}
                                                      type="button"
                                                      className="flex h-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-4 text-xs font-medium text-blue-700"
                                                    >
                                                      {option}
                                                    </button>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                          {/* Bottom button row */}
                                          <div className="relative flex items-center gap-1.5 border-t border-blue-100 px-4 py-3">
                                            {/* Speed Dial */}
                                            <div className="relative">
                                              <button
                                                type="button"
                                                onClick={() => setSpeedDialOpen(!speedDialOpen)}
                                                className={cn(
                                                  'flex h-8 w-[100px] items-center justify-center rounded-md px-2 text-xs font-medium transition-colors',
                                                  'bg-[#2563EB] text-white hover:bg-white hover:text-[#2563EB] hover:ring-1 hover:ring-[#2563EB]'
                                                )}
                                              >
                                                {POLL_OPTION_PRESETS.find(
                                                  p => p.id === pollOptionMode
                                                )?.label || 'Type'}
                                              </button>
                                              {speedDialOpen && (
                                                <div className="absolute bottom-full left-1/2 z-20 mb-2 flex -translate-x-1/2 flex-col items-center">
                                                  {POLL_OPTION_PRESETS.map((preset, index) => (
                                                    <Fragment key={preset.id}>
                                                      {index > 0 && (
                                                        <div className="h-2 w-px bg-blue-200" />
                                                      )}
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          setPollOptionMode(preset.id)
                                                          setSpeedDialOpen(false)
                                                        }}
                                                        className={cn(
                                                          'flex h-8 w-[100px] items-center justify-center rounded-md px-2 text-xs font-medium transition-colors',
                                                          pollOptionMode === preset.id
                                                            ? 'bg-[#2563EB] text-white'
                                                            : 'border border-blue-200 bg-white text-blue-700 hover:bg-blue-50'
                                                        )}
                                                      >
                                                        {preset.label}
                                                      </button>
                                                    </Fragment>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setPollPrompt('')
                                                setPollCustomOptions('')
                                                setPollOptionMode('1-10')
                                              }}
                                              className={cn(
                                                'flex h-8 flex-1 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors',
                                                'bg-[#2563EB] text-white hover:bg-white hover:text-[#2563EB] hover:ring-1 hover:ring-[#2563EB]'
                                              )}
                                            >
                                              New
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setPollPrompt('')
                                                setPollCustomOptions('')
                                              }}
                                              className={cn(
                                                'flex h-8 flex-1 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors',
                                                'bg-[#2563EB] text-white hover:bg-white hover:text-[#2563EB] hover:ring-1 hover:ring-[#2563EB]'
                                              )}
                                            >
                                              Clear
                                            </button>
                                            <Button
                                              size="sm"
                                              className="h-8 flex-1 rounded-md bg-[#2563EB] px-3 text-xs text-white hover:bg-white hover:text-[#2563EB] hover:ring-1 hover:ring-[#2563EB] disabled:opacity-30"
                                              disabled={
                                                !activeInsightsTaskId ||
                                                !insightsProps.sessionId ||
                                                !pollPrompt.trim()
                                              }
                                              onClick={() => {
                                                if (
                                                  !activeInsightsTaskId ||
                                                  !insightsProps.sessionId
                                                )
                                                  return
                                                const opts = resolvePollOptions()
                                                insightsProps.onSendPoll({
                                                  taskId: currentInsightsId,
                                                  question: pollPrompt,
                                                  options: opts,
                                                })
                                                setPollComposeMode(false)
                                              }}
                                            >
                                              <Send className="mr-1 h-3 w-3" />
                                              Poll
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="flex-1 overflow-auto rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
                                            <InsightsReportView
                                              type="poll"
                                              pollResults={pollResults}
                                              onClose={handleCloseInsight}
                                              onMentionStudent={name =>
                                                setPollPrompt(
                                                  pollPrompt
                                                    ? `${pollPrompt} @[${name}](student:${name}) `
                                                    : `@[${name}](student:${name}) `
                                                )
                                              }
                                            />
                                          </div>
                                          <div className="flex items-center justify-center py-2">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const lastPoll = pollResults[0]
                                                if (lastPoll) {
                                                  setPollPrompt(lastPoll.question)
                                                }
                                                setPollComposeMode(true)
                                              }}
                                              className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                                            >
                                              <Send className="h-3 w-3" />
                                              New Poll
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </TabsContent>
                                    <TabsContent
                                      value="question"
                                      className="flex flex-1 flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                    >
                                      <div className="flex-1 overflow-auto rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
                                        <InsightsReportView
                                          type="question"
                                          questionResults={questionResults}
                                          onClose={handleCloseInsight}
                                          onMentionStudent={name =>
                                            setQuestionPrompt(
                                              questionPrompt
                                                ? `${questionPrompt} @[${name}](student:${name}) `
                                                : `@[${name}](student:${name}) `
                                            )
                                          }
                                        />
                                      </div>
                                      <div className="mt-2 shrink-0 rounded-2xl border border-blue-100 bg-white p-2 shadow-sm">
                                        <div className="relative">
                                          <MentionTextarea
                                            mentionItems={mentionItems}
                                            className="min-h-[100px] w-full resize-none border-0 bg-transparent py-2 pl-3 pr-24 text-sm shadow-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                            disableAutoResize
                                            value={questionPrompt}
                                            onChange={event =>
                                              setQuestionPrompt(event.target.value)
                                            }
                                          />
                                          <div className="absolute bottom-2 right-2 flex items-center gap-1">
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className={cn(
                                                'h-8 w-8 rounded-xl hover:bg-blue-100 hover:text-blue-700 disabled:opacity-30',
                                                showAIQuestion
                                                  ? 'bg-blue-100 text-blue-700'
                                                  : 'text-blue-600'
                                              )}
                                              title="Generate with Socratic AI"
                                              onClick={() => setShowAIQuestion(!showAIQuestion)}
                                              disabled={!activeInsightsTaskId}
                                            >
                                              <Sparkles className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              size="icon"
                                              className="h-8 w-8 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-30"
                                              disabled={
                                                !activeInsightsTaskId ||
                                                !insightsProps.sessionId ||
                                                !questionPrompt.trim()
                                              }
                                              onClick={() => {
                                                if (
                                                  !activeInsightsTaskId ||
                                                  !insightsProps.sessionId
                                                )
                                                  return
                                                insightsProps.onSendQuestion({
                                                  taskId: currentInsightsId,
                                                  prompt: questionPrompt,
                                                })
                                                setQuestionPrompt('')
                                              }}
                                            >
                                              <Send className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    </TabsContent>
                                  </Tabs>
                                </div>
                              ) : (
                                <div className="flex h-full items-center justify-center rounded-lg border bg-white p-4 text-sm text-slate-500">
                                  Insights unavailable without an active session.
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      </div>
                    ) : (
                      <SubmissionsPanel
                        courseId={courseId || ''}
                        onToggleHidden={setRightPanelHidden}
                        liveSubmissions={insightsProps?.liveSubmissions}
                        onNewSubmissionCount={setNewSubmissionCount}
                        headerExtra={
                          <div className="px-4 pt-4">
                            <Tabs
                              value={liveRightPanelTab}
                              onValueChange={value => {
                                if (value === 'insights' && mainTab !== 'live') return
                                setLiveRightPanelTab(value as 'submissions' | 'insights')
                              }}
                            >
                              <SlidingPillTabsList
                                value={liveRightPanelTab}
                                variant="gray"
                                tabs={[
                                  { value: 'submissions', label: 'Submissions' },
                                  {
                                    value: 'insights',
                                    label: 'Insights',
                                    disabled: mainTab !== 'live',
                                  },
                                ]}
                                triggerClassName="h-8 rounded-md px-3"
                              />
                            </Tabs>
                          </div>
                        }
                      />
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </Tabs>

        {/* Modals */}
        <NodeBuilderModal
          isOpen={activeModal.type === 'node' && activeModal.isOpen}
          onClose={() => setActiveModal({ type: 'node', isOpen: false })}
          onSave={handleSaveCourseBuilderNode}
          initialData={editingData}
        />

        <HomeworkBuilderModal
          isOpen={activeModal.type === 'homework' && activeModal.isOpen}
          onClose={() => setActiveModal({ type: 'homework', isOpen: false })}
          onSave={handleSaveAssessment}
          initialData={editingData}
          nodes={nodes}
        />

        <QuizBuilderModal
          isOpen={activeModal.type === 'nodeQuiz' && activeModal.isOpen}
          onClose={() => setActiveModal({ type: 'nodeQuiz', isOpen: false })}
          onSave={handleSaveCourseBuilderNodeQuiz}
          initialData={editingData}
          isCourseBuilderNodeQuiz={true}
        />

        <ContentBuilderModal
          isOpen={activeModal.type === 'content' && activeModal.isOpen}
          onClose={() => setActiveModal({ type: 'content', isOpen: false })}
          onSave={handleSaveContent}
          initialData={editingData}
        />

        {/* Lesson Selection Dialog for Preview Pane Save */}
        <LessonSelectorDialog
          isOpen={lessonSelectDialog.isOpen}
          onClose={() => setLessonSelectDialog({ isOpen: false, type: null, title: '' })}
          onConfirm={(nodeId, lessonId) => {
            const title = lessonSelectDialog.title
            if (lessonSelectDialog.type === 'task') {
              const newTask = DEFAULT_TASK(0)
              newTask.title = title
              handleSaveTask(newTask, nodeId, lessonId)
            } else if (lessonSelectDialog.type === 'assessment') {
              const newAssessment = DEFAULT_HOMEWORK(0, 'assessment')
              newAssessment.title = title
              handleSaveAssessment(newAssessment, nodeId, lessonId)
            }
            setLessonSelectDialog({ isOpen: false, type: null, title: '' })
          }}
          nodes={nodes}
          itemType={lessonSelectDialog.type || 'item'}
        />

        {/* Document kebab "Load": pick which lesson to load into (existing or new)
            before the "Load as…" step, instead of always defaulting to Lesson 1. */}
        <LessonSelectorDialog
          isOpen={assetLessonPickerOpen}
          onClose={() => setAssetLessonPickerOpen(false)}
          onConfirm={(nodeId, lessonId) => {
            const target =
              nodeId === NEW_LESSON_VALUE ? createNewLessonTarget() : { nodeId, lessonId }
            setAssetLoadTarget(target)
            setAssetLessonPickerOpen(false)
            setLoadAsStep('main')
            setLoadAsModalOpen(true)
          }}
          nodes={nodes}
          itemType="document"
          allowNewLesson
        />

        {/* AI Assist Agent Modal */}
        <AIAssistAgent
          isOpen={aiAssistOpen}
          onClose={() => setAiAssistOpen(false)}
          context={aiAssistContext}
          content={
            aiAssistContext === 'task'
              ? taskBuilder.activeExtensionId
                ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)
                    ?.content || ''
                : taskBuilder.taskContent
              : assessmentBuilder.taskContent
          }
          pci={
            aiAssistContext === 'task'
              ? taskBuilder.activeExtensionId
                ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)?.pci ||
                  ''
                : taskBuilder.taskPci
              : assessmentBuilder.taskPci
          }
          title={aiAssistContext === 'task' ? taskBuilder.title : assessmentBuilder.title}
          messages={aiAssistContext === 'task' ? taskAiMessages : assessmentAiMessages}
          setMessages={aiAssistContext === 'task' ? setTaskAiMessages : setAssessmentAiMessages}
          onApplyContent={content => {
            if (aiAssistContext === 'task') {
              if (taskBuilder.activeExtensionId) {
                // Apply to active extension
                setTaskBuilder(prev => ({
                  ...prev,
                  extensions: prev.extensions.map(ext =>
                    ext.id === prev.activeExtensionId ? { ...ext, content } : ext
                  ),
                }))
              } else {
                // Apply to task
                setTaskBuilder(prev => ({ ...prev, taskContent: content }))
              }
            } else {
              setAssessmentBuilder(prev => ({ ...prev, taskContent: content }))
            }
          }}
          onApplyPci={pci => {
            if (aiAssistContext === 'task') {
              if (taskBuilder.activeExtensionId) {
                setTaskBuilder(prev => ({
                  ...prev,
                  extensions: prev.extensions.map(ext =>
                    ext.id === prev.activeExtensionId ? { ...ext, pci } : ext
                  ),
                }))
              } else {
                setTaskBuilder(prev => ({ ...prev, taskPci: pci }))
              }
            } else {
              setAssessmentBuilder(prev => ({ ...prev, taskPci: pci }))
            }
          }}
        />

        {/* Import Type Selector Modal */}
        <Dialog
          open={!!importTypeModalData}
          onOpenChange={open => !open && setImportTypeModalData(null)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Import as...</DialogTitle>
            </DialogHeader>
            <div className="pt-4">
              <div className="flex flex-col gap-3 rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white p-5 text-[#1F2933] shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
                <Button
                  variant="outline"
                  className="justify-start gap-2"
                  onClick={() => {
                    if (!importTypeModalData) return
                    const { target, items } = importTypeModalData
                    const joinedQuestions = items.map(i => i.questionText).join('\n\n')
                    const joinedPci = items.map(i => i.pciText).join('\n\n')

                    setCourseBuilderNodes(prev =>
                      prev.map(mod => {
                        if (mod.id !== target.nodeId) return mod
                        return {
                          ...mod,
                          lessons: mod.lessons.map(lesson => {
                            if (lesson.id !== target.lessonId) return lesson
                            const newTask = DEFAULT_LESSON(0).tasks[0]
                            return {
                              ...lesson,
                              tasks: [
                                ...lesson.tasks,
                                {
                                  ...newTask,
                                  id: `task-${Date.now()}`,
                                  title: 'Imported Task',
                                  description: joinedQuestions,
                                  instructions: joinedPci,
                                },
                              ],
                            }
                          }),
                        }
                      })
                    )
                    toast.success('Items imported as Task')
                    setImportTypeModalData(null)
                  }}
                >
                  <ListTodo className="h-4 w-4 text-orange-500" />
                  Task
                </Button>
                <Button
                  variant="outline"
                  className="justify-start gap-2"
                  onClick={() => {
                    if (!importTypeModalData) return
                    const { target, items } = importTypeModalData
                    const joinedQuestions = items.map(i => i.questionText).join('\n\n')
                    const joinedPci = items.map(i => i.pciText).join('\n\n')

                    setCourseBuilderNodes(prev =>
                      prev.map(mod => {
                        if (mod.id !== target.nodeId) return mod
                        return {
                          ...mod,
                          lessons: mod.lessons.map(lesson => {
                            if (lesson.id !== target.lessonId) return lesson
                            const newAssessment = DEFAULT_HOMEWORK(0, 'assessment')
                            return {
                              ...lesson,
                              homework: [
                                ...lesson.homework,
                                {
                                  ...newAssessment,
                                  id: `hw-${Date.now()}`,
                                  title: 'Imported Assessment',
                                  description: joinedQuestions,
                                  instructions: joinedPci,
                                },
                              ],
                            }
                          }),
                        }
                      })
                    )
                    toast.success('Items imported as Assessment')
                    setImportTypeModalData(null)
                  }}
                >
                  <FileQuestion className="h-4 w-4 text-purple-500" />
                  Assessment
                </Button>
                <Button
                  variant="outline"
                  className="justify-start gap-2"
                  onClick={() => {
                    if (!importTypeModalData) return
                    const { target, items } = importTypeModalData
                    const joinedQuestions = items.map(i => i.questionText).join('\n\n')
                    const joinedPci = items.map(i => i.pciText).join('\n\n')

                    setCourseBuilderNodes(prev =>
                      prev.map(mod => {
                        if (mod.id !== target.nodeId) return mod
                        return {
                          ...mod,
                          lessons: mod.lessons.map(lesson => {
                            if (lesson.id !== target.lessonId) return lesson
                            const newHomework = DEFAULT_HOMEWORK(0, 'homework')
                            return {
                              ...lesson,
                              homework: [
                                ...lesson.homework,
                                {
                                  ...newHomework,
                                  id: `hw-${Date.now()}`,
                                  title: 'Imported Homework',
                                  description: joinedQuestions,
                                  instructions: joinedPci,
                                },
                              ],
                            }
                          }),
                        }
                      })
                    )
                    toast.success('Items imported as Homework')
                    setImportTypeModalData(null)
                  }}
                >
                  <Home className="h-4 w-4 text-emerald-500" />
                  Homework
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Move task/assessment to another lesson */}
        <Dialog open={!!moveDialog} onOpenChange={open => !open && setMoveDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Move {moveDialog?.itemType === 'task' ? 'task' : 'assessment'} to lesson
              </DialogTitle>
              <DialogDescription>
                Choose a lesson to move “{moveDialog?.itemTitle}” to, or create a new one. If the
                lesson already has an item with the same name, this one gets a “new” suffix.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <label
                htmlFor="move-to-lesson-select"
                className="mb-1 block text-xs font-medium text-gray-700"
              >
                Destination lesson
              </label>
              <select
                id="move-to-lesson-select"
                value={moveTarget}
                onChange={e => setMoveTarget(e.target.value)}
                className="w-full rounded-md border border-gray-300 p-2 text-sm text-gray-900"
              >
                <option value="">Select a lesson…</option>
                {nodes
                  .filter(n => n.id !== moveDialog?.sourceNodeId)
                  .map(n => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
                <option value="__new__">＋ Create a new lesson</option>
              </select>
            </div>
            <DialogFooter>
              <Button variant="modal-secondary-dark" onClick={() => setMoveDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="modal-primary-dark"
                disabled={!moveTarget}
                onClick={confirmMoveDialog}
              >
                Move
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Course Properties Modal */}
        <Dialog
          open={coursePropsModal.isOpen}
          onOpenChange={open => setCoursePropsModal(prev => ({ ...prev, isOpen: open }))}
        >
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Course Properties</DialogTitle>
              <DialogDescription>
                Set the name and description for your new course before saving.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                  Name
                </Label>
                <Input
                  id="name"
                  value={coursePropsModal.name}
                  onChange={e => setCoursePropsModal(prev => ({ ...prev, name: e.target.value }))}
                  className="col-span-3"
                  placeholder="e.g. SAT Math Prep"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="description" className="text-right">
                  Description
                </Label>
                <AutoTextarea
                  id="description"
                  value={coursePropsModal.description}
                  onChange={e =>
                    setCoursePropsModal(prev => ({ ...prev, description: e.target.value }))
                  }
                  className="col-span-3"
                  placeholder="Briefly describe what this course is about..."
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="isLive" className="text-right">
                  Status
                </Label>
                <div className="col-span-3 flex items-center space-x-2">
                  <Switch
                    id="isLive"
                    checked={coursePropsModal.isLive}
                    onCheckedChange={checked =>
                      setCoursePropsModal(prev => ({ ...prev, isLive: checked }))
                    }
                  />
                  <Label htmlFor="isLive">{coursePropsModal.isLive ? 'Live' : 'Draft'}</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={!coursePropsModal.name.trim()}
                onClick={() => {
                  setCoursePropsModal(prev => ({ ...prev, isOpen: false }))
                  if (onSave) {
                    onSave(
                      nodes.map(n => n.lessons[0] || ({} as any)),
                      {
                        developmentMode: devMode,
                        previewDifficulty,
                        courseName: coursePropsModal.name,
                        courseDescription: coursePropsModal.description,
                        isLive: coursePropsModal.isLive,
                      }
                    )
                  }
                }}
              >
                Save Course
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* DMI Version History Modal */}
        <Dialog open={showDmiVersionList} onOpenChange={open => setShowDmiVersionList(open)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>DMI Version History</DialogTitle>
              <DialogDescription>
                View and restore previous DMI versions for{' '}
                {mainBuilderTab === 'task' ? 'Task' : 'Assessment'}.
              </DialogDescription>
            </DialogHeader>
            <div className="pt-4">
              <div className="max-h-[400px] overflow-y-auto rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white p-4 text-[#1F2933] shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
                {(mainBuilderTab === 'task' ? taskDmiVersions : assessmentDmiVersions).length ===
                0 ? (
                  <div className="text-muted-foreground py-6 text-center text-sm">
                    No DMI versions yet. Generate a DMI to create your first version.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(mainBuilderTab === 'task' ? taskDmiVersions : assessmentDmiVersions)
                      .slice()
                      .reverse()
                      .map(version => (
                        <div
                          key={version.id}
                          className="flex items-center justify-between rounded-lg border bg-white p-3 hover:bg-slate-50"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Version {version.versionNumber}</span>
                              <span className="text-muted-foreground text-xs">
                                {new Date(version.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="text-muted-foreground text-xs">
                              {version.items?.length ?? 0} question
                              {(version.items?.length ?? 0) !== 1 ? 's' : ''}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPreviewDmiVersion(version)}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              View
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!canEdit}
                              onClick={() => {
                                if (!canEdit) return
                                handleLoadDmiVersion(version, mainBuilderTab)
                              }}
                            >
                              Load
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive h-8 w-8"
                              disabled={!canEdit}
                              onClick={() => {
                                if (!canEdit) return
                                handleDeleteDmiVersion(version.id, mainBuilderTab)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="modal-secondary-dark" onClick={() => setShowDmiVersionList(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Deploy → choose how/when students see the answers, then deploy. */}
        <Dialog
          open={!!deployDialog}
          onOpenChange={open => {
            if (!open) setDeployDialog(null)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Deploy to students</DialogTitle>
              <DialogDescription>
                Choose how and when students see the correct answers.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {(
                [
                  {
                    v: 'instant',
                    t: 'Instant feedback',
                    d: 'Graded live — students see the correct answer as they go.',
                  },
                  {
                    v: 'after_submit',
                    t: 'After submit',
                    d: 'Correct answers are revealed only on the results screen.',
                  },
                  {
                    v: 'hidden',
                    t: 'Hidden',
                    d: 'Only the score is shown; answers are never revealed.',
                  },
                  {
                    v: 'student_choice',
                    t: 'Student chooses (self-study)',
                    d: 'The student picks practice (see answers) or test (hidden).',
                  },
                ] as const
              ).map(o => {
                const selected = deployAnswerReveal === o.v
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setDeployAnswerReveal(o.v)}
                    className={cn(
                      'w-full rounded-xl border p-3 text-left transition-colors',
                      selected
                        ? 'border-[#F17623] bg-[#FFF4EC]'
                        : 'border-gray-200 hover:bg-gray-50'
                    )}
                  >
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        selected ? 'text-[#9a4a12]' : 'text-gray-800'
                      )}
                    >
                      {o.t}
                    </p>
                    <p className="text-xs text-gray-600">{o.d}</p>
                  </button>
                )
              })}
            </div>
            <DialogFooter>
              <Button variant="modal-secondary-dark" onClick={() => setDeployDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const run = deployDialog?.run
                  setDeployDialog(null)
                  run?.(deployAnswerReveal)
                }}
              >
                Deploy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit marks & answers — the tutor sets per-question marks and vets the
            AI-drafted answers (study material) before deploying. Edits apply live
            to the loaded DMI and the saved version. */}
        <Dialog
          open={!!dmiEditor}
          onOpenChange={open => {
            if (!open) setDmiEditor(null)
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            {dmiEditor &&
              (() => {
                const editItems = dmiEditor.source === 'task' ? taskDmiItems : assessmentDmiItems
                const totalMarks = editItems.reduce(
                  (sum, it) => sum + (typeof it.marks === 'number' && it.marks > 0 ? it.marks : 1),
                  0
                )
                // Examining body + subject for the badge: the active DMI version's
                // stored override if set, else a default derived from the course
                // category. (A later per-paper detector will set the version value.)
                const examVersions =
                  dmiEditor.source === 'task' ? taskDmiVersions : assessmentDmiVersions
                const activeExamVersionId = testPciViewMode.startsWith('dmi_')
                  ? testPciViewMode.slice('dmi_'.length)
                  : null
                const activeExamVersion =
                  examVersions.find(v => v.id === activeExamVersionId) ??
                  examVersions[examVersions.length - 1]
                const derivedExam = deriveExamContext(designatedFolder, courseName)
                const examBody = activeExamVersion?.examBody ?? derivedExam.examBody ?? ''
                const examSubject = activeExamVersion?.subject ?? derivedExam.subject ?? ''
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle>Edit marks &amp; answers</DialogTitle>
                      <DialogDescription>
                        Set the marks for each question and review the AI-suggested answers. Total:{' '}
                        {totalMarks} mark{totalMarks === 1 ? '' : 's'}.
                      </DialogDescription>
                    </DialogHeader>
                    {/* Board & subject are set in the Guided PCI form now (single
                        source of truth, shared with Course details). Shown here
                        read-only for reference; they drive board-specific marking. */}
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-900">
                        <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
                        {examBody || '—'}
                        <span className="text-indigo-300">·</span>
                        {examSubject || '—'}
                      </span>
                      <span className="ml-auto text-[11px] text-indigo-500">
                        Set in the Guided PCI form
                      </span>
                    </div>
                    {/* Upload marking scheme: AI matches each question number to
                        its answer (capturing the scheme's acceptable variations). */}
                    <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
                      <FileText className="h-4 w-4 shrink-0 text-sky-700" />
                      <span className="text-xs text-sky-800">
                        Have a marking scheme? Auto-fill every answer from it.
                      </span>
                      <input
                        ref={markingSchemeInputRef}
                        type="file"
                        accept="application/pdf,.pdf,text/plain,.txt"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0]
                          e.target.value = ''
                          if (file && dmiEditor)
                            void handleMarkingSchemeFile(file, dmiEditor.source)
                        }}
                      />
                      <button
                        type="button"
                        disabled={!canEdit || markingSchemeLoading}
                        onClick={() => markingSchemeInputRef.current?.click()}
                        className="ml-auto inline-flex items-center gap-1 rounded-full border border-sky-300 bg-white px-3 py-1 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-60"
                      >
                        {markingSchemeLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        Upload marking scheme
                      </button>
                    </div>
                    {/* Backfill the paper's real question numbers (1a, 1b…) from the
                        question text — for older DMIs that were re-serialized, so a
                        marking scheme lines up. */}
                    <div className="-mt-1 flex justify-end">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => reextractRefs(dmiEditor.source)}
                        title="Backfill question numbers (e.g. 1a, 1b) from the question text — useful for older assessments before a marking scheme upload"
                        className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline disabled:opacity-50"
                      >
                        Re-detect question numbers
                      </button>
                    </div>
                    <div ref={dmiRowsRef} className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                      {editItems.map(item => {
                        const marksVal =
                          typeof item.marks === 'number' && item.marks > 0 ? item.marks : 1
                        const isOpenEnded =
                          !item.questionType ||
                          item.questionType === 'short' ||
                          item.questionType === 'long' ||
                          item.questionType === 'fill_blank'
                        const hasOptions = Array.isArray(item.options) && item.options.length > 0
                        const isMultiSelect = item.questionType === 'multiple_response'
                        const selectedOptionLetters = hasOptions
                          ? dmiSelectedOptionLetters(item.answer, item.options as string[])
                          : new Set<string>()
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              'rounded-lg border p-3 transition-colors',
                              recentlyAddedRowIds.has(item.id)
                                ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-300'
                                : 'border-gray-200 bg-white'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                                  <span className="text-indigo-600">
                                    Q{item.questionLabel ?? item.questionNumber}.
                                  </span>
                                  {item.section && (
                                    <span className="inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
                                      {item.section}
                                    </span>
                                  )}
                                </div>
                                <textarea
                                  value={item.questionText || ''}
                                  disabled={!canEdit}
                                  placeholder="Question text…"
                                  onChange={e =>
                                    applyDmiEdit(dmiEditor.source, item.id, {
                                      questionText: e.target.value,
                                    })
                                  }
                                  className="min-h-[40px] w-full resize-y rounded-md border border-gray-300 p-2 text-sm text-gray-900 disabled:bg-gray-50"
                                />
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <label className="flex items-center gap-1 text-xs text-gray-600">
                                  Marks
                                  <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={marksVal}
                                    disabled={!canEdit}
                                    onChange={e => {
                                      const n = Math.max(1, Math.round(Number(e.target.value) || 1))
                                      applyDmiEdit(dmiEditor.source, item.id, { marks: n })
                                    }}
                                    className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900"
                                  />
                                </label>
                                <button
                                  type="button"
                                  disabled={!canEdit}
                                  onClick={() => removeDmiItem(dmiEditor.source, item.id)}
                                  title="Remove this question"
                                  className="rounded-md p-1 text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            {Array.isArray(item.options) && item.options.length > 0 && (
                              <div className="mt-2 space-y-1">
                                <label className="block text-xs font-medium text-gray-600">
                                  Options
                                </label>
                                {item.options.map((o, i) => {
                                  const letter = dmiOptionLetter(i)
                                  const isCorrect = selectedOptionLetters.has(letter)
                                  return (
                                    <div key={i} className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        disabled={!canEdit}
                                        aria-pressed={isCorrect}
                                        title={
                                          isCorrect
                                            ? 'Correct answer — click to unset'
                                            : 'Mark as the correct answer'
                                        }
                                        onClick={() => {
                                          if (isMultiSelect) {
                                            const next = new Set(selectedOptionLetters)
                                            if (next.has(letter)) next.delete(letter)
                                            else next.add(letter)
                                            applyDmiEdit(dmiEditor.source, item.id, {
                                              answer: [...next].sort().join(', '),
                                            })
                                          } else {
                                            applyDmiEdit(dmiEditor.source, item.id, {
                                              answer: isCorrect ? '' : letter,
                                            })
                                          }
                                        }}
                                        className={cn(
                                          'flex h-6 w-6 shrink-0 items-center justify-center border text-xs font-semibold transition-colors',
                                          isMultiSelect ? 'rounded-md' : 'rounded-full',
                                          isCorrect
                                            ? 'border-emerald-500 bg-emerald-500 text-white'
                                            : 'border-gray-300 bg-white text-gray-600 hover:border-emerald-400 hover:text-emerald-600',
                                          !canEdit && 'cursor-not-allowed opacity-60'
                                        )}
                                      >
                                        {isCorrect ? <Check className="h-3.5 w-3.5" /> : letter}
                                      </button>
                                      <input
                                        value={o}
                                        disabled={!canEdit}
                                        placeholder={`Option ${letter}`}
                                        onChange={e => {
                                          const next = [...(item.options || [])]
                                          next[i] = e.target.value
                                          applyDmiEdit(dmiEditor.source, item.id, { options: next })
                                        }}
                                        className={cn(
                                          'flex-1 rounded-md border px-2 py-1 text-sm text-gray-900 disabled:bg-gray-50',
                                          isCorrect
                                            ? 'border-emerald-400 bg-emerald-50/40'
                                            : 'border-gray-300'
                                        )}
                                      />
                                      <button
                                        type="button"
                                        disabled={!canEdit}
                                        onClick={() => {
                                          const next = (item.options || []).filter(
                                            (_, j) => j !== i
                                          )
                                          applyDmiEdit(dmiEditor.source, item.id, { options: next })
                                        }}
                                        title="Remove this option"
                                        className="rounded p-1 text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  )
                                })}
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      applyDmiEdit(dmiEditor.source, item.id, {
                                        options: [...(item.options || []), ''],
                                      })
                                    }
                                    className="text-[11px] font-medium text-indigo-600 transition-colors hover:text-indigo-700"
                                  >
                                    + Add option
                                  </button>
                                )}
                              </div>
                            )}
                            <div className="mt-2">
                              <label className="mb-1 block text-xs font-medium text-gray-600">
                                Answer key
                                {hasOptions
                                  ? isMultiSelect
                                    ? ' — click the correct options above'
                                    : ' — click the correct option above'
                                  : ''}
                              </label>
                              <textarea
                                value={item.answer || ''}
                                disabled={!canEdit}
                                placeholder="Correct answer (vet the AI suggestion)…"
                                onChange={e =>
                                  applyDmiEdit(dmiEditor.source, item.id, {
                                    answer: e.target.value,
                                  })
                                }
                                className="min-h-[44px] w-full resize-y rounded-md border border-gray-300 p-2 text-sm text-gray-900"
                              />
                            </div>
                            <div className="mt-2">
                              <label className="mb-1 block text-xs font-medium text-gray-600">
                                Accepted variants (one per line)
                              </label>
                              <textarea
                                value={(item.acceptableVariants || []).join('\n')}
                                disabled={!canEdit}
                                placeholder="Other answers that earn full marks (alt phrasings, units, equivalent values)…"
                                onChange={e =>
                                  applyDmiEdit(dmiEditor.source, item.id, {
                                    acceptableVariants: e.target.value
                                      .split('\n')
                                      .map(s => s.trim())
                                      .filter(Boolean),
                                  })
                                }
                                className="min-h-[36px] w-full resize-y rounded-md border border-gray-300 p-2 text-sm text-gray-900"
                              />
                            </div>
                            {isOpenEnded &&
                              (() => {
                                // short/long are gated at deploy (ASMT-8); other
                                // "open-ish" types keep the rubric optional.
                                const rubricRequired =
                                  item.questionType === 'short' || item.questionType === 'long'
                                return (
                                  <div className="mt-2">
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                      <label className="block text-xs font-medium text-gray-600">
                                        Marking guidance{' '}
                                        {rubricRequired ? (
                                          <span className="font-semibold text-red-600">
                                            (required)
                                          </span>
                                        ) : (
                                          '(optional)'
                                        )}
                                      </label>
                                      {rubricRequired && canEdit && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            applyDmiEdit(dmiEditor.source, item.id, {
                                              rubric: 'Manual marking — tutor grades by hand.',
                                            })
                                          }
                                          className="shrink-0 text-xs font-medium text-blue-700 hover:underline"
                                        >
                                          Manual marking only
                                        </button>
                                      )}
                                    </div>
                                    <textarea
                                      value={item.rubric || ''}
                                      disabled={!canEdit}
                                      placeholder="How to award the marks…"
                                      onChange={e =>
                                        applyDmiEdit(dmiEditor.source, item.id, {
                                          rubric: e.target.value,
                                        })
                                      }
                                      className="min-h-[36px] w-full resize-y rounded-md border border-gray-300 p-2 text-sm text-gray-900"
                                    />
                                  </div>
                                )
                              })()}
                          </div>
                        )
                      })}
                    </div>
                    <DialogFooter>
                      <Button onClick={() => setDmiEditor(null)}>Approve &amp; close</Button>
                    </DialogFooter>
                  </>
                )
              })()}
          </DialogContent>
        </Dialog>

        {/* Document-kind confirmation — shown when generate-dmi can't be confident
            whether the upload is a question paper or study material, so we ask
            rather than silently treating it as a paper. */}
        <Dialog
          open={!!dmiKindDialog}
          onOpenChange={open => {
            if (!open) setDmiKindDialog(null)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Is this a question paper?</DialogTitle>
              <DialogDescription>
                We couldn&rsquo;t tell whether this document is a question paper (a set of questions
                for students to answer) or study material to learn from.
                {dmiKindDialog?.signal === 'none'
                  ? ' It reads mostly like explanatory material.'
                  : dmiKindDialog?.signal === 'strong'
                    ? ' It shows strong signs of a question paper.'
                    : ''}{' '}
                Which is it?
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-2">
              <Button
                onClick={() => {
                  const t = dmiKindDialog?.type
                  setDmiKindDialog(null)
                  if (t) void handleGenerateDMI(t, undefined, 'question_paper')
                }}
              >
                It&rsquo;s a question paper
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const t = dmiKindDialog?.type
                  setDmiKindDialog(null)
                  if (t) void handleGenerateDMI(t, undefined, 'study_material')
                }}
              >
                It&rsquo;s study material
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Study-material question spec dialog — shown when generate-dmi detects
            the source has no explicit questions. The tutor chooses which question
            types and how many of each to generate. */}
        <Dialog
          open={!!dmiSpecDialog}
          onOpenChange={open => {
            if (!open) setDmiSpecDialog(null)
          }}
        >
          <DialogContent className="max-w-md border border-slate-200 shadow-2xl">
            <DialogHeader className="text-center">
              <DialogTitle className="mx-auto text-center text-white">
                Edit DMI Manually
              </DialogTitle>
              <DialogDescription className="text-white/80">
                This document looks like study material rather than a question paper. Pick the
                question types and how many of each to generate.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 px-6 py-4">
              {dmiSpecRows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select
                    value={row.type}
                    onValueChange={value =>
                      setDmiSpecRows(prev =>
                        prev.map((r, i) =>
                          i === idx ? { ...r, type: value as DmiQuestionType } : r
                        )
                      )
                    }
                  >
                    <SelectTrigger className="h-10 w-full rounded-[10px] border border-gray-200 bg-white text-sm font-medium text-gray-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DMI_QUESTION_TYPES.map(t => (
                        <SelectItem key={t} value={t}>
                          {DMI_QUESTION_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={row.count}
                    onChange={e =>
                      setDmiSpecRows(prev =>
                        prev.map((r, i) =>
                          i === idx
                            ? {
                                ...r,
                                count: Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                              }
                            : r
                        )
                      )
                    }
                    className="h-10 w-20 rounded-[10px] border border-gray-200 bg-white text-center text-sm font-medium text-gray-900"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-slate-600 hover:text-red-500"
                    disabled={dmiSpecRows.length <= 1}
                    onClick={() => setDmiSpecRows(prev => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 rounded-[10px] border border-white bg-[#22C55E] px-6 text-sm font-medium text-white hover:border-[#22C55E] hover:bg-white hover:text-[#22C55E]"
                onClick={() => setDmiSpecRows(prev => [...prev, { type: 'short', count: 3 }])}
              >
                <Plus className="mr-1 h-4 w-4" /> Add type
              </Button>
            </div>

            <DialogFooter className="gap-3">
              <Button variant="modal-secondary-dark" onClick={() => setDmiSpecDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="modal-primary-dark"
                onClick={handleConfirmDmiSpec}
                disabled={dmiGenerating}
              >
                {dmiGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Response-format chooser — free-response (AI reads the paper) vs
            multiple-choice (configure locally, no tokens). */}
        <Dialog
          open={!!dmiFormatDialog}
          onOpenChange={open => {
            if (!open) setDmiFormatDialog(null)
          }}
        >
          <DialogContent className="max-w-md border border-slate-200 shadow-2xl">
            <DialogHeader className="text-center">
              <DialogTitle className="mx-auto text-center text-white">
                How are the questions answered?
              </DialogTitle>
              <DialogDescription className="text-white/80">
                Choose the response format. Multiple-choice papers are configured directly — no need
                to spend AI reading the paper.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 px-6 py-4">
              <button
                type="button"
                onClick={handleChooseMultipleChoice}
                className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  <ListChecks className="h-4 w-4 text-indigo-600" /> Multiple choice
                </span>
                <span className="text-xs text-slate-500">
                  Set the sections and how many questions each has, then click the correct option
                  per question. No AI used.
                </span>
              </button>
              <button
                type="button"
                onClick={handleChooseFreeResponse}
                className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  <FileText className="h-4 w-4 text-indigo-600" /> Free response
                </span>
                <span className="text-xs text-slate-500">
                  The AI reads the paper and drafts the questions, marks, and answer key for you to
                  review.
                </span>
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Content-source chooser — shown when a PDF is attached but the text box
            was edited to differ from the doc's extraction. */}
        <Dialog
          open={!!dmiSourceDialog}
          onOpenChange={open => {
            if (!open) setDmiSourceDialog(null)
          }}
        >
          <DialogContent className="max-w-md border border-slate-200 shadow-2xl">
            <DialogHeader className="text-center">
              <DialogTitle className="mx-auto text-center text-white">
                Which content should the DMI use?
              </DialogTitle>
              <DialogDescription className="text-white/80">
                This has both an attached document and edited text, and they differ. Pick the one to
                generate from.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 px-6 py-4">
              <button
                type="button"
                onClick={handleChooseDmiDocument}
                className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  <FileText className="h-4 w-4 text-indigo-600" /> The attached document
                </span>
                <span className="text-xs text-slate-500">
                  Read the original file directly — most accurate for a real paper. Ignores edits in
                  the text box.
                </span>
              </button>
              <button
                type="button"
                onClick={handleChooseDmiTypedText}
                className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  <Type className="h-4 w-4 text-indigo-600" /> The typed text
                </span>
                <span className="text-xs text-slate-500">
                  Generate from exactly what's in the text box — uses your edits/additions and
                  ignores the file.
                </span>
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* MCQ configuration — named sections + question counts, choices per
            question, and marks. Generates the DMI locally (no AI). */}
        <Dialog
          open={!!mcqConfigDialog}
          onOpenChange={open => {
            if (!open) setMcqConfigDialog(null)
          }}
        >
          <DialogContent className="max-w-lg border border-slate-200 shadow-2xl">
            <DialogHeader className="text-center">
              <DialogTitle className="mx-auto text-center text-white">
                Configure multiple-choice questions
              </DialogTitle>
              <DialogDescription className="text-white/80">
                Name each section and set how many questions it has. Leave the section name blank if
                the paper isn&rsquo;t divided into sections.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 px-6 py-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  <span className="flex-1">Section name</span>
                  <span className="w-24 text-center">Questions</span>
                  <span className="w-9" />
                </div>
                {mcqSections.map((sec, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={sec.name}
                      placeholder={`Section ${idx + 1} (optional)`}
                      onChange={e =>
                        setMcqSections(prev =>
                          prev.map((s, i) => (i === idx ? { ...s, name: e.target.value } : s))
                        )
                      }
                      className="h-10 flex-1 rounded-[10px] border border-gray-200 bg-white text-sm text-gray-900"
                    />
                    <Input
                      type="number"
                      min={1}
                      max={200}
                      value={sec.count}
                      onChange={e =>
                        setMcqSections(prev =>
                          prev.map((s, i) =>
                            i === idx
                              ? {
                                  ...s,
                                  count: Math.max(1, Math.min(200, Number(e.target.value) || 1)),
                                }
                              : s
                          )
                        )
                      }
                      className="h-10 w-24 rounded-[10px] border border-gray-200 bg-white text-center text-sm font-medium text-gray-900"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-slate-600 hover:text-red-500"
                      disabled={mcqSections.length <= 1}
                      onClick={() => setMcqSections(prev => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 rounded-[10px] border border-white bg-[#22C55E] px-6 text-sm font-medium text-white hover:border-[#22C55E] hover:bg-white hover:text-[#22C55E]"
                  onClick={() => setMcqSections(prev => [...prev, { name: '', count: 10 }])}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add section
                </Button>
              </div>

              <div className="flex flex-wrap gap-4 border-t border-slate-100 pt-3">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                  Choices per question
                  <Input
                    type="number"
                    min={2}
                    max={8}
                    value={mcqChoices}
                    onChange={e =>
                      setMcqChoices(Math.max(2, Math.min(8, Number(e.target.value) || 4)))
                    }
                    className="h-9 w-16 rounded-[10px] border border-gray-200 bg-white text-center text-sm font-medium text-gray-900"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                  Marks per question
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={mcqMarks}
                    onChange={e =>
                      setMcqMarks(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                    }
                    className="h-9 w-16 rounded-[10px] border border-gray-200 bg-white text-center text-sm font-medium text-gray-900"
                  />
                </label>
              </div>
              <p className="text-[11px] text-gray-500">
                {mcqSections.reduce((sum, s) => sum + (Math.round(s.count) || 0), 0)} question(s) in
                total. You&rsquo;ll click the correct option for each after they&rsquo;re created.
              </p>
            </div>

            <DialogFooter className="gap-3">
              <Button variant="modal-secondary-dark" onClick={() => setMcqConfigDialog(null)}>
                Cancel
              </Button>
              <Button variant="modal-primary-dark" onClick={generateMcqDmi}>
                Generate DMI
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* DMI Version Preview Modal */}
        <Dialog
          open={!!previewDmiVersion}
          onOpenChange={open => {
            if (!open) setPreviewDmiVersion(null)
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>DMI Preview — Version {previewDmiVersion?.versionNumber}</DialogTitle>
              <DialogDescription>
                {previewDmiVersion?.items?.length ?? 0} question
                {(previewDmiVersion?.items?.length ?? 0) !== 1 ? 's' : ''} ·{' '}
                {previewDmiVersion
                  ? new Date(previewDmiVersion.createdAt).toLocaleDateString()
                  : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="pt-4">
              <div className="max-h-[500px] overflow-y-auto rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white p-4 text-[#1F2933] shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
                {!previewDmiVersion || (previewDmiVersion.items?.length ?? 0) === 0 ? (
                  <div className="text-muted-foreground py-6 text-center text-sm">
                    No questions in this version.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(previewDmiVersion.items ?? []).map((item, idx) => (
                      <div key={item.id} className="rounded-lg border bg-slate-50 p-4">
                        <div className="mb-2 text-sm font-semibold text-slate-700">
                          Question {item.questionLabel ?? item.questionNumber}
                        </div>
                        <div className="text-sm text-slate-800">{item.questionText}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="modal-primary-dark"
                onClick={() => {
                  if (previewDmiVersion) {
                    handleLoadDmiVersion(previewDmiVersion, mainBuilderTab)
                  }
                  setPreviewDmiVersion(null)
                }}
              >
                Load This Version
              </Button>
              <Button variant="modal-secondary-dark" onClick={() => setPreviewDmiVersion(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* "View DMI" modal — opened from the Classroom toolbar button (next to
            the answer input). Uses the hoisted liveDmiItems. */}
        {mainTab === 'live' &&
          liveDmiItems.length > 0 &&
          (() => {
            const totalMarks = liveDmiItems.reduce(
              (sum, it) => sum + (typeof it.marks === 'number' && it.marks > 0 ? it.marks : 1),
              0
            )
            // Only offer the reveal toggle when there is actually a key to hide.
            const hasAnswerKey = liveDmiItems.some(it => it.answer || it.rubric)
            return (
              <>
                <Dialog open={showLiveDmiModal} onOpenChange={setShowLiveDmiModal}>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Loaded DMI</DialogTitle>
                      <DialogDescription>
                        {liveDmiItems.length} question{liveDmiItems.length === 1 ? '' : 's'} ·{' '}
                        {totalMarks} mark{totalMarks === 1 ? '' : 's'} total
                      </DialogDescription>
                    </DialogHeader>
                    {hasAnswerKey && (
                      <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <span className="text-xs text-amber-800">
                          {showLiveDmiAnswers
                            ? 'Answer key visible — students share your screen.'
                            : 'Answer key hidden.'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowLiveDmiAnswers(v => !v)}
                          className="shrink-0 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100"
                        >
                          {showLiveDmiAnswers ? 'Hide answers' : 'Show answers'}
                        </button>
                      </div>
                    )}
                    <div className="max-h-[500px] space-y-3 overflow-y-auto rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white p-4 text-[#1F2933]">
                      {liveDmiItems.map((item, idx) => {
                        // For mcq the answer key is a letter (A–E); map it to the
                        // option index so we can highlight the correct choice.
                        const correctIdx =
                          showLiveDmiAnswers && item.questionType === 'mcq' && item.answer
                            ? item.answer.trim().toUpperCase().charCodeAt(0) - 65
                            : -1
                        return (
                          <div key={item.id || idx} className="rounded-lg border bg-slate-50 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-sm font-medium text-slate-800">
                                {(item.questionLabel ?? item.questionNumber)
                                  ? `${item.questionLabel ?? item.questionNumber}. `
                                  : ''}
                                {item.questionText}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                  {typeof item.marks === 'number' && item.marks > 0
                                    ? item.marks
                                    : 1}{' '}
                                  {(typeof item.marks === 'number' && item.marks > 0
                                    ? item.marks
                                    : 1) === 1
                                    ? 'mark'
                                    : 'marks'}
                                </span>
                                {item.questionType && item.questionType !== 'long' && (
                                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                    {item.questionType}
                                  </span>
                                )}
                              </div>
                            </div>
                            {Array.isArray(item.options) && item.options.length > 0 && (
                              <ul className="mt-1.5 space-y-0.5 pl-1 text-xs text-slate-600">
                                {item.options.map((o, i) => (
                                  <li
                                    key={i}
                                    className={
                                      i === correctIdx
                                        ? 'rounded bg-emerald-100 px-1 font-semibold text-emerald-800'
                                        : ''
                                    }
                                  >
                                    <span className="mr-1 font-semibold text-slate-500">
                                      {String.fromCharCode(97 + i)})
                                    </span>
                                    {o}
                                    {i === correctIdx && ' ✓'}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {showLiveDmiAnswers && item.answer && (
                              <p className="mt-2 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                                <span className="font-semibold">Answer:</span> {item.answer}
                              </p>
                            )}
                            {showLiveDmiAnswers && item.rubric && (
                              <p className="mt-1 rounded bg-sky-50 px-2 py-1 text-xs text-sky-800">
                                <span className="font-semibold">Marking:</span> {item.rubric}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <DialogFooter>
                      {/* Edit marks & answers for the loaded DMI — works for both
                          task and assessment DMIs, the entry point tasks lacked.
                          Only when there's editable builder state to write back. */}
                      {canEdit && (assessmentDmiItems.length > 0 || taskDmiItems.length > 0) && (
                        <Button
                          variant="modal-secondary-dark"
                          onClick={() => {
                            setShowLiveDmiModal(false)
                            setDmiEditor({
                              source: assessmentDmiItems.length > 0 ? 'assessment' : 'task',
                            })
                          }}
                        >
                          Edit marks &amp; answers
                        </Button>
                      )}
                      <Button
                        variant="modal-secondary-dark"
                        onClick={() => setShowLiveDmiModal(false)}
                      >
                        Close
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )
          })()}

        {/* PPT Upload Options Dialog */}
        <Dialog
          open={pptUploadDialog.isOpen}
          onOpenChange={open => {
            if (!open) setPptUploadDialog({ isOpen: false, file: null, target: null })
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-orange-500" />
                PowerPoint Upload Options
              </DialogTitle>
              <DialogDescription>
                How would you like to use &quot;{pptUploadDialog.file?.name}&quot;?
              </DialogDescription>
            </DialogHeader>
            <div className="pt-4">
              <div className="space-y-4 rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white p-5 text-[#1F2933] shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
                <Button
                  variant="outline"
                  className="h-auto w-full justify-start gap-3 px-4 py-4"
                  onClick={() => handlePptOption('extract')}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                    <span className="text-lg">📄</span>
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Extract Text Content</p>
                    <p className="text-muted-foreground text-sm">
                      Parse the slides and extract all text content for editing
                    </p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto w-full justify-start gap-3 px-4 py-4"
                  onClick={() => handlePptOption('embed')}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100">
                    <span className="text-lg">🖼️</span>
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Display as Presentation</p>
                    <p className="text-muted-foreground text-sm">
                      Keep the file as a presentation to display slides during class
                    </p>
                  </div>
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="modal-secondary-dark"
                onClick={() => setPptUploadDialog({ isOpen: false, file: null, target: null })}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Global Info/Alert Dialog */}
        <Dialog
          open={alertDialog.open}
          onOpenChange={open => setAlertDialog(prev => ({ ...prev, open }))}
        >
          <DialogContent className="rounded-2xl border-orange-200 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-orange-600">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                  !
                </span>
                {alertDialog.title}
              </DialogTitle>
              <DialogDescription className="text-base text-slate-600">
                {alertDialog.message}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="modal-secondary"
                onClick={() => setAlertDialog(prev => ({ ...prev, open: false }))}
              >
                Understood
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }
)
