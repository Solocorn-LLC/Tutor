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
import NextImage from 'next/image'
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
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { LessonSelectorDialog } from './LessonSelectorDialog'
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
  resolveSelectedItem,
  stringToColor,
  formatDuration,
  deepCloneSourceDocument,
} from './builder-utils'

const generateId = utilsGenerateId

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
  Wrench,
  FileCheck2,
  LayoutPanelTop,
  Brain,
  ClipboardList,
  RefreshCw,
} from 'lucide-react'
import { ChevronLeft as ChevronLeftIcon } from 'lucide-react'
import { EnhancedWhiteboard } from '@/components/class/enhanced-whiteboard'
import { useCourseBuilderState } from './hooks/useCourseBuilderState'
import {
  InsightsReportView,
  type PollResultOption,
  type QuestionAnswerEntry,
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
    },
    ref
  ) {
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
    const [builderNodes, setBuilderNodes] = useState<CourseBuilderNode[]>([])
    const [liveNodes, setLiveNodes] = useState<CourseBuilderNode[]>([])

    const cloneNodes = useCallback((value: CourseBuilderNode[]) => {
      if (typeof structuredClone === 'function') {
        return structuredClone(value)
      }
      return JSON.parse(JSON.stringify(value)) as CourseBuilderNode[]
    }, [])

    const nodes = useMemo(
      () => (mainTab === 'live' ? liveNodes : builderNodes),
      [mainTab, liveNodes, builderNodes]
    )

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
      const liveCourse = (insightsProps as any)?.courses?.find((c: any) => c.id === courseId)
      if (liveCourse && (liveCourse as any).categories?.length > 0) {
        return (liveCourse as any).categories[0]
      }
      return courseName?.trim() || 'Uncategorized'
    }, [(insightsProps as any)?.courses, courseId, courseName])

    // Auto-select the designated folder when course changes so users immediately see their relevant assets
    useEffect(() => {
      setAssetViewFolder(designatedFolder !== 'Uncategorized' ? designatedFolder : 'All')
    }, [courseId, designatedFolder])

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
    const [rightPanelWidth] = useState(380)
    const [leftPanelWidth, setLeftPanelWidth] = useState(340)
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

    const [taskPciMessages, setTaskPciMessages] = useState<
      { role: 'user' | 'assistant'; content: string }[]
    >([])
    const [taskExtensionPciMessages, setTaskExtensionPciMessages] = useState<
      Record<string, { role: 'user' | 'assistant'; content: string }[]>
    >({})
    const [taskExtensionPciInputs, setTaskExtensionPciInputs] = useState<Record<string, string>>({})
    const [assessmentPciMessagesMap, setAssessmentPciMessagesMap] = useState<
      Record<string, { role: 'user' | 'assistant'; content: string }[]>
    >({})
    const [taskPciInputMap, setTaskPciInputMap] = useState<Record<string, string>>({})
    const [assessmentPciInputMap, setAssessmentPciInputMap] = useState<Record<string, string>>({})
    const [taskPciLoading, setTaskPciLoading] = useState(false)
    const [assessmentPciLoadingMap, setAssessmentPciLoadingMap] = useState<Record<string, boolean>>(
      {}
    )
    const [taskPciErrorHint, setTaskPciErrorHint] = useState('')
    const [assessmentPciErrorHintMap, setAssessmentPciErrorHintMap] = useState<
      Record<string, string>
    >({})
    // Finalized rubric the PCI assistant produced (after the tutor approves
    // finalizing). Held as a draft until the tutor clicks "Apply to PCI".
    const [taskPciDraft, setTaskPciDraft] = useState('')
    const [assessmentPciDraftMap, setAssessmentPciDraftMap] = useState<Record<string, string>>({})
    const applyTaskPciDraft = () => {
      if (!taskPciDraft) return
      setTaskBuilder(prev => {
        if (prev.activeExtensionId) {
          return {
            ...prev,
            extensions: prev.extensions.map(ext =>
              ext.id === prev.activeExtensionId ? { ...ext, pci: taskPciDraft } : ext
            ),
          }
        }
        return { ...prev, taskPci: taskPciDraft }
      })
      setTaskPciDraft('')
      toast.success('Rubric applied to PCI')
    }
    const applyAssessmentPciDraft = (assessmentId: string) => {
      const draft = assessmentPciDraftMap[assessmentId]
      if (!draft) return
      setAssessmentBuilder(prev => ({ ...prev, taskPci: draft }))
      setAssessmentPciDraftMap(prev => {
        const next = { ...prev }
        delete next[assessmentId]
        return next
      })
      toast.success('Rubric applied to PCI')
    }
    // Warn-only guardrail violations returned by the PCI/DMI endpoints, surfaced
    // to the tutor so they can confirm/correct (e.g. an invented retry policy or
    // a paraphrased exam question) before relying on the output.
    const [taskPciGuardrailWarnings, setTaskPciGuardrailWarnings] = useState<GuardrailWarning[]>([])
    const [assessmentPciGuardrailWarningsMap, setAssessmentPciGuardrailWarningsMap] = useState<
      Record<string, GuardrailWarning[]>
    >({})

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

    const [testPciSource, setTestPciSource] = useState<'task' | 'assessment'>('task')
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
    // When generate-dmi detects study material (no explicit questions), we ask
    // the tutor which question types + counts to generate before continuing.
    const [dmiSpecDialog, setDmiSpecDialog] = useState<{ type: 'task' | 'assessment' } | null>(null)
    const [dmiSpecRows, setDmiSpecRows] = useState<Array<{ type: DmiQuestionType; count: number }>>(
      []
    )
    // "Edit marks & answers" review modal — lets the tutor set per-question marks
    // and vet/approve the AI-generated answers before deploying.
    const [dmiEditor, setDmiEditor] = useState<{ source: 'task' | 'assessment' } | null>(null)

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
      setTaskDmiItems([])
      setAssessmentDmiItems([])
      setTaskDmiVersions([])
      setAssessmentDmiVersions([])
      setShowDmiVersionList(false)
      setPreviewDmiVersion(null)
      setTaskPciMessages([])
      setTaskExtensionPciMessages({})
      setTaskExtensionPciInputs({})
      setTaskPciInputMap({})
      setAssessmentPciMessagesMap({})
      setAssessmentPciInputMap({})
      setTaskPciLoading(false)
      setAssessmentPciLoadingMap({})
      setTaskPciErrorHint('')
      setAssessmentPciErrorHintMap({})
      setTaskPciGuardrailWarnings([])
      setAssessmentPciGuardrailWarningsMap({})
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
    const extractedTextFontSize = activeItemId ? (extractedTextFontSizeMap[activeItemId] ?? 14) : 14
    const setExtractedTextFontSize = (val: number) => {
      if (activeItemId) setExtractedTextFontSizeMap(prev => ({ ...prev, [activeItemId]: val }))
    }
    const activeInsightsTaskId = mainBuilderTab === 'assessment' ? loadedAssessmentId : loadedTaskId
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
    const [questionPromptMap, setQuestionPromptMap] = useState<Record<string, string>>({})
    const [showAIPollMap, setShowAIPollMap] = useState<Record<string, boolean>>({})
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

    const pollResults = useMemo<PollResultOption[]>(() => {
      const poll = activeLiveTask?.polls?.[activeLiveTask.polls.length - 1]
      if (!poll) return []
      const total = poll.responses.length
      const optionCount = poll.options?.length ?? 0
      return Array.from({ length: optionCount }, (_, i) => {
        const responders = poll.responses.filter(r => r.value === i)
        return {
          label: `Option ${String.fromCharCode(65 + i)}`,
          count: responders.length,
          percent: total > 0 ? Math.round((responders.length / total) * 100) : 0,
          students: responders.map(r => studentNameById.get(r.studentId) || 'Student'),
        }
      })
    }, [activeLiveTask, studentNameById])

    const questionAnswers = useMemo<QuestionAnswerEntry[]>(() => {
      const q = activeLiveTask?.questions?.[activeLiveTask.questions.length - 1]
      if (!q) return []
      return q.responses.map(r => ({
        studentName: studentNameById.get(r.studentId) || 'Student',
        answer: r.answer,
      }))
    }, [activeLiveTask, studentNameById])

    const setInsightsTab = (val: 'analytics' | 'poll' | 'question') =>
      setInsightsTabMap(prev => ({ ...prev, [currentInsightsId]: val }))

    const showAIPoll = showAIPollMap[currentInsightsId] ?? false
    const setShowAIPoll = (val: boolean) =>
      setShowAIPollMap(prev => ({ ...prev, [currentInsightsId]: val }))

    const showAIQuestion = showAIQuestionMap[currentInsightsId] ?? false
    const setShowAIQuestion = (val: boolean) =>
      setShowAIQuestionMap(prev => ({ ...prev, [currentInsightsId]: val }))

    const pollPrompt = pollPromptMap[currentInsightsId] ?? 'Did you find this task difficult'
    const setPollPrompt = (val: string) =>
      setPollPromptMap(prev => ({ ...prev, [currentInsightsId]: val }))

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

    // Load task data into taskBuilder
    const parsePciTranscript = (text: string) => {
      if (!text?.trim()) return [] as { role: 'user' | 'assistant'; content: string }[]
      const lines = text.split('\n')
      const messages: { role: 'user' | 'assistant'; content: string }[] = []
      let current: { role: 'user' | 'assistant'; content: string } | null = null
      for (const line of lines) {
        const trimmed = line.trim()
        const userMatch = trimmed.match(/^User:\s*(.*)$/i)
        const assistantMatch = trimmed.match(/^Assistant:\s*(.*)$/i)
        if (userMatch) {
          if (current) messages.push(current)
          current = { role: 'user', content: userMatch[1] }
          continue
        }
        if (assistantMatch) {
          if (current) messages.push(current)
          current = { role: 'assistant', content: assistantMatch[1] }
          continue
        }
        if (current) {
          current.content = `${current.content}\n${line}`
        } else if (trimmed) {
          current = { role: 'assistant', content: trimmed }
        }
      }
      if (current) messages.push(current)
      return messages
    }

    const loadTaskIntoBuilder = useCallback(
      (task: Task, activeExtensionId: string | null = null) => {
        // Prioritize description over sourceDocument - description holds edited content
        const content = task.description || task.sourceDocument?.extractedText || ''
        setTaskBuilder({
          title: task.title || '',
          taskContent: content,
          taskPci: task.instructions || '',
          details: task.shortDescription || '',
          sourceDocument: task.sourceDocument,
          extensions: (task.extensions || []).map(ext => ({
            ...ext,
            description: ext.description || '',
            sourceDocument: ext.sourceDocument,
          })),
          activeExtensionId,
        })
        setTaskDmiItems(task.dmiItems || [])
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
        setTaskPciMessages(parsePciTranscript(task.instructions || ''))
        setTaskExtensionPciMessages(
          (task.extensions || []).reduce<
            Record<string, { role: 'user' | 'assistant'; content: string }[]>
          >((acc, ext) => {
            acc[ext.id] = parsePciTranscript(ext.pci || '')
            return acc
          }, {})
        )
        setTaskExtensionPciInputs(prev => {
          const next = { ...prev }
          for (const ext of task.extensions || []) {
            if (next[ext.id] === undefined) next[ext.id] = ''
          }
          return next
        })
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
        details: '',
        sourceDocument: assessment.sourceDocument,
        extensions: [],
        activeExtensionId: null,
      })
      setAssessmentDmiItems(assessment.dmiItems || [])
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
                  extensions: taskBuilder.extensions,
                  dmiItems: taskDmiItems,
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
                  hw.dmiItems === assessmentDmiItems &&
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
                  dmiItems: assessmentDmiItems,
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
      assessmentBuilder.sourceDocument,
      assessmentDmiItems,
      assessmentDmiVersions,
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

    const moveToHomework = useCallback(
      (nodeId: string, lessonId: string, type: 'task' | 'assessment', item: Task | Assessment) => {
        const base = DEFAULT_HOMEWORK(
          nodes.flatMap(m => m.lessons.flatMap(l => l.homework || [])).length,
          'homework'
        )
        const homeworkItem: Assessment =
          type === 'task'
            ? {
                ...base,
                id: `hw-${generateId()}`,
                title: item.title || 'Task',
                description: (item as Task).description || '',
                instructions: (item as Task).instructions || '',
                dmiItems: (item as Task).dmiItems || [],
                sourceDocument: deepCloneSourceDocument((item as Task).sourceDocument),
              }
            : {
                ...cloneAssessment(item as Assessment),
                id: `hw-${generateId()}`,
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
          insightsProps.onDeployTask?.({
            id: homeworkItem.id,
            title: homeworkItem.title || 'Homework',
            content: homeworkItem.description || '',
            source: 'homework',
            dmiItems:
              homeworkItem.dmiItems?.map(i => ({
                id: i.id,
                questionNumber: i.questionNumber,
                questionText: i.questionText,
                marks: i.marks,
                questionType: i.questionType,
                options: i.options,
                pairs: i.pairs,
                hotspotImageUrl: i.hotspotImageUrl,
                regions: i.regions,
              })) || [],
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

    const handlePciSend = async (type: 'task' | 'assessment', overrideMessage?: string) => {
      const isTask = type === 'task'
      let taskId = loadedTaskId
      let assessmentId = loadedAssessmentId
      if (isTask && !taskId) {
        const created = autoCreateTask()
        taskId = created?.id ?? loadedTaskId
      }
      if (!isTask && !assessmentId) {
        const created = autoCreateAssessment()
        assessmentId = created?.id ?? loadedAssessmentId
      }

      const activeTaskInput = taskBuilder.activeExtensionId
        ? taskExtensionPciInputs[taskBuilder.activeExtensionId] || ''
        : taskPciInputMap[taskId || ''] || ''
      const assessmentInput = assessmentPciInputMap[assessmentId || ''] || ''
      const input = overrideMessage || (isTask ? activeTaskInput : assessmentInput)
      const assessmentLoading = assessmentPciLoadingMap[assessmentId || ''] || false
      const loading = isTask ? taskPciLoading : assessmentLoading
      if (!input.trim() || loading) return

      const userMessage = input.trim()

      // Only clear input map if we didn't use an override
      if (!overrideMessage) {
        if (isTask) {
          if (taskBuilder.activeExtensionId) {
            setTaskExtensionPciInputs(prev => ({
              ...prev,
              [taskBuilder.activeExtensionId as string]: '',
            }))
          } else {
            setTaskPciInputMap(prev => ({ ...prev, [taskId || '']: '' }))
          }
        } else {
          setAssessmentPciInputMap(prev => ({ ...prev, [assessmentId || '']: '' }))
        }
      }

      const currentTaskMessages = taskBuilder.activeExtensionId
        ? taskExtensionPciMessages[taskBuilder.activeExtensionId] || []
        : taskPciMessages
      const currentAssessmentMessages = assessmentPciMessagesMap[assessmentId || ''] || []
      const nextMessages = (isTask ? currentTaskMessages : currentAssessmentMessages).concat({
        role: 'user',
        content: userMessage,
      })
      if (isTask) {
        if (taskBuilder.activeExtensionId) {
          setTaskExtensionPciMessages(prev => ({
            ...prev,
            [taskBuilder.activeExtensionId as string]: nextMessages,
          }))
        } else {
          setTaskPciMessages(nextMessages)
        }
        // PCI field is written only from a finalized rubric (pciDraft + Apply),
        // not from the running conversation transcript.
        setTaskPciLoading(true)
      } else {
        setAssessmentPciMessagesMap(prev => ({ ...prev, [assessmentId || '']: nextMessages }))
        setAssessmentPciLoadingMap(prev => ({ ...prev, [assessmentId || '']: true }))
      }

      try {
        // When an extension is active, generate from the EXTENSION's own content
        // and PCI (empty for a fresh extension), not the parent task's — an
        // extension is a separate item and must not inherit the task's content.
        const slideContent = isTask
          ? taskBuilder.activeExtensionId
            ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)?.content ||
              ''
            : taskBuilder.taskContent
          : assessmentBuilder.taskContent
        const pci = isTask
          ? taskBuilder.activeExtensionId
            ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)?.pci || ''
            : taskBuilder.taskPci
          : assessmentBuilder.taskPci
        const sessionId = isTask
          ? taskId
            ? `pci-task:${taskId}`
            : undefined
          : assessmentId
            ? `pci-assessment:${assessmentId}`
            : undefined
        const activeExt =
          isTask && taskBuilder.activeExtensionId
            ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)
            : null
        const extensionName = activeExt ? activeExt.name : undefined

        const sourceDocData = isTask
          ? activeExt?.sourceDocument || taskSourceDocument || taskBuilder.sourceDocument
          : currentAssessmentDocument
        const sourceDocument = sourceDocData
          ? {
              fileName: sourceDocData.fileName,
              fileUrl: sourceDocData.fileUrl,
              mimeType: sourceDocData.mimeType,
            }
          : undefined

        // If a PDF document is attached, render its pages (cached) so the PCI model can
        // actually SEE the document instead of guessing from the title.
        let pdfPages: string[] | undefined
        if (sourceDocData?.mimeType === 'application/pdf' && sourceDocData.fileUrl) {
          const cacheKey = sourceDocData.fileUrl
          const cached = pdfPageCache.get(cacheKey)
          if (cached) {
            pdfPages = cached
          } else {
            try {
              const rendered = await renderPdfToImages(sourceDocData.fileUrl, 3)
              if (rendered.length > 0) {
                pdfPages = rendered
                pdfPageCache.set(cacheKey, rendered)
              }
            } catch {
              // Vision is best-effort; fall back to text-only on render failure.
            }
          }
        }

        const response = await fetch('/api/ai/pci-master', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage,
            sessionId,
            context: {
              type,
              title: isTask ? taskBuilder.title : assessmentBuilder.title,
              content: slideContent,
              pci,
              extensionName,
              sourceDocument,
            },
            pdfPages,
          }),
        })
        if (!response.ok) {
          let errorMessage = `Failed to get AI response (${response.status})`
          try {
            const errorBody = await response.json()
            if (errorBody?.error) {
              errorMessage = errorBody.errorId
                ? `${errorBody.error} (Error ID: ${errorBody.errorId})`
                : errorBody.error
            }
          } catch {
            // ignore JSON parse failures
          }
          throw new Error(errorMessage)
        }
        const data = await response.json()
        const warnings: GuardrailWarning[] = Array.isArray(data.guardrailWarnings)
          ? data.guardrailWarnings
          : []
        // The PCI assistant returns a finalized, clean rubric in `pciDraft` ONLY
        // after the tutor approves finalizing; until then it's empty. We hold it
        // as a draft and write it to the PCI field only when the tutor clicks
        // "Apply to PCI" — the conversation never pollutes the saved PCI.
        const pciDraft = typeof data.pciDraft === 'string' ? data.pciDraft.trim() : ''
        const assistantMessage = {
          role: 'assistant' as const,
          content: data.response || 'Unable to respond.',
        }
        if (isTask) {
          const updated = nextMessages.concat(assistantMessage)
          if (taskBuilder.activeExtensionId) {
            setTaskExtensionPciMessages(prev => ({
              ...prev,
              [taskBuilder.activeExtensionId as string]: updated,
            }))
          } else {
            setTaskPciMessages(updated)
          }
          if (pciDraft) setTaskPciDraft(pciDraft)
          setTaskPciErrorHint('')
          setTaskPciGuardrailWarnings(warnings)
        } else {
          const updated = nextMessages.concat(assistantMessage)
          setAssessmentPciMessagesMap(prev => ({ ...prev, [assessmentId || '']: updated }))
          if (pciDraft) {
            setAssessmentPciDraftMap(prev => ({ ...prev, [assessmentId || '']: pciDraft }))
          }
          setAssessmentPciErrorHintMap(prev => ({ ...prev, [assessmentId || '']: '' }))
          setAssessmentPciGuardrailWarningsMap(prev => ({
            ...prev,
            [assessmentId || '']: warnings,
          }))
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? `PCI Assistant error: ${error.message}`
            : 'PCI Assistant error. Please try again.'
        toast.error(message)
        const hint =
          error instanceof Error && error.message
            ? error.message
            : 'Unable to reach the PCI assistant. Please try again.'
        if (isTask) setTaskPciErrorHint(hint)
        else setAssessmentPciErrorHintMap(prev => ({ ...prev, [assessmentId || '']: hint }))
        const errorMessage = {
          role: 'assistant' as const,
          content: 'Sorry, there was an error processing your request. Please try again.',
        }
        if (isTask) {
          const updated = nextMessages.concat(errorMessage)
          if (taskBuilder.activeExtensionId) {
            setTaskExtensionPciMessages(prev => ({
              ...prev,
              [taskBuilder.activeExtensionId as string]: updated,
            }))
          } else {
            setTaskPciMessages(updated)
          }
        } else {
          const updated = nextMessages.concat(errorMessage)
          setAssessmentPciMessagesMap(prev => ({ ...prev, [assessmentId || '']: updated }))
        }
      } finally {
        if (isTask) setTaskPciLoading(false)
        else setAssessmentPciLoadingMap(prev => ({ ...prev, [assessmentId || '']: false }))
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

      try {
        // Call AI to score the answer
        const gradingContent =
          testPciActiveTab === 'classroom'
            ? testPciContent.classroom
            : testPciContent[testPciActiveTab] || ''

        // Truncate to avoid 2000 char limit on /api/ai/chat
        const safeGradingContent = gradingContent.slice(0, 500)
        const safePciContent = (pciContent || '').slice(0, 500)
        const safeAnswer = answer.slice(0, 500)

        const prompt = `You are an AI grading assistant. Please evaluate the following student answer.

Question/Task Content:
${safeGradingContent || 'No content provided'}

PCI (Instructions/Criteria):
${safePciContent || 'No PCI provided - use your best judgment'}

Student Answer:
${safeAnswer}

Please provide:
1. A score from 0-100
2. Brief feedback explaining the score (why it's correct or what needs improvement)

Respond in this exact format:
SCORE: [number]
FEEDBACK: [your explanation]`

        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: prompt,
          }),
        })

        if (!response.ok) throw new Error('Failed to get AI response')

        const data = await response.json()
        const aiResponse = data.response || ''

        // Parse AI response
        const scoreMatch = aiResponse.match(/SCORE:\s*(\d+)/i)
        const feedbackMatch = aiResponse.match(/FEEDBACK:\s*([\s\S]+)/i)

        const score = scoreMatch ? parseInt(scoreMatch[1]) : 50
        const feedback = feedbackMatch ? feedbackMatch[1].trim() : 'No feedback provided'

        // Update content for all affected tabs
        setTestPciContent(prev => {
          const newContent = { ...prev }
          tabsToUpdate.forEach(tab => {
            newContent[tab] =
              (newContent[tab] ? newContent[tab] + '\n\n' : '') + `AI Coach: ${feedback}`
          })
          return newContent
        })

        // Update scores for all affected tabs
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

        toast.success(`Answer scored: ${score}%`)
      } catch (error) {
        toast.error('Failed to score answer')
        // Update content for all affected tabs
        setTestPciContent(prev => {
          const newContent = { ...prev }
          tabsToUpdate.forEach(tab => {
            newContent[tab] =
              (newContent[tab] ? newContent[tab] + '\n\n' : '') +
              `AI Coach: Error - ${error instanceof Error ? error.message : 'Unknown error'}`
          })
          return newContent
        })

        // Still add the answer without scoring
        setTestPciScores(prev => {
          const newScores = { ...prev }
          tabsToUpdate.forEach(tab => {
            newScores[tab] = [
              ...(newScores[tab] || []),
              {
                score: 0,
                feedback: `Answer: ${answer}\nError: Could not score - ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ]
          })
          return newScores
        })
      } finally {
        setTestPciLoading(false)
      }
    }

    // Helper: render PDF pages to base64 PNG images
    const renderPdfToImages = async (pdfUrl: string, maxPages = 3): Promise<string[]> => {
      try {
        // Proxy external URLs through our API to avoid CORS issues (e.g. GCS)
        const fetchUrl =
          pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')
            ? `/api/proxy-file?url=${encodeURIComponent(pdfUrl)}`
            : pdfUrl
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

    // Extract the selectable text of EVERY page of a PDF. Used in preference to
    // page-images for digital papers so a long multi-page question paper is fully
    // captured (image analysis is capped at a few pages). Returns '' if the PDF
    // has no extractable text (e.g. a scan) so the caller can fall back to images.
    const extractPdfText = async (pdfUrl: string, maxPages = 30): Promise<string> => {
      try {
        const fetchUrl =
          pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')
            ? `/api/proxy-file?url=${encodeURIComponent(pdfUrl)}`
            : pdfUrl
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

    // Apply a per-question edit (marks / answer / rubric) to the loaded DMI.
    // Updates BOTH the live items state (used by deploy + the View-DMI modal)
    // and the matching version (persisted with the course on save) so edits
    // survive a deploy and a reload.
    const applyDmiEdit = (
      source: 'task' | 'assessment',
      itemId: string,
      patch: Partial<DMIQuestion>
    ) => {
      const editItems = (arr: DMIQuestion[]) =>
        arr.map(q => (q.id === itemId ? { ...q, ...patch } : q))
      const activeVersionId = testPciViewMode.startsWith('dmi_')
        ? testPciViewMode.slice('dmi_'.length)
        : null
      const editVersions = (vs: DMIVersion[]) => {
        if (vs.length === 0) return vs
        const targetId = activeVersionId ?? vs[vs.length - 1].id
        return vs.map(v => (v.id === targetId ? { ...v, items: editItems(v.items) } : v))
      }
      if (source === 'task') {
        setTaskDmiItems(editItems)
        setTaskDmiVersions(editVersions)
      } else {
        setAssessmentDmiItems(editItems)
        setAssessmentDmiVersions(editVersions)
      }
    }

    // Generate DMI using AI from content or PDF images with versioning.
    // `questionSpec` is supplied (via the spec dialog) when the source is study
    // material and the tutor has chosen which question types/counts to generate.
    const handleGenerateDMI = async (
      type: 'task' | 'assessment',
      questionSpec?: Array<{ type: DmiQuestionType; count: number }>
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

      setDmiGenerating(true)
      try {
        let pdfPages: string[] | undefined
        let pdfText: string | undefined
        if (hasPdf) {
          toast.info('Analyzing PDF with AI...')
          // Prefer full-text extraction so EVERY page of a multi-page paper is
          // captured (image analysis is capped at a few pages and would miss
          // later questions). Fall back to page images for scanned PDFs.
          const extracted = await extractPdfText(sourceDoc.fileUrl, 30)
          if (extracted.trim().length > 200) {
            pdfText = extracted.slice(0, 50000)
          } else {
            pdfPages = await renderPdfToImages(sourceDoc.fileUrl, 8)
          }
        }

        const response = await fetch('/api/ai/generate-dmi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            title: builder.title,
            content: pdfText ?? (!hasPdf && hasContent ? content : undefined),
            pdfPages,
            questionSpec,
          }),
        })

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(errorBody.error || `Failed to generate DMI (${response.status})`)
        }

        const data = await response.json()

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

        if (questions.length === 0) {
          toast.warning('No questions could be generated. Try adding more content.')
          return
        }

        const items: DMIQuestion[] = questions.map((q: any) => ({
          id: `dmi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          questionNumber: q.questionNumber || 1,
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
              let block = `${q.questionNumber}. ${q.questionText}`
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
          dmiItems = items.map(q => ({ ...q, questionText: `Question ${q.questionNumber}` }))
          if (isTask) {
            setTaskBuilder(prev => ({
              ...prev,
              taskContent: generatedClassroomContent,
              sourceDocument: undefined,
            }))
            setTaskSourceDocument(undefined)
          } else {
            setAssessmentBuilder(prev => ({
              ...prev,
              taskContent: generatedClassroomContent,
              sourceDocument: undefined,
            }))
            setAssessmentSourceDocument(undefined)
          }
          toast.info(
            'Generated questions set as the Classroom content; the original material will not be deployed.'
          )
        }

        const existingVersions = isTask ? taskDmiVersions : assessmentDmiVersions
        const nextVersionNumber = existingVersions.length + 1
        const newVersion: DMIVersion = {
          id: `dmi-version-${Date.now()}`,
          versionNumber: nextVersionNumber,
          items: dmiItems,
          createdAt: Date.now(),
          taskId: isTask ? loadedTaskId || undefined : undefined,
          assessmentId: !isTask ? loadedAssessmentId || undefined : undefined,
        }

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

    const handleDeployAssessmentDmi = useCallback(() => {
      if (!loadedAssessmentId) {
        toast.error('Select an assessment to deploy')
        return
      }
      if (!insightsProps?.sessionId) {
        toast.error('Select a course session for insights')
        return
      }

      const task: LiveTask = {
        id: loadedAssessmentId,
        title: assessmentBuilder.title || 'Assessment',
        content: assessmentBuilder.taskContent,
        source: 'assessment',
        dmiItems: assessmentDmiItems.map(item => ({
          id: item.id,
          questionNumber: item.questionNumber,
          questionText: item.questionText,
          // Marks are shown to students; the answer key / rubric is NOT deployed.
          marks: item.marks,
          // Carry the answer-input type + options/pairs so the student gets the
          // right control (e.g. mcq letter choices), not a plain textarea.
          questionType: item.questionType,
          options: item.options,
          pairs: item.pairs,
          hotspotImageUrl: item.hotspotImageUrl,
          regions: item.regions,
        })),
        deployedAt: Date.now(),
        polls: [],
        questions: [],
        sourceDocument: currentAssessmentDocument
          ? {
              fileName: currentAssessmentDocument.fileName,
              fileUrl: currentAssessmentDocument.fileUrl,
              fileKey: currentAssessmentDocument.fileKey,
              mimeType: currentAssessmentDocument.mimeType,
            }
          : undefined,
      }

      // Success is confirmed by the server's task:deployed broadcast (handled in
      // insights/page.tsx), not optimistically here.
      insightsProps.onDeployTask?.(task)
    }, [assessmentBuilder, assessmentDmiItems, insightsProps, loadedAssessmentId])

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

    useEffect(() => {
      if (lastInitialCourseBuilderNodesKeyRef.current === initialCourseBuilderNodesKey) return
      lastInitialCourseBuilderNodesKeyRef.current = initialCourseBuilderNodesKey
      const normalized = normalizeCourseBuilderNodesForAssessments(
        resolvedInitialCourseBuilderNodes
      )
      setBuilderNodes(normalized)
      setLiveNodes(isStudentView || saveMode !== 'draft' ? cloneNodes(normalized) : [])
    }, [initialCourseBuilderNodesKey, resolvedInitialCourseBuilderNodes])

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

    // Add handlers
    const addCourseBuilderNode = () => {
      // Create a new lesson directly without opening modal
      const newOrder = nodes.length
      const newCourseBuilderNode = DEFAULT_NODE(newOrder)
      // Ensure the title follows "Lesson N" format
      newCourseBuilderNode.title = `Lesson ${newOrder + 1}`
      newCourseBuilderNode.lessons[0].title = `Lesson ${newOrder + 1}`

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

    // Helper function to renumber lesson titles after reordering
    const renumberCourseBuilderNodes = (mods: CourseBuilderNode[]): CourseBuilderNode[] => {
      return mods.map((mod, idx) => ({
        ...mod,
        order: idx,
        title: mod.title.replace(/^Lesson \d+/, `Lesson ${idx + 1}`),
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
          const asAssessment = {
            ...cloneAssessment(hw),
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
          // Renumber lessons after reordering
          newCourseBuilderNodes[nIdx].lessons = movedLessons.map((lesson, idx) => ({
            ...lesson,
            order: idx,
            title: lesson.title.replace(/^Lesson \d+/, `Lesson ${idx + 1}`),
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

    const deleteCourseBuilderNode = async (nodeId: string) => {
      const nodeToDelete = nodes.find(m => m.id === nodeId)
      if (nodeToDelete) {
        const keys = nodeToDelete.lessons.flatMap(l => collectLessonFileKeys(l))
        if (keys.length > 0) await cleanupGcsFiles(keys)
      }
      const nextNodes = nodes.filter(m => m.id !== nodeId)
      setCourseBuilderNodes(nextNodes)
      if (mainTab !== 'live') await saveNodesIfPossible(nextNodes)
      toast.success('Lesson deleted')
    }

    const deleteLesson = async (nodeId: string, lessonId: string) => {
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
      setSelectedItem(null)
      toast.success('Assessment removed')
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

            if (
              asset.folder &&
              designatedFolder !== 'Uncategorized' &&
              asset.folder !== designatedFolder
            ) {
              const confirmLoad = window.confirm(
                `This document belongs to the folder "${asset.folder}", but you are currently editing "${designatedFolder}". Are you sure you want to load it here?`
              )
              if (!confirmLoad) return
            }

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

          const newDoc = {
            fileName: newAsset.name,
            fileUrl: newAsset.url,
            fileKey: newAsset.fileKey,
            mimeType: newAsset.mimeType,
            uploadedAt: new Date().toISOString(),
            extractedText: newAsset.content,
          }

          setAssessmentSourceDocument(newDoc)
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

    const handleLoadAsset = (asset: {
      name: string
      content?: string
      url?: string
      fileKey?: string
      mimeType?: string
      folder?: string
    }) => {
      // Warn if loading from a folder that doesn't match the current course's designated folder
      if (
        asset.folder &&
        designatedFolder !== 'Uncategorized' &&
        asset.folder !== designatedFolder
      ) {
        const confirmLoad = window.confirm(
          `This document belongs to the folder "${asset.folder}", but you are currently editing "${designatedFolder}". Are you sure you want to load it here?`
        )
        if (!confirmLoad) return
      }

      setAssetToLoad(asset)

      // If we already opened the view assets modal from an assessment or task kebab menu,
      // we know the target context, so we can skip the 'main' choice and go straight to options.
      if (assetPickerTarget === 'assessment') {
        setLoadAsStep('assessment-options')
      } else if (assetPickerTarget === 'task') {
        setLoadAsStep('task-options')
      } else {
        setLoadAsStep('main')
      }

      setLoadAsModalOpen(true)
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
      <div className="mb-3 mt-3 rounded-xl border bg-white shadow-sm">
        {/* Header row matching image 1 */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold text-slate-700">Assets</span>
          <div className="flex items-center gap-3">
            <button
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
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
                    const newAssets = await Promise.all(
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

                        // Upload to server — any file gets converted to PDF
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
                          }
                        } catch {
                          // Fallback: no server URL
                        }

                        return {
                          id: `asset-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                          name: f.name,
                          content: textContent,
                          url: fileUrl || undefined,
                          fileKey: fileKey || undefined,
                          mimeType: fileMimeType || undefined,
                          folder:
                            designatedFolder !== 'Uncategorized' ? designatedFolder : undefined,
                        }
                      })
                    )
                    setCourseAssets(prev => [...prev, ...newAssets])
                    if (files.length > 0) toast.success(`${files.length} asset(s) imported`)
                    e.target.value = ''
                  }}
                />
                <span
                  className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-700"
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
                  'flex items-center justify-between rounded-xl bg-slate-200/70 px-3 py-2.5 transition-colors hover:bg-slate-300/70',
                  assetPickerTarget
                    ? 'cursor-pointer ring-2 ring-transparent hover:ring-blue-400'
                    : 'cursor-grab active:cursor-grabbing'
                )}
              >
                <div className="mr-2 flex flex-1 items-center gap-2 overflow-hidden">
                  <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="flex-1 truncate text-sm font-medium text-slate-700">
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
                        className="h-7 w-7 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Asset actions"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-[100]">
                      <DropdownMenuItem
                        onSelect={() => {
                          setTimeout(() => handleLoadAsset(asset), 50)
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
            <p className="text-center text-[10px] text-gray-400">
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

                      if (loadedTaskId) {
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
                        const { nodeId, lessonId } = ensureFirstLessonContext()
                        nodeIndex = nodes.findIndex(m => m.id === nodeId)
                        lessonIndex = nodes[nodeIndex].lessons.findIndex(l => l.id === lessonId)
                      }

                      const textToInsert = assetToLoad.content || `[Asset: ${assetToLoad.name}]`

                      let pages: string[] = []
                      if (textToInsert.includes('\f')) {
                        pages = textToInsert.split('\f').filter(p => p.trim())
                      } else if (textToInsert.includes('--- Page')) {
                        pages = textToInsert.split(/--- Page \d+ ---/).filter(p => p.trim())
                      } else {
                        const chunks = textToInsert.split(/\n\n+/).filter(p => p.trim().length > 50)
                        pages = chunks.length > 1 ? chunks : [textToInsert]
                      }

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

                        if (isPdf && assetToLoad.url) {
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

                        if (isPdf && assetToLoad.url && !pdfSplitSucceeded) {
                          // The document is a PDF and we attempted to split it into one
                          // task per page, but fetching/splitting failed (e.g. the file
                          // is missing from storage or its link expired). Surface the
                          // real reason instead of silently degrading to a single task
                          // with a broken document link.
                          toast.error(
                            `Could not split '${assetToLoad.name}' into page tasks${
                              pdfSplitError ? `: ${pdfSplitError}` : ''
                            }. The task was left unchanged.`
                          )
                          return
                        }

                        if (!pdfSplitSucceeded) {
                          // Text-based split for non-PDF (or url-less) assets: one task per page.
                          pages.forEach((pageContent, idx) => {
                            if (existingTask && existingTaskIndex !== -1 && idx === 0) {
                              updatedExistingTask = {
                                ...existingTask,
                                description: pageContent,
                                sourceDocument:
                                  assetToLoad.url && assetToLoad.mimeType
                                    ? {
                                        fileName: assetToLoad.name,
                                        fileUrl: assetToLoad.url,
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
                              if (assetToLoad.url && assetToLoad.mimeType) {
                                newTask.sourceDocument = {
                                  fileName: assetToLoad.name,
                                  fileUrl: assetToLoad.url,
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
                          setTaskPdfVisibleMap(prev => ({ ...prev, [taskId]: true }))
                          setTaskTextVisibleMap(prev => ({ ...prev, [taskId]: false }))
                        } else if (newTasks.length > 0) {
                          const firstNew = newTasks[0]
                          setSelectedItem({ type: 'task', id: firstNew.id })
                          loadTaskIntoBuilder(firstNew)

                          setTaskPdfVisibleMap(prev => ({ ...prev, [firstNew.id]: true }))
                          setTaskTextVisibleMap(prev => ({ ...prev, [firstNew.id]: false }))

                          setTimeout(() => {
                            handlePciSend(
                              'task',
                              `I just uploaded a document named '${assetToLoad?.name}'. Please provide a brief summary of its content, especially noting any diagrams or images if applicable, and ask me to confirm if you got it right so we can build a rubric together.`
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

                        if (isPdf && assetToLoad.url) {
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
                          if (textToInsert.includes('\f')) {
                            pages = textToInsert.split('\f').filter(p => p.trim())
                          } else if (textToInsert.includes('--- Page')) {
                            pages = textToInsert.split(/--- Page \d+ ---/).filter(p => p.trim())
                          } else {
                            const chunks = textToInsert
                              .split(/\n\n+/)
                              .filter(p => p.trim().length > 50)
                            pages = chunks.length > 1 ? chunks : [textToInsert]
                          }
                        }

                        let nodeIndex = -1
                        let lessonIndex = -1
                        let existingTaskIndex = -1
                        let existingTask: Task | null = null

                        if (loadedTaskId) {
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
                          const { nodeId, lessonId } = ensureFirstLessonContext()
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
                        } else if (assetToLoad.url && assetToLoad.mimeType) {
                          newTask.sourceDocument = {
                            fileName: assetToLoad.name,
                            fileUrl: assetToLoad.url,
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
                            `I just uploaded a document named '${assetToLoad?.name}'. Please provide a brief summary of its content, especially noting any diagrams or images if applicable, and ask me to confirm if you got it right so we can build a rubric together.`
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
                    onClick={() => {
                      if (!assetToLoad) return

                      let nodeIndex = -1
                      let lessonIndex = -1
                      let existingAssess: Assessment | undefined

                      if (loadedAssessmentId) {
                        for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
                          for (let lIdx = 0; lIdx < nodes[nIdx].lessons.length; lIdx++) {
                            const hw = nodes[nIdx].lessons[lIdx].homework.find(
                              h => h.id === loadedAssessmentId
                            )
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
                        const { nodeId, lessonId } = ensureFirstLessonContext()
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

                      const extractedText = assetToLoad.content || `[Asset: ${assetToLoad.name}]`
                      targetAssess.description = extractedText
                      if (assetToLoad.url) {
                        targetAssess.sourceDocument = {
                          fileName: assetToLoad.name,
                          fileUrl: assetToLoad.url,
                          fileKey: assetToLoad.fileKey,
                          mimeType: assetToLoad.mimeType || 'application/pdf',
                          uploadedAt: new Date().toISOString(),
                          extractedText,
                        }
                      }

                      const newCourseBuilderNodes = [...nodes]

                      if (existingAssess) {
                        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework =
                          newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework.map(h =>
                            h.id === loadedAssessmentId ? targetAssess : h
                          )
                      } else {
                        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework.push(
                          targetAssess
                        )
                      }

                      setCourseBuilderNodes(newCourseBuilderNodes)
                      setMainBuilderTab('assessment')
                      setSelectedItem({ type: 'assessment', id: targetAssess.id })
                      loadAssessmentIntoBuilder(targetAssess)

                      // Show PDF by default, hide text
                      setAssessmentPdfVisibleMap(prev => ({ ...prev, [targetAssess.id]: true }))
                      setAssessmentTextVisibleMap(prev => ({ ...prev, [targetAssess.id]: false }))

                      toast.success(`Loaded '${assetToLoad?.name}' into Assessment`)
                      setLoadAsModalOpen(false)
                      setAssetToLoad(null)

                      // Auto-send first PCI message
                      setTimeout(() => {
                        handlePciSend(
                          'assessment',
                          `I just uploaded a document named '${assetToLoad?.name}'. Please provide a brief summary of its content, especially noting any diagrams or images if applicable, and ask me to confirm if you got it right so we can build a rubric together.`
                        )
                      }, 500)
                    }}
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
              {/* Modal Header — only title/subtitle, no custom X (Dialog has built-in close) */}
              <div>
                <h3 className="text-lg font-bold text-gray-900">Assets</h3>
                <p className="text-xs text-gray-500">
                  View, organize, and load uploaded assets available in this course.
                </p>
              </div>

              {/* Toolbar — aligned with the two panels below */}
              <div className="flex gap-4">
                <div className="w-64 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1 rounded-full border-0 bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                    onClick={() => {
                      const name = prompt('Folder name:')
                      if (name && name.trim()) {
                        const trimmed = name.trim()
                        if (!computedAssetFolders.includes(trimmed)) {
                          setAssetFoldersList(prev => [...prev, trimmed])
                          toast.success(`Folder "${trimmed}" created`)
                        } else {
                          toast.error(`Folder "${trimmed}" already exists`)
                        }
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" /> Folder
                  </Button>
                </div>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
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
                        <button
                          key={folder}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                            assetViewFolder === folder
                              ? 'bg-blue-50 font-medium text-blue-600'
                              : 'text-gray-600 hover:bg-gray-50'
                          )}
                          onClick={() => setAssetViewFolder(folder)}
                        >
                          <span className="flex items-center gap-2">
                            <ChevronDown className="h-3.5 w-3.5" />
                            <span
                              className={
                                assetViewFolder === folder ? 'text-blue-600' : 'text-gray-700'
                              }
                            >
                              {folder}
                            </span>
                          </span>
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                            {folder === 'All'
                              ? courseAssets.length
                              : courseAssets.filter(a => a.folder === folder).length}
                          </span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                {/* Asset list card */}
                <div className="flex flex-1 flex-col rounded-xl bg-white p-4 shadow-sm">
                  <ScrollArea className="flex-1">
                    <div className="space-y-2">
                      {filteredViewAssets.length === 0 ? (
                        <p className="py-8 text-center text-sm text-gray-400">
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
                                ? 'cursor-pointer bg-slate-100 ring-2 ring-transparent hover:bg-slate-200 hover:ring-blue-400'
                                : 'cursor-grab bg-slate-100 hover:bg-slate-200 active:cursor-grabbing'
                            )}
                          >
                            <div className="mr-3 flex flex-1 items-center gap-3 overflow-hidden">
                              <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-gray-800">
                                  {asset.name}
                                </p>
                                <p className="text-[11px] text-gray-500">
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
                                className="h-7 rounded-md border border-gray-200 bg-white px-2 text-[11px] text-gray-600 outline-none focus:border-blue-400"
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
                                    className="h-7 w-7 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="z-[600]">
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      setAssetsViewOpen(false)
                                      setTimeout(() => handleLoadAsset(asset), 50)
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

    const currentAssessmentDocument = assessmentSourceDocument || assessmentBuilder.sourceDocument
    const hasAssessmentDocument = !!currentAssessmentDocument

    const activeTaskPciMessages = taskBuilder.activeExtensionId
      ? taskExtensionPciMessages[taskBuilder.activeExtensionId] || []
      : taskPciMessages
    const activeTaskPciInput = taskBuilder.activeExtensionId
      ? taskExtensionPciInputs[taskBuilder.activeExtensionId] || ''
      : taskPciInputMap[loadedTaskId || ''] || ''
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

    // We already defined hasTaskDocument above, so we don't redefine it here
    const taskTextVisible = loadedTaskId
      ? (taskTextVisibleMap[loadedTaskId] ?? !hasTaskDocument)
      : !hasTaskDocument
    const taskPdfVisible = loadedTaskId
      ? (taskPdfVisibleMap[loadedTaskId] ?? hasTaskDocument)
      : hasTaskDocument

    const setTaskTextVisible = (val: boolean) => {
      if (loadedTaskId) setTaskTextVisibleMap(prev => ({ ...prev, [loadedTaskId]: val }))
    }
    const setTaskPdfVisible = (val: boolean) => {
      if (loadedTaskId) setTaskPdfVisibleMap(prev => ({ ...prev, [loadedTaskId]: val }))
    }

    const assessmentTextVisible = loadedAssessmentId
      ? (assessmentTextVisibleMap[loadedAssessmentId] ?? !hasAssessmentDocument)
      : !hasAssessmentDocument
    const assessmentPdfVisible = loadedAssessmentId
      ? (assessmentPdfVisibleMap[loadedAssessmentId] ?? hasAssessmentDocument)
      : hasAssessmentDocument

    const setAssessmentTextVisible = (val: boolean) => {
      if (loadedAssessmentId)
        setAssessmentTextVisibleMap(prev => ({ ...prev, [loadedAssessmentId]: val }))
    }
    const setAssessmentPdfVisible = (val: boolean) => {
      if (loadedAssessmentId)
        setAssessmentPdfVisibleMap(prev => ({ ...prev, [loadedAssessmentId]: val }))
    }

    // Auto-switch task panels based on document presence
    useEffect(() => {
      if (loadedTaskId) {
        setTaskTextVisibleMap(prev => {
          const expected = !hasTaskDocument
          if (prev[loadedTaskId] === expected) return prev
          return { ...prev, [loadedTaskId]: expected }
        })
        setTaskPdfVisibleMap(prev => {
          const expected = hasTaskDocument
          if (prev[loadedTaskId] === expected) return prev
          return { ...prev, [loadedTaskId]: expected }
        })
      }
    }, [loadedTaskId, hasTaskDocument])

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

    // Auto-save course edits (debounced) — disabled in live mode
    useEffect(() => {
      if (!canEdit) return
      if (insightsProps) return
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
      insightsProps,
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
      <div className="course-builder-density flex h-full w-full flex-col items-stretch">
        <Tabs
          value={mainTab}
          onValueChange={v => {
            const next = v as 'live' | 'builder' | 'test-pci'
            // Switching to Live shows liveNodes, a snapshot separate from the
            // builderNodes the Build tab edits. Sync the latest builder content
            // into it first so edits made in Build don't vanish on the Live tab.
            // This is a local view sync only — it does not deploy to students.
            // Bump prevMainTabRef so the transition effect skips a redundant sync.
            if (next === 'live') {
              handleSyncToLive()
              prevMainTabRef.current = 'live'
            }
            // setMainTab notifies the parent route (and updates local state when
            // the component is used uncontrolled).
            setMainTab(next)
          }}
          className="flex h-full w-full flex-1 flex-col bg-gray-50/50 px-6 pt-0"
        >
          <div className="relative flex h-full w-full min-w-0 flex-1 gap-6 pb-6 pt-0">
            {/* LEFT PANEL - Course Structure (resizable, ~75% of original width) */}
            {/* Floating collapsed/expanded pill */}
            <div
              className="absolute top-1/2 z-50 flex h-16 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-full border border-l-0 border-[#E5E7EB] bg-white shadow-[2px_0_8px_rgba(0,0,0,0.08)] transition-all hover:w-10 hover:bg-slate-50"
              style={{ left: leftPanelHidden ? 0 : leftPanelWidth - 16 }}
              onClick={() => setLeftPanelHidden(!leftPanelHidden)}
              title={leftPanelHidden ? 'Show curriculum' : 'Hide curriculum'}
            >
              {leftPanelHidden ? (
                <ChevronRight className="h-5 w-5 text-[#2B5FB8]" />
              ) : (
                <ChevronLeft className="h-5 w-5 text-[#2B5FB8]" />
              )}
            </div>

            {!leftPanelHidden && (
              <div
                className="relative z-40 order-1 flex min-h-0 shrink-0 flex-col"
                ref={leftPanelRef}
                style={{ width: leftPanelWidth }}
              >
                <div className="flex h-full min-h-0 flex-col">
                  <Card
                    padding="none"
                    className="flex h-full min-h-0 flex-1 flex-col rounded-[20px] border border-[rgba(0,0,0,0.04)] bg-[#FFFFFF] shadow-[0_18px_45px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]"
                  >
                    <div className="sticky top-0 z-10 flex h-9 items-center justify-center rounded-t-[20px] bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] px-4 text-sm font-semibold text-white">
                      Curriculum
                    </div>
                    <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-0 pt-5">
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
                            className="w-full rounded-2xl border border-[#E5E7EB] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1F2933] outline-none placeholder:text-[#98A2B3] focus:border-[#B8CCFF] focus:ring-2 focus:ring-[#DCEAFF]"
                          />
                        </div>
                      )}

                      <ScrollArea className="min-h-0 flex-1 pr-1">
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
                                                  className="text-red-600 focus:bg-red-50 focus:text-red-600"
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
                                                        idx ===
                                                        (primaryLesson.tasks?.length || 0) - 1
                                                      }
                                                    >
                                                      <div
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
                                                            (e.target as HTMLElement).closest(
                                                              'input'
                                                            )
                                                          )
                                                            return
                                                          // Auto-save current assessment if switching from one
                                                          if (loadedAssessmentId) {
                                                            setCourseBuilderNodes(prev =>
                                                              prev.map(node => ({
                                                                ...node,
                                                                lessons: node.lessons.map(
                                                                  lesson => ({
                                                                    ...lesson,
                                                                    homework: lesson.homework.map(
                                                                      hw =>
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
                                                                  })
                                                                ),
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
                                                                lessons: node.lessons.map(
                                                                  lesson => ({
                                                                    ...lesson,
                                                                    tasks: lesson.tasks.map(t =>
                                                                      t.id === loadedTaskId
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
                                                                  })
                                                                ),
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
                                                                ;(
                                                                  e.target as HTMLInputElement
                                                                ).blur()
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
                                                              {mainTab === 'live' &&
                                                                insightsProps?.onDeployTask && (
                                                                  <DropdownMenuItem
                                                                    className="font-medium text-emerald-600 focus:text-emerald-600"
                                                                    onClick={e => {
                                                                      e.stopPropagation()
                                                                      const dmiVersion =
                                                                        (
                                                                          task.dmiVersions || []
                                                                        ).find(
                                                                          v =>
                                                                            v.id ===
                                                                            task.activeDmiVersionId
                                                                        ) ||
                                                                        (task.dmiVersions || [])[0]
                                                                      insightsProps.onDeployTask?.({
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
                                                                        setCourseBuilderNodes(
                                                                          prev =>
                                                                            prev.map(node => ({
                                                                              ...node,
                                                                              lessons:
                                                                                node.lessons.map(
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
                                                                        setCourseBuilderNodes(
                                                                          prev =>
                                                                            prev.map(mod => ({
                                                                              ...mod,
                                                                              lessons:
                                                                                mod.lessons.map(
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
                                                                      if (
                                                                        loadedTaskId !== task.id
                                                                      ) {
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
                                                                      setTaskExtensionPciMessages(
                                                                        prev => ({
                                                                          ...prev,
                                                                          [newExtension.id]: [],
                                                                        })
                                                                      )
                                                                      setTaskExtensionPciInputs(
                                                                        prev => ({
                                                                          ...prev,
                                                                          [newExtension.id]: '',
                                                                        })
                                                                      )
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
                                                                              tasks:
                                                                                lesson.tasks.map(
                                                                                  t =>
                                                                                    t.id === task.id
                                                                                      ? {
                                                                                          ...t,
                                                                                          extensions:
                                                                                            [
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
                                                    </SortableTreeItem>
                                                    {loadedTaskId === task.id &&
                                                      taskBuilder.extensions.length > 0 && (
                                                        <div className="mb-px ml-0 mt-px space-y-px">
                                                          <div
                                                            className="flex cursor-pointer items-center justify-between rounded-none border-0 bg-gray-100/50 px-3 py-2 text-xs font-medium text-gray-500 shadow-inner transition-colors hover:bg-gray-100"
                                                            onClick={() =>
                                                              toggleExtensions(task.id)
                                                            }
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
                                                                        <DropdownMenuTrigger
                                                                          asChild
                                                                        >
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
                                                                                insightsProps.onDeployTask?.(
                                                                                  {
                                                                                    id: ext.id,
                                                                                    title: ext.name,
                                                                                    content:
                                                                                      ext.description ||
                                                                                      ext.name,
                                                                                    source: 'task',
                                                                                    parentId:
                                                                                      task.id,
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
                                                                                  }
                                                                                )
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
                                                                              setTaskExtensionPciMessages(
                                                                                prev => {
                                                                                  const next = {
                                                                                    ...prev,
                                                                                  }
                                                                                  delete next[
                                                                                    ext.id
                                                                                  ]
                                                                                  return next
                                                                                }
                                                                              )
                                                                              setTaskExtensionPciInputs(
                                                                                prev => {
                                                                                  const next = {
                                                                                    ...prev,
                                                                                  }
                                                                                  delete next[
                                                                                    ext.id
                                                                                  ]
                                                                                  return next
                                                                                }
                                                                              )
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
                                                                                    prev.map(
                                                                                      mod => ({
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
                                                                                      })
                                                                                    )
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
                                                                    insightsProps.onDeployTask?.({
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
                                                      sectionRefs.current[`${node.id}:homework`] =
                                                        el
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
                                                                        lessons: n.lessons.map(
                                                                          l => ({
                                                                            ...l,
                                                                            homework:
                                                                              l.homework.map(h =>
                                                                                h.id === hw.id
                                                                                  ? {
                                                                                      ...h,
                                                                                      title:
                                                                                        newTitle,
                                                                                    }
                                                                                  : h
                                                                              ),
                                                                          })
                                                                        ),
                                                                      }))
                                                                    )
                                                                    if (
                                                                      loadedAssessmentId === hw.id
                                                                    ) {
                                                                      setAssessmentBuilder(
                                                                        prev => ({
                                                                          ...prev,
                                                                          title: newTitle,
                                                                        })
                                                                      )
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
                                                                    onClick={e =>
                                                                      e.stopPropagation()
                                                                    }
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
                                                                            (hw.dmiVersions ||
                                                                              [])[0]
                                                                          insightsProps.onDeployTask?.(
                                                                            {
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
                                                                              deployedAt:
                                                                                Date.now(),
                                                                              polls: [],
                                                                              questions: [],
                                                                            }
                                                                          )
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
                                                        duplicateCourseBuilderNodeQuiz(
                                                          node.id,
                                                          quiz
                                                        )
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
                                                        deleteCourseBuilderNodeQuiz(
                                                          node.id,
                                                          quiz.id
                                                        )
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
                                <p className="text-sm">
                                  No lessons yet. Click "Lesson" to add one.
                                </p>
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
                <div
                  className="hover:bg-primary/20 active:bg-primary/30 group absolute right-0 top-0 flex h-full w-2 cursor-col-resize items-center justify-center transition-colors"
                  onMouseDown={e => {
                    e.preventDefault()
                    leftResizeStartX.current = e.clientX
                    leftResizeStartW.current = leftPanelWidth
                    setLeftPanelResizing(true)
                  }}
                  title="Drag to resize"
                >
                  <GripHorizontal className="text-muted-foreground group-hover:text-primary h-3 w-3 rotate-90" />
                </div>
              </div>
            )}

            {!isStudentView && (
              <>
                {mainTab === 'live' ? (
                  liveRightPanelTab === 'submissions' ? (
                    <SubmissionsPanel
                      courseId={courseId || ''}
                      width={rightPanelWidth}
                      hidden={rightPanelHidden}
                      onToggleHidden={setRightPanelHidden}
                      liveSubmissions={insightsProps?.liveSubmissions}
                      headerExtra={
                        <div className="px-2 pt-4">
                          <Tabs
                            value={liveRightPanelTab}
                            onValueChange={value => {
                              if (value === 'insights' && mainTab !== 'live') return
                              setLiveRightPanelTab(value as 'submissions' | 'insights')
                            }}
                          >
                            <TabsList className="grid w-full grid-cols-2 gap-2 rounded-lg border-0 bg-gray-100 p-1 shadow-none">
                              <TabsTrigger
                                value="submissions"
                                className="h-8 rounded-md px-3 text-xs font-medium transition-all hover:bg-white hover:text-gray-900 data-[state=active]:bg-gray-800 data-[state=inactive]:bg-white data-[state=active]:text-white data-[state=inactive]:text-gray-700"
                              >
                                Submissions
                              </TabsTrigger>
                              <TabsTrigger
                                value="insights"
                                disabled={mainTab !== 'live'}
                                className="h-8 rounded-md px-3 text-xs font-medium transition-all hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 data-[state=active]:bg-gray-800 data-[state=inactive]:bg-white data-[state=active]:text-white data-[state=inactive]:text-gray-700"
                              >
                                Insights
                              </TabsTrigger>
                            </TabsList>
                          </Tabs>
                        </div>
                      }
                    />
                  ) : (
                    <>
                      <div
                        className="absolute top-1/2 z-50 flex h-16 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-l-full border border-r-0 border-[#E5E7EB] bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.08)] transition-all hover:w-10 hover:bg-slate-50"
                        style={{ right: rightPanelHidden ? 0 : rightPanelWidth - 16 }}
                        onClick={() => setRightPanelHidden(!rightPanelHidden)}
                        title={rightPanelHidden ? 'Show desk' : 'Hide desk'}
                      >
                        {rightPanelHidden ? (
                          <ChevronLeft className="h-5 w-5 text-[#2B5FB8]" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-[#2B5FB8]" />
                        )}
                      </div>
                      {!rightPanelHidden && (
                        <div
                          className="relative z-40 order-3 flex h-full min-h-0 shrink-0 flex-col"
                          style={{ width: rightPanelWidth }}
                        >
                          <div className="flex h-full min-h-0 flex-col">
                            <Card
                              padding="none"
                              className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-[rgba(0,0,0,0.04)] bg-[#FFFFFF] shadow-[0_18px_45px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]"
                            >
                              <div className="sticky top-0 z-10 flex h-9 items-center justify-center rounded-t-[20px] bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] px-4 text-sm font-semibold text-white">
                                Desk
                              </div>
                              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                                <div className="shrink-0 px-2 pt-4">
                                  <Tabs
                                    value={liveRightPanelTab}
                                    onValueChange={value => {
                                      if (value === 'insights' && mainTab !== 'live') return
                                      setLiveRightPanelTab(value as 'submissions' | 'insights')
                                    }}
                                  >
                                    <TabsList className="grid w-full grid-cols-2 gap-2 rounded-lg border-0 bg-gray-100 p-1 shadow-none">
                                      <TabsTrigger
                                        value="submissions"
                                        className="h-8 rounded-md px-3 text-xs font-medium transition-all hover:bg-white hover:text-gray-900 data-[state=active]:bg-gray-800 data-[state=inactive]:bg-white data-[state=active]:text-white data-[state=inactive]:text-gray-700"
                                      >
                                        Submissions
                                      </TabsTrigger>
                                      <TabsTrigger
                                        value="insights"
                                        disabled={mainTab !== 'live'}
                                        className="h-8 rounded-md px-3 text-xs font-medium transition-all hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 data-[state=active]:bg-gray-800 data-[state=inactive]:bg-white data-[state=active]:text-white data-[state=inactive]:text-gray-700"
                                      >
                                        Insights
                                      </TabsTrigger>
                                    </TabsList>
                                  </Tabs>
                                </div>
                                <div className="min-h-0 flex-1 overflow-hidden p-3 pt-2">
                                  {insightsProps ? (
                                    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-blue-50 p-3 pb-4">
                                      <Tabs
                                        value={insightsTab}
                                        onValueChange={value =>
                                          setInsightsTab(value as 'analytics' | 'poll' | 'question')
                                        }
                                        className="flex h-full min-h-0 flex-col"
                                      >
                                        <TabsList className="mb-2 grid w-full shrink-0 grid-cols-3 gap-2 rounded-lg bg-white p-1 shadow-none">
                                          <TabsTrigger
                                            value="analytics"
                                            className="h-7 rounded-md px-2 text-[11px] font-medium text-gray-700 transition-all hover:bg-gray-100 data-[state=inactive]:bg-transparent data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#2563EB] data-[state=active]:to-[#1D4ED8] data-[state=active]:text-white data-[state=inactive]:text-gray-700 data-[state=active]:shadow-sm"
                                          >
                                            Analytics
                                          </TabsTrigger>
                                          <TabsTrigger
                                            value="poll"
                                            className="h-7 rounded-md px-2 text-[11px] font-medium text-gray-700 transition-all hover:bg-gray-100 data-[state=inactive]:bg-transparent data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#2563EB] data-[state=active]:to-[#1D4ED8] data-[state=active]:text-white data-[state=inactive]:text-gray-700 data-[state=active]:shadow-sm"
                                          >
                                            Poll
                                          </TabsTrigger>
                                          <TabsTrigger
                                            value="question"
                                            className="h-7 rounded-md px-2 text-[11px] font-medium text-gray-700 transition-all hover:bg-gray-100 data-[state=inactive]:bg-transparent data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#2563EB] data-[state=active]:to-[#1D4ED8] data-[state=active]:text-white data-[state=inactive]:text-gray-700 data-[state=active]:shadow-sm"
                                          >
                                            Question
                                          </TabsTrigger>
                                        </TabsList>
                                        <TabsContent
                                          value="analytics"
                                          className="flex h-full flex-1 flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                        >
                                          <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
                                            <AiAssistantPanel sessionId={insightsProps.sessionId} />
                                          </div>
                                        </TabsContent>
                                        <TabsContent
                                          value="poll"
                                          className="flex flex-1 flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                        >
                                          <div className="flex-1 overflow-auto rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
                                            <InsightsReportView
                                              type="poll"
                                              pollResults={pollResults}
                                              onMentionStudent={name =>
                                                setPollPrompt(
                                                  pollPrompt
                                                    ? `${pollPrompt} @[${name}](student:${name}) `
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
                                                placeholder="Did you find this task difficult?"
                                                disableAutoResize
                                                value={pollPrompt}
                                                onChange={event =>
                                                  setPollPrompt(event.target.value)
                                                }
                                              />
                                              <div className="absolute bottom-2 right-2 flex items-center gap-1">
                                                <Button
                                                  size="icon"
                                                  variant="ghost"
                                                  className={cn(
                                                    'h-8 w-8 rounded-xl hover:bg-blue-100 hover:text-blue-700 disabled:opacity-30',
                                                    showAIPoll
                                                      ? 'bg-blue-100 text-blue-700'
                                                      : 'text-blue-600'
                                                  )}
                                                  title="Generate with Socratic AI"
                                                  onClick={() => setShowAIPoll(!showAIPoll)}
                                                  disabled={!activeInsightsTaskId}
                                                >
                                                  <Sparkles className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                  size="icon"
                                                  className="h-8 w-8 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-30"
                                                  disabled={
                                                    !activeInsightsTaskId ||
                                                    !activeInsightsTask ||
                                                    !insightsProps.sessionId ||
                                                    !pollPrompt.trim()
                                                  }
                                                  onClick={() => {
                                                    if (
                                                      !activeInsightsTaskId ||
                                                      !activeInsightsTask ||
                                                      !insightsProps.sessionId
                                                    )
                                                      return
                                                    insightsProps.onSendPoll({
                                                      taskId: currentInsightsId,
                                                      question: pollPrompt,
                                                    })
                                                    setPollPrompt('')
                                                  }}
                                                >
                                                  <Send className="h-4 w-4" />
                                                </Button>
                                              </div>
                                            </div>
                                          </div>
                                        </TabsContent>
                                        <TabsContent
                                          value="question"
                                          className="flex flex-1 flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                        >
                                          <div className="flex-1 overflow-auto rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
                                            <InsightsReportView
                                              type="question"
                                              questionAnswers={questionAnswers}
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
                                                placeholder="Ask your AI coach or share a reflection..."
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
                                                    !activeInsightsTask ||
                                                    !insightsProps.sessionId ||
                                                    !questionPrompt.trim()
                                                  }
                                                  onClick={() => {
                                                    if (
                                                      !activeInsightsTaskId ||
                                                      !activeInsightsTask ||
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
                        </div>
                      )}
                    </>
                  )
                ) : (
                  <>
                    <div
                      className="absolute top-1/2 z-50 flex h-16 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-l-full border border-r-0 border-[#E5E7EB] bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.08)] transition-all hover:w-10 hover:bg-slate-50"
                      style={{ right: rightPanelHidden ? 0 : rightPanelWidth - 16 }}
                      onClick={() => setRightPanelHidden(!rightPanelHidden)}
                      title={rightPanelHidden ? 'Show desk' : 'Hide desk'}
                    >
                      {rightPanelHidden ? (
                        <ChevronLeft className="h-5 w-5 text-[#2B5FB8]" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-[#2B5FB8]" />
                      )}
                    </div>
                    {!rightPanelHidden && (
                      <SubmissionsPanel
                        courseId={courseId || ''}
                        width={rightPanelWidth}
                        hidden={rightPanelHidden}
                        onToggleHidden={setRightPanelHidden}
                        liveSubmissions={insightsProps?.liveSubmissions}
                        headerExtra={
                          <div className="px-2 pt-4">
                            <Tabs
                              value={liveRightPanelTab}
                              onValueChange={value => {
                                if (value === 'insights') return
                                setLiveRightPanelTab(value as 'submissions' | 'insights')
                              }}
                            >
                              <TabsList className="grid w-full grid-cols-2 gap-2 rounded-lg border-0 bg-gray-100 p-1 shadow-none">
                                <TabsTrigger
                                  value="submissions"
                                  className="h-8 rounded-md px-3 text-xs font-medium transition-all hover:bg-white hover:text-gray-900 data-[state=active]:bg-gray-800 data-[state=inactive]:bg-white data-[state=active]:text-white data-[state=inactive]:text-gray-700"
                                >
                                  Submissions
                                </TabsTrigger>
                                <TabsTrigger
                                  value="insights"
                                  disabled
                                  className="h-8 rounded-md px-3 text-xs font-medium transition-all hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 data-[state=active]:bg-gray-800 data-[state=inactive]:bg-white data-[state=active]:text-white data-[state=inactive]:text-gray-700"
                                >
                                  Insights
                                </TabsTrigger>
                              </TabsList>
                            </Tabs>
                          </div>
                        }
                      />
                    )}
                  </>
                )}
              </>
            )}

            {/* CENTER PANEL - New Three-Section Design */}
            <div className="order-2 flex min-h-0 w-full min-w-0 flex-1 flex-col items-center">
              <div className="flex h-full min-h-0 w-full flex-1 grow flex-col items-stretch">
                {mainTab !== 'builder' && (
                  <Card
                    padding="none"
                    className={cn(
                      'flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_18px_45px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-9 shrink-0 items-center justify-center rounded-t-2xl px-4 text-sm font-semibold text-white',
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
                        <div className="flex h-full w-full min-w-0 flex-1 flex-col pb-0">
                          <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
                            <Tabs
                              value={testPciActiveTab}
                              onValueChange={value => {
                                if (mainTab === 'live' && value === 'student1') {
                                  setTestPciActiveTab(value)
                                  return
                                }
                                setTestPciActiveTab(value)
                              }}
                              className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col items-stretch overflow-hidden"
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
                                  className="mt-2 flex h-full w-full min-w-0 flex-1 flex-col self-stretch overflow-hidden bg-transparent data-[state=active]:flex data-[state=inactive]:hidden"
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
                                          <TabsList className="mb-2 grid w-full grid-cols-3 gap-2 rounded-lg bg-white p-1 shadow-none">
                                            <TabsTrigger
                                              value="analytics"
                                              className="h-7 rounded-md px-2 text-[11px] font-medium text-gray-700 transition-all hover:bg-gray-100 data-[state=inactive]:bg-transparent data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#2563EB] data-[state=active]:to-[#1D4ED8] data-[state=active]:text-white data-[state=inactive]:text-gray-700 data-[state=active]:shadow-sm"
                                            >
                                              Analytics
                                            </TabsTrigger>
                                            <TabsTrigger
                                              value="poll"
                                              className="h-7 rounded-md px-2 text-[11px] font-medium text-gray-700 transition-all hover:bg-gray-100 data-[state=inactive]:bg-transparent data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#2563EB] data-[state=active]:to-[#1D4ED8] data-[state=active]:text-white data-[state=inactive]:text-gray-700 data-[state=active]:shadow-sm"
                                            >
                                              Poll
                                            </TabsTrigger>
                                            <TabsTrigger
                                              value="question"
                                              className="h-7 rounded-md px-2 text-[11px] font-medium text-gray-700 transition-all hover:bg-gray-100 data-[state=inactive]:bg-transparent data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#2563EB] data-[state=active]:to-[#1D4ED8] data-[state=active]:text-white data-[state=inactive]:text-gray-700 data-[state=active]:shadow-sm"
                                            >
                                              Question
                                            </TabsTrigger>
                                          </TabsList>

                                          <TabsContent
                                            value="analytics"
                                            className="flex h-full flex-1 flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                          >
                                            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
                                              <AiAssistantPanel
                                                sessionId={insightsProps.sessionId}
                                              />
                                            </div>
                                          </TabsContent>

                                          <TabsContent
                                            value="poll"
                                            className="flex flex-1 flex-col justify-end overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                          >
                                            {showAIPoll ? (
                                              <div className="mb-2 flex-1 overflow-hidden rounded-2xl border border-blue-100 bg-white/60 shadow-sm backdrop-blur-md">
                                                <AITeachingAssistant
                                                  mode="poll"
                                                  currentTopic={
                                                    activeInsightsTask?.title ||
                                                    'General Course Content'
                                                  }
                                                  nodes={nodes}
                                                  onSelectPrompt={text => {
                                                    setPollPrompt(text)
                                                    setShowAIPoll(false)
                                                  }}
                                                  onClose={() => setShowAIPoll(false)}
                                                />
                                              </div>
                                            ) : (
                                              <InsightsReportView
                                                type="poll"
                                                pollResults={pollResults}
                                                onMentionStudent={name =>
                                                  setPollPrompt(
                                                    pollPrompt
                                                      ? `${pollPrompt} @[${name}](student:${name}) `
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
                                                  placeholder="Did you find this task difficult?"
                                                  disableAutoResize
                                                  value={pollPrompt}
                                                  onChange={event =>
                                                    setPollPrompt(event.target.value)
                                                  }
                                                />
                                                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                                                  <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className={cn(
                                                      'h-8 w-8 rounded-xl hover:bg-blue-100 hover:text-blue-700 disabled:opacity-30',
                                                      showAIPoll
                                                        ? 'bg-blue-100 text-blue-700'
                                                        : 'text-blue-600'
                                                    )}
                                                    title="Generate with Socratic AI"
                                                    onClick={() => setShowAIPoll(!showAIPoll)}
                                                    disabled={!activeInsightsTaskId}
                                                  >
                                                    <Sparkles className="h-4 w-4" />
                                                  </Button>
                                                  <Button
                                                    size="icon"
                                                    className="h-8 w-8 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-30"
                                                    disabled={
                                                      !activeInsightsTaskId ||
                                                      !activeInsightsTask ||
                                                      !insightsProps.sessionId ||
                                                      !pollPrompt.trim()
                                                    }
                                                    onClick={() => {
                                                      if (
                                                        !activeInsightsTaskId ||
                                                        !activeInsightsTask ||
                                                        !insightsProps.sessionId
                                                      )
                                                        return
                                                      insightsProps.onSendPoll({
                                                        taskId: currentInsightsId,
                                                        question: pollPrompt,
                                                      })
                                                      setPollPrompt('')
                                                    }}
                                                  >
                                                    <Send className="h-4 w-4" />
                                                  </Button>
                                                </div>
                                              </div>
                                            </div>
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
                                                questionAnswers={questionAnswers}
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
                                                  placeholder="Ask your AI coach or share a reflection..."
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
                                                      !activeInsightsTask ||
                                                      !insightsProps.sessionId ||
                                                      !questionPrompt.trim()
                                                    }
                                                    onClick={() => {
                                                      if (
                                                        !activeInsightsTaskId ||
                                                        !activeInsightsTask ||
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
                                                                  <span className="text-slate-400">
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
                                                <div className="flex h-full w-full items-center justify-center rounded-2xl border border-orange-500 bg-white p-6 text-sm text-slate-500">
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
                                          const hasDoc = !!(doc?.fileUrl || doc?.extractedText)
                                          const hasDmi = !!version

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
                                                {doc?.fileUrl ? (
                                                  <PDFViewer
                                                    key={doc.fileUrl}
                                                    fileUrl={doc.fileUrl}
                                                    className="absolute inset-0 h-full w-full"
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
                                                  {doc?.fileUrl ? (
                                                    <PDFViewer
                                                      key={doc.fileUrl}
                                                      fileUrl={doc.fileUrl}
                                                      className="absolute inset-0 h-full w-full"
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
                                                    {(version?.items ?? []).map(item => (
                                                      <div
                                                        key={item.id}
                                                        className="rounded-lg border bg-gray-50 p-3"
                                                      >
                                                        <div className="flex items-start justify-between gap-2">
                                                          <p className="text-sm font-medium text-gray-900">
                                                            <span className="mr-1 text-indigo-600">
                                                              Q{item.questionNumber}:
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
                              !(mainTab === 'live' && testPciActiveTab === 'student1') && (
                                <div
                                  className={cn(
                                    'mt-1 w-full rounded-2xl border bg-white transition-all duration-300',
                                    mainTab === 'live' ? 'border-orange-300' : 'border-violet-300'
                                  )}
                                >
                                  <div className="relative flex w-full flex-col p-px">
                                    <div className="flex w-full flex-col">
                                      <MentionTextarea
                                        mentionItems={mentionItems}
                                        className="min-h-[100px] w-full flex-1 border-0 bg-transparent px-4 py-4 text-sm shadow-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                        placeholder={
                                          testPciActiveTab === 'classroom'
                                            ? 'Enter answer (goes to both students)...'
                                            : 'Ask your AI coach or share a reflection...'
                                        }
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
                                      <div className="flex w-full items-center justify-end gap-2 px-2 pb-2">
                                        {testPciActiveTab === 'classroom' && (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-9 w-9 rounded-xl border-gray-300 shadow-sm hover:bg-gray-100"
                                                title="Toggle View Mode"
                                              >
                                                <Plus className="h-4 w-4" />
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                              align="end"
                                              className="max-h-64 w-56 overflow-y-auto"
                                            >
                                              {testPciSource === 'task' ? (
                                                <>
                                                  <DropdownMenuItem
                                                    onClick={() => setTestPciViewMode('pdf')}
                                                    className="flex items-center gap-2"
                                                  >
                                                    <FileText className="h-4 w-4" />
                                                    PDF Document
                                                    {testPciViewMode === 'pdf' && (
                                                      <CheckCircle className="ml-auto h-4 w-4 text-green-500" />
                                                    )}
                                                  </DropdownMenuItem>
                                                </>
                                              ) : (
                                                <>
                                                  {assessmentDmiVersions.length > 0 && (
                                                    <div className="text-muted-foreground px-2 py-1.5 text-xs font-semibold">
                                                      DMI Versions
                                                    </div>
                                                  )}
                                                  {assessmentDmiVersions.map(version => (
                                                    <DropdownMenuItem
                                                      key={version.id}
                                                      onClick={() =>
                                                        setTestPciViewMode(`dmi_${version.id}`)
                                                      }
                                                      className="flex items-center gap-2"
                                                    >
                                                      <Wand2 className="h-4 w-4 text-indigo-500" />
                                                      Version {version.versionNumber}
                                                      {testPciViewMode === `dmi_${version.id}` && (
                                                        <CheckCircle className="ml-auto h-4 w-4 text-green-500" />
                                                      )}
                                                    </DropdownMenuItem>
                                                  ))}
                                                </>
                                              )}
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        )}
                                        <Button
                                          size="icon"
                                          className="h-9 w-9 rounded-xl bg-slate-400 shadow-sm hover:bg-slate-500 disabled:opacity-30"
                                          disabled={
                                            !(testPciInputs[testPciActiveTab] || '').trim() ||
                                            testPciLoading
                                          }
                                          onClick={handleTestPciSubmit}
                                          title="Send"
                                        >
                                          <Send className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          className="h-9 w-9 rounded-xl bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 disabled:opacity-30"
                                          disabled={testPciLoading || !canEdit}
                                          onClick={() => {
                                            if (!canEdit) return
                                            if (onSave) {
                                              onSave(
                                                nodes.map(n => n.lessons[0] || ({} as any)),
                                                { developmentMode: devMode, previewDifficulty }
                                              )
                                              toast.success('Course and PCI saved')
                                            }
                                          }}
                                          title="Save Course & PCI"
                                        >
                                          <Save className="h-4 w-4" />
                                        </Button>
                                        {insightsProps?.onDeployTask && (
                                          <Button
                                            size="icon"
                                            className="h-9 w-9 rounded-xl bg-indigo-500 text-white shadow-sm hover:bg-indigo-600 disabled:opacity-30"
                                            disabled={
                                              testPciLoading ||
                                              (!loadedTaskId && !loadedAssessmentId)
                                            }
                                            onClick={() => {
                                              if (testPciSource === 'task') {
                                                const task = findTaskById(loadedTaskId || '')
                                                if (task) {
                                                  insightsProps.onDeployTask?.({
                                                    id: task.id,
                                                    title: task.title || 'Task',
                                                    content: task.description || '',
                                                    source: 'task',
                                                    dmiItems:
                                                      task.dmiItems?.map(item => ({
                                                        id: item.id,
                                                        questionNumber: item.questionNumber,
                                                        questionText: item.questionText,
                                                        // Marks shown to students; carry the input
                                                        // type + options so mcq/etc. render the right
                                                        // control. Answer key / rubric stay server-side.
                                                        marks: item.marks,
                                                        questionType: item.questionType,
                                                        options: item.options,
                                                        pairs: item.pairs,
                                                        hotspotImageUrl: item.hotspotImageUrl,
                                                        regions: item.regions,
                                                      })) || [],
                                                    deployedAt: Date.now(),
                                                    polls: [],
                                                    questions: [],
                                                    sourceDocument: task.sourceDocument
                                                      ? {
                                                          fileName: task.sourceDocument.fileName,
                                                          fileUrl: task.sourceDocument.fileUrl,
                                                          fileKey: task.sourceDocument.fileKey,
                                                          mimeType:
                                                            task.sourceDocument.mimeType ||
                                                            'application/pdf',
                                                        }
                                                      : undefined,
                                                  })
                                                  toast.success('Task DMI deployed to live session')
                                                }
                                              } else {
                                                handleDeployAssessmentDmi()
                                              }
                                            }}
                                            title="Deploy to Session"
                                          >
                                            <Play className="h-4 w-4" />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                    <div className="border-border/50 bg-muted/20 border-t px-1 py-1">
                                      <p className="text-muted-foreground text-[10px]">
                                        Tip: Start line with &quot;1.&quot;, &quot;-&quot;, or
                                        &quot;a.&quot; for auto-numbering. Use Tab/Shift+Tab to
                                        indent.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}
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
                      className="flex h-full w-full flex-shrink-0 flex-col overflow-hidden rounded-[20px] border border-blue-200 bg-[#FFFFFF] shadow-[0_18px_45px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]"
                    >
                      <div className="sticky top-0 z-10 flex h-9 shrink-0 items-center justify-center rounded-t-[20px] bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] px-4 text-sm font-semibold text-white">
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
                                  className="w-full truncate bg-transparent outline-none placeholder:text-gray-400 focus:border-b focus:border-blue-300"
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
                                className="relative flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-transparent py-2.5 text-sm font-medium text-[#667085] transition-all data-[state=active]:border-[#CFE0FF] data-[state=active]:bg-[#EEF4FF] data-[state=active]:font-semibold data-[state=active]:text-[#2B5FB8] data-[state=inactive]:hover:bg-slate-50"
                              >
                                <Wrench className="h-4 w-4 shrink-0" />
                                Task Builder
                              </TabsTrigger>
                              <TabsTrigger
                                value="assessment"
                                className="relative flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-transparent py-2.5 text-sm font-medium text-[#667085] transition-all data-[state=active]:border-[#E2D8FF] data-[state=active]:bg-[#F3EEFF] data-[state=active]:font-semibold data-[state=active]:text-[#6D59D8] data-[state=inactive]:hover:bg-slate-50"
                              >
                                <FileCheck2 className="h-4 w-4 shrink-0" />
                                Assessment Builder
                              </TabsTrigger>
                            </TabsList>

                            {/* Right: current assessment name */}
                            <div className="flex min-w-0 flex-1 items-center justify-end gap-2 px-3 text-sm font-semibold text-[#1F2933]">
                              {mainBuilderTab === 'assessment' && (
                                <input
                                  className="w-full truncate bg-transparent text-right outline-none placeholder:text-gray-400 focus:border-b focus:border-purple-300"
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
                          <div className="relative flex-1 rounded-none border-0 bg-transparent p-0 shadow-none">
                            {/* Task Builder Tab */}
                            <TabsContent
                              value="task"
                              className="flex h-full flex-col space-y-px overflow-hidden data-[state=inactive]:hidden"
                            >
                              <div className="flex flex-1 gap-px overflow-hidden">
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
                                      <div
                                        className="relative flex h-full min-h-0 flex-row overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm"
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={(e: any) => {
                                          if (!canEdit) return
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
                                        }}
                                      >
                                        {/* Centered Pill for Test button */}

                                        {/* Left Panel (Text) */}
                                        {taskTextVisible && (
                                          <div
                                            className={cn(
                                              'relative flex h-full flex-col bg-[#FBFCFD]',
                                              taskPdfVisible ? 'w-1/2 border-r' : 'w-full'
                                            )}
                                          >
                                            <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white px-2">
                                              <div className="flex w-full items-center justify-between gap-2">
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => {
                                                    if (!taskPdfVisible) setTaskPdfVisible(true)
                                                    setTaskTextVisible(false)
                                                  }}
                                                  className={cn(
                                                    'h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700',
                                                    taskPdfVisible && taskTextVisible
                                                      ? 'opacity-100'
                                                      : 'pointer-events-none opacity-0'
                                                  )}
                                                  title="Hide Text"
                                                >
                                                  <ChevronLeft className="h-5 w-5" />
                                                </Button>

                                                {!taskPdfVisible ? (
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setTaskPdfVisible(true)}
                                                    className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                                    title="Show Preview"
                                                  >
                                                    <ChevronRight className="h-5 w-5" />
                                                  </Button>
                                                ) : (
                                                  <div className="w-8" />
                                                )}
                                              </div>
                                            </div>
                                            <AutoTextarea
                                              placeholder={
                                                taskBuilder.activeExtensionId
                                                  ? 'Extension content...'
                                                  : 'Enter task content or drop files here...'
                                              }
                                              className="h-full min-h-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent p-4 text-[#1F2933] focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                              style={{ fontSize: `${extractedTextFontSize}px` }}
                                              disableAutoResize
                                              readOnly={!canEdit}
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
                                                        const combined =
                                                          prev.taskContent +
                                                          (prev.taskContent ? '\n\n' : '') +
                                                          text
                                                        return {
                                                          ...prev,
                                                          taskContent: combined,
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
                                                      e => e.id === taskBuilder.activeExtensionId
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
                                              className="absolute bottom-6 right-6 z-20 flex items-center gap-1 rounded-md px-2 py-1 text-white"
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
                                            {!taskTextVisible && (
                                              <div className="absolute left-2 top-2 z-10 flex gap-2">
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() => setTaskTextVisible(true)}
                                                  className="h-8 w-8 bg-white/90 p-0 shadow-sm backdrop-blur-sm hover:bg-white"
                                                  title="Show Text"
                                                >
                                                  <ChevronRight className="h-5 w-5 text-slate-600" />
                                                </Button>
                                              </div>
                                            )}

                                            <div className="relative min-h-0 flex-1 overflow-hidden">
                                              {currentTaskDocument?.mimeType ===
                                              'application/pdf' ? (
                                                <PDFViewer
                                                  key={currentTaskDocument.fileUrl}
                                                  fileUrl={currentTaskDocument.fileUrl}
                                                  className="absolute inset-0 h-full w-full"
                                                  defaultScale={0.75}
                                                  hidePageNavigation
                                                  onHidePreview={() => {
                                                    if (!taskTextVisible) setTaskTextVisible(true)
                                                    setTaskPdfVisible(false)
                                                  }}
                                                />
                                              ) : currentTaskDocument &&
                                                currentTaskDocument.mimeType !==
                                                  'application/pdf' &&
                                                currentTaskDocument.mimeType.startsWith(
                                                  'image/'
                                                ) ? (
                                                <div className="absolute inset-0 flex items-center justify-center bg-white p-4">
                                                  <div className="absolute left-0 top-0 flex h-11 w-full shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white p-1">
                                                    <div />
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => {
                                                        if (!taskTextVisible)
                                                          setTaskTextVisible(true)
                                                        setTaskPdfVisible(false)
                                                      }}
                                                      className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                                      title="Hide Preview"
                                                    >
                                                      <ChevronRight className="h-5 w-5" />
                                                    </Button>
                                                  </div>
                                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                                  <img
                                                    src={currentTaskDocument.fileUrl}
                                                    alt={currentTaskDocument.fileName}
                                                    className="max-h-full max-w-full object-contain"
                                                  />
                                                </div>
                                              ) : currentTaskDocument &&
                                                currentTaskDocument.mimeType !==
                                                  'application/pdf' &&
                                                !currentTaskDocument.mimeType.startsWith(
                                                  'image/'
                                                ) ? (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white p-6">
                                                  <div className="absolute left-0 top-0 flex h-11 w-full shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white p-1">
                                                    <div />
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => {
                                                        if (!taskTextVisible)
                                                          setTaskTextVisible(true)
                                                        setTaskPdfVisible(false)
                                                      }}
                                                      className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                                      title="Hide Preview"
                                                    >
                                                      <ChevronRight className="h-5 w-5" />
                                                    </Button>
                                                  </div>
                                                  <FileText className="mb-4 h-16 w-16 text-blue-500" />
                                                  <a
                                                    href={currentTaskDocument.fileUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-center text-sm font-medium text-blue-600 hover:underline"
                                                  >
                                                    Open {currentTaskDocument.fileName} in new tab
                                                  </a>
                                                </div>
                                              ) : (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                                                  <div className="absolute left-0 top-0 flex h-11 w-full shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white p-1">
                                                    <div />
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => {
                                                        if (!taskTextVisible)
                                                          setTaskTextVisible(true)
                                                        setTaskPdfVisible(false)
                                                      }}
                                                      className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                                      title="Hide Preview"
                                                    >
                                                      <ChevronRight className="h-5 w-5" />
                                                    </Button>
                                                  </div>
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
                                      {/* Uploaded Files List - only show for task (not extensions) */}
                                      {/* Upload button - only for task (not extensions) */}
                                      {/* Assets Folder added to Slide Tab removed from here */}
                                    </TabsContent>
                                    <TabsContent
                                      value="pci"
                                      className="mt-0.5 flex h-full min-h-0 flex-1 flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                    >
                                      <div className="flex h-full min-h-0 flex-col rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
                                        <div className="flex-1 space-y-4 overflow-y-auto p-1">
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
                                                Finalized rubric ready to apply to the PCI field.
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
                                          <div className="mt-2 w-full rounded-2xl border border-blue-300 bg-white/90 backdrop-blur-md transition-all duration-300">
                                            <div className="relative flex w-full flex-col p-px">
                                              <div className="flex w-full flex-col">
                                                <MentionTextarea
                                                  mentionItems={mentionItems}
                                                  placeholder="Ask the PCI assistant..."
                                                  className="min-h-[100px] w-full flex-1 border-0 bg-transparent px-4 py-4 text-sm shadow-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                                  value={activeTaskPciInput}
                                                  readOnly={!canEdit}
                                                  onChange={(e: any) => {
                                                    const value = e.target.value
                                                    if (taskBuilder.activeExtensionId) {
                                                      setTaskExtensionPciInputs(prev => ({
                                                        ...prev,
                                                        [taskBuilder.activeExtensionId as string]:
                                                          value,
                                                      }))
                                                    } else {
                                                      setTaskPciInputMap(prev => ({
                                                        ...prev,
                                                        [loadedTaskId || '']: value,
                                                      }))
                                                    }
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
                              <div className="flex flex-1 gap-px overflow-hidden">
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
                                        className="w-full rounded-xl border border-[#E5E7EB] text-sm font-medium text-[#667085] transition-all data-[state=active]:border-[#E2D8FF] data-[state=active]:bg-[#F3EEFF] data-[state=inactive]:bg-white data-[state=active]:font-medium data-[state=active]:text-[#6D59D8] data-[state=inactive]:hover:bg-slate-50"
                                      >
                                        <LayoutPanelTop className="mr-2 h-4 w-4 shrink-0" />
                                        Assessment
                                      </TabsTrigger>
                                      <TabsTrigger
                                        value="pci"
                                        className="w-full rounded-xl border border-[#E5E7EB] text-sm font-medium text-[#667085] transition-all data-[state=active]:border-[#E2D8FF] data-[state=active]:bg-[#F3EEFF] data-[state=inactive]:bg-white data-[state=active]:font-medium data-[state=active]:text-[#6D59D8] data-[state=inactive]:hover:bg-slate-50"
                                      >
                                        <Brain className="mr-2 h-4 w-4 shrink-0" />
                                        PCI
                                      </TabsTrigger>
                                    </TabsList>
                                    <TabsContent
                                      value="content"
                                      className="mt-3 flex h-full min-h-0 flex-1 flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                                    >
                                      <div
                                        className="relative flex h-full min-h-0 flex-row overflow-hidden rounded-2xl border border-purple-200 bg-white shadow-sm"
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
                                              assessmentPdfVisible ? 'w-1/2 border-r' : 'w-full'
                                            )}
                                          >
                                            <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white px-2">
                                              <div className="flex w-full items-center justify-between gap-2">
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => {
                                                    if (!assessmentPdfVisible)
                                                      setAssessmentPdfVisible(true)
                                                    setAssessmentTextVisible(false)
                                                  }}
                                                  className={cn(
                                                    'h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700',
                                                    assessmentPdfVisible && assessmentTextVisible
                                                      ? 'opacity-100'
                                                      : 'pointer-events-none opacity-0'
                                                  )}
                                                  title="Hide Text"
                                                >
                                                  <ChevronLeft className="h-5 w-5" />
                                                </Button>

                                                {!assessmentPdfVisible ? (
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setAssessmentPdfVisible(true)}
                                                    className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                                    title="Show Preview"
                                                  >
                                                    <ChevronRight className="h-5 w-5" />
                                                  </Button>
                                                ) : (
                                                  <div className="w-8" />
                                                )}
                                              </div>
                                            </div>
                                            <AutoTextarea
                                              placeholder="Enter assessment content or drop files here..."
                                              className="h-full min-h-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent p-4 text-[#1F2933] focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                              style={{ fontSize: `${extractedTextFontSize}px` }}
                                              disableAutoResize
                                              readOnly={!canEdit}
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
                                              className="absolute bottom-6 right-6 z-20 flex items-center gap-1 rounded-md px-2 py-1 text-white"
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
                                            {!assessmentTextVisible && (
                                              <div className="absolute left-2 top-2 z-10 flex gap-2">
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() => setAssessmentTextVisible(true)}
                                                  className="h-8 w-8 bg-white/90 p-0 shadow-sm backdrop-blur-sm hover:bg-white"
                                                  title="Show Text"
                                                >
                                                  <ChevronRight className="h-5 w-5 text-slate-600" />
                                                </Button>
                                              </div>
                                            )}

                                            <div className="relative min-h-0 flex-1 overflow-hidden">
                                              {currentAssessmentDocument?.mimeType ===
                                              'application/pdf' ? (
                                                <PDFViewer
                                                  key={currentAssessmentDocument.fileUrl}
                                                  fileUrl={currentAssessmentDocument.fileUrl}
                                                  className="absolute inset-0 h-full w-full"
                                                  defaultScale={0.75}
                                                  hidePageNavigation
                                                  onHidePreview={() => {
                                                    if (!assessmentTextVisible)
                                                      setAssessmentTextVisible(true)
                                                    setAssessmentPdfVisible(false)
                                                  }}
                                                />
                                              ) : currentAssessmentDocument &&
                                                currentAssessmentDocument.mimeType !==
                                                  'application/pdf' &&
                                                currentAssessmentDocument.mimeType.startsWith(
                                                  'image/'
                                                ) ? (
                                                <div className="absolute inset-0 flex items-center justify-center bg-white p-4">
                                                  <div className="absolute left-0 top-0 flex h-11 w-full shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white p-1">
                                                    <div />
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => {
                                                        if (!assessmentTextVisible)
                                                          setAssessmentTextVisible(true)
                                                        setAssessmentPdfVisible(false)
                                                      }}
                                                      className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                                      title="Hide Preview"
                                                    >
                                                      <ChevronRight className="h-5 w-5" />
                                                    </Button>
                                                  </div>
                                                  <div className="relative h-full w-full pt-11">
                                                    <NextImage
                                                      src={currentAssessmentDocument.fileUrl}
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
                                                  <div className="absolute left-0 top-0 flex h-11 w-full shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white p-1">
                                                    <div />
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => {
                                                        if (!assessmentTextVisible)
                                                          setAssessmentTextVisible(true)
                                                        setAssessmentPdfVisible(false)
                                                      }}
                                                      className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                                      title="Hide Preview"
                                                    >
                                                      <ChevronRight className="h-5 w-5" />
                                                    </Button>
                                                  </div>
                                                  <FileText className="mb-4 h-16 w-16 text-blue-500" />
                                                  <a
                                                    href={currentAssessmentDocument.fileUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-center text-sm font-medium text-blue-600 hover:underline"
                                                  >
                                                    Open {currentAssessmentDocument.fileName} in new
                                                    tab
                                                  </a>
                                                </div>
                                              ) : (
                                                <div className="flex h-full flex-col items-center justify-center text-gray-400">
                                                  <div className="absolute left-0 top-0 flex h-11 w-full shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white p-1">
                                                    <div />
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => {
                                                        if (!assessmentTextVisible)
                                                          setAssessmentTextVisible(true)
                                                        setAssessmentPdfVisible(false)
                                                      }}
                                                      className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                                      title="Hide Preview"
                                                    >
                                                      <ChevronRight className="h-5 w-5" />
                                                    </Button>
                                                  </div>
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
                                      <div className="relative flex h-full min-h-0 flex-col rounded-2xl border border-purple-200 bg-white p-4 shadow-sm">
                                        {/* Centered Pill for Test, Generate DMI, and Version History */}
                                        <div className="pointer-events-none absolute left-1/2 top-0 z-20 flex -translate-x-1/2 items-center justify-center">
                                          <div className="pointer-events-auto flex h-11 items-center gap-1 rounded-b-xl border-x border-b border-[#E5E7EB] bg-white/90 px-2 shadow-sm backdrop-blur-sm">
                                            <span className="text-xs font-light text-gray-400">
                                              (
                                            </span>

                                            <Button
                                              variant="ghost"
                                              size="sm"
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
                                              Generate DMI
                                            </Button>

                                            <div className="h-3 w-px bg-gray-300" />

                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 px-2 text-xs font-medium text-gray-600 hover:text-gray-900"
                                              disabled={dmiGenerating || !canEdit}
                                              title="Document is study material (notes/book): pick question types & counts to generate questions + DMI"
                                              onClick={() => {
                                                if (!canEdit) return
                                                const content = assessmentBuilder.taskContent
                                                const hasPdf =
                                                  currentAssessmentDocument?.mimeType ===
                                                  'application/pdf'
                                                if (!content.trim() && !hasPdf) {
                                                  toast.error(
                                                    'Please add content to the Assessment tab or load a document first'
                                                  )
                                                  return
                                                }
                                                setDmiSpecRows([{ type: 'short', count: 3 }])
                                                setDmiSpecDialog({ type: 'assessment' })
                                              }}
                                            >
                                              From study material
                                            </Button>

                                            {assessmentDmiItems.length > 0 && (
                                              <>
                                                <div className="h-3 w-px bg-gray-300" />
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
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

                                            <span className="text-xs font-light text-gray-400">
                                              )
                                            </span>
                                          </div>
                                        </div>

                                        <div className="mt-6 flex-1 space-y-4 overflow-y-auto p-1">
                                          {(
                                            assessmentPciMessagesMap[loadedAssessmentId || ''] || []
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
                                                Finalized rubric ready to apply to the PCI field.
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
                                          <div className="mt-2 w-full rounded-2xl border border-purple-300 bg-white/90 backdrop-blur-md transition-all duration-300">
                                            <div className="relative flex w-full flex-col p-px">
                                              <div className="flex w-full flex-col">
                                                <MentionTextarea
                                                  mentionItems={mentionItems}
                                                  placeholder="Ask the PCI assistant..."
                                                  className="min-h-[100px] w-full flex-1 border-0 bg-transparent px-4 py-4 text-sm shadow-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                                  value={
                                                    assessmentPciInputMap[
                                                      loadedAssessmentId || ''
                                                    ] || ''
                                                  }
                                                  readOnly={!canEdit}
                                                  onChange={(e: any) =>
                                                    setAssessmentPciInputMap(prev => ({
                                                      ...prev,
                                                      [loadedAssessmentId || '']: e.target.value,
                                                    }))
                                                  }
                                                  onKeyDown={(e: any) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
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
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle>Edit marks &amp; answers</DialogTitle>
                      <DialogDescription>
                        Set the marks for each question and review the AI-suggested answers. Total:{' '}
                        {totalMarks} mark{totalMarks === 1 ? '' : 's'}.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                      {editItems.map(item => {
                        const marksVal =
                          typeof item.marks === 'number' && item.marks > 0 ? item.marks : 1
                        const isOpenEnded =
                          !item.questionType ||
                          item.questionType === 'short' ||
                          item.questionType === 'long' ||
                          item.questionType === 'fill_blank'
                        return (
                          <div
                            key={item.id}
                            className="rounded-lg border border-gray-200 bg-white p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-medium text-gray-900">
                                <span className="mr-1 text-indigo-600">
                                  Q{item.questionNumber}.
                                </span>
                                {item.questionText}
                              </p>
                              <label className="flex shrink-0 items-center gap-1 text-xs text-gray-600">
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
                                  className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm"
                                />
                              </label>
                            </div>
                            {Array.isArray(item.options) && item.options.length > 0 && (
                              <ul className="mt-1.5 space-y-0.5 pl-1 text-xs text-gray-500">
                                {item.options.map((o, i) => (
                                  <li key={i}>
                                    <span className="mr-1 font-semibold text-gray-400">
                                      {String.fromCharCode(97 + i)})
                                    </span>
                                    {o}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="mt-2">
                              <label className="mb-1 block text-xs font-medium text-gray-600">
                                Answer key
                                {Array.isArray(item.options) && item.options.length > 0
                                  ? ' (letter, e.g. A)'
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
                                className="min-h-[44px] w-full resize-y rounded-md border border-gray-300 p-2 text-sm"
                              />
                            </div>
                            {isOpenEnded && (
                              <div className="mt-2">
                                <label className="mb-1 block text-xs font-medium text-gray-600">
                                  Marking guidance (optional)
                                </label>
                                <textarea
                                  value={item.rubric || ''}
                                  disabled={!canEdit}
                                  placeholder="How to award the marks…"
                                  onChange={e =>
                                    applyDmiEdit(dmiEditor.source, item.id, {
                                      rubric: e.target.value,
                                    })
                                  }
                                  className="min-h-[36px] w-full resize-y rounded-md border border-gray-300 p-2 text-sm"
                                />
                              </div>
                            )}
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

        {/* Study-material question spec dialog — shown when generate-dmi detects
            the source has no explicit questions. The tutor chooses which question
            types and how many of each to generate. */}
        <Dialog
          open={!!dmiSpecDialog}
          onOpenChange={open => {
            if (!open) setDmiSpecDialog(null)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Choose questions to generate</DialogTitle>
              <DialogDescription>
                This document looks like study material rather than a question paper. Pick the
                question types and how many of each to generate.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
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
                    <SelectTrigger className="h-9 flex-1">
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
                    className="h-9 w-20"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-slate-400 hover:text-red-500"
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
                onClick={() => setDmiSpecRows(prev => [...prev, { type: 'short', count: 3 }])}
              >
                <Plus className="mr-1 h-4 w-4" /> Add type
              </Button>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDmiSpecDialog(null)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmDmiSpec} disabled={dmiGenerating}>
                Generate
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
                          Question {item.questionNumber}
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

        {/* Floating "View DMI" button — lets the tutor open the loaded DMI as a
            modal anytime from the Classroom (live) view while showing an assessment. */}
        {mainTab === 'live' &&
          (() => {
            // Prefer the DMI loaded into the builder; otherwise fall back to the
            // DMI carried by whatever task/assessment is currently loaded in the
            // live Classroom (a real live session may set loadedTaskId/
            // loadedAssessmentId without populating the builder DMI state).
            const loadedDmi =
              testPciSource === 'assessment'
                ? findAssessmentById(loadedAssessmentId || '')?.dmiItems
                : findTaskById(loadedTaskId || '')?.dmiItems
            const liveDmiItems =
              assessmentDmiItems.length > 0
                ? assessmentDmiItems
                : taskDmiItems.length > 0
                  ? taskDmiItems
                  : loadedDmi || []
            if (liveDmiItems.length === 0) return null
            const totalMarks = liveDmiItems.reduce(
              (sum, it) => sum + (typeof it.marks === 'number' && it.marks > 0 ? it.marks : 1),
              0
            )
            // Only offer the reveal toggle when there is actually a key to hide.
            const hasAnswerKey = liveDmiItems.some(it => it.answer || it.rubric)
            return (
              <>
                <button
                  type="button"
                  onClick={() => setShowLiveDmiModal(true)}
                  className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full bg-[#F17623] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-[#d9651a]"
                  title="View the loaded DMI"
                >
                  <FileText className="h-4 w-4" />
                  View DMI ({liveDmiItems.length})
                </button>
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
                                {item.questionNumber ? `${item.questionNumber}. ` : ''}
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
