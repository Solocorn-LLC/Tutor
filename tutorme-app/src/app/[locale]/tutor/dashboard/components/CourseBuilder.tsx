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
import NextImage from 'next/image'
import { createPortal } from 'react-dom'
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
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { PDFViewer } from '@/components/pdf/PDFViewer'
import { PDFDocument } from 'pdf-lib'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { extractTextFromFile } from '@/lib/extract-file-text'
import { toast } from 'sonner'
import { useVideoOverlayStore } from '@/stores/video-overlay-store'
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

import { AnalyticsPanel } from './AnalyticsPanel'
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
  Circle,
  Square,
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

// ============================================
// BUILDER MODAL COMPONENTS
// ============================================

// ============================================
// MAIN COURSE BUILDER COMPONENT
// ============================================

function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase()
  return '#' + '00000'.substring(0, 6 - c.length) + c
}

function InsightsReportView({
  type,
  onMentionStudent,
}: {
  type: 'poll' | 'question'
  onMentionStudent: (studentName: string) => void
}) {
  const [reportType, setReportType] = useState<'simple' | 'detailed'>('simple')
  const [selectedGroup, setSelectedGroup] = useState<{ label: string; students: string[] } | null>(
    null
  )

  const simpleData = [
    {
      label: 'Option A',
      count: 12,
      percent: 40,
      students: ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve'],
    },
    { label: 'Option B', count: 9, percent: 30, students: ['Frank', 'Grace', 'Heidi'] },
    { label: 'Option C', count: 6, percent: 20, students: ['Ivan', 'Judy'] },
    { label: 'Option D', count: 3, percent: 10, students: ['Mallory'] },
  ]

  const detailedData = [
    {
      group: 'Male',
      data: [
        { label: 'Option A', count: 5, students: ['Alice', 'Bob'] },
        { label: 'Option B', count: 4, students: ['Charlie'] },
      ],
    },
    {
      group: 'Female',
      data: [
        { label: 'Option A', count: 7, students: ['Dave', 'Eve'] },
        { label: 'Option B', count: 5, students: ['Frank'] },
      ],
    },
    {
      group: 'US',
      data: [
        { label: 'Option A', count: 8, students: ['Grace', 'Heidi'] },
        { label: 'Option B', count: 3, students: ['Ivan'] },
      ],
    },
    {
      group: 'UK',
      data: [
        { label: 'Option A', count: 4, students: ['Judy'] },
        { label: 'Option B', count: 6, students: ['Mallory'] },
      ],
    },
  ]

  return (
    <div className="mb-2 flex flex-1 flex-col overflow-hidden rounded-2xl border border-cyan-100 bg-white/60 p-3 shadow-sm backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between border-b border-cyan-100 pb-2">
        <span className="text-sm font-semibold uppercase tracking-wider text-cyan-800">
          {type === 'poll' ? 'Poll Results' : 'Question Results'}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 bg-white text-xs text-cyan-700 hover:bg-cyan-50"
          onClick={() => setReportType(r => (r === 'simple' ? 'detailed' : 'simple'))}
        >
          {reportType === 'simple' ? 'Detailed Report' : 'Simple Report'}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto pr-2">
        {reportType === 'simple' ? (
          <div className="space-y-4">
            {simpleData.map(item => (
              <div
                key={item.label}
                className="cursor-pointer rounded-xl border border-transparent p-2 shadow-sm transition-colors hover:border-cyan-100 hover:bg-white"
                onClick={() => setSelectedGroup({ label: item.label, students: item.students })}
              >
                <div className="mb-1.5 flex justify-between text-xs font-medium text-slate-700">
                  <span>{item.label}</span>
                  <span className="text-cyan-600">
                    {item.count} ({item.percent}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-cyan-500"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {detailedData.map(group => (
              <div key={group.group} className="rounded-xl border border-slate-100 bg-white/50 p-2">
                <h4 className="mb-2 text-xs font-semibold text-slate-700">{group.group}</h4>
                <div className="space-y-2">
                  {group.data.map(item => (
                    <div
                      key={item.label}
                      className="group/item flex cursor-pointer items-center justify-between rounded-lg p-1.5 transition-colors hover:bg-white"
                      onClick={() =>
                        setSelectedGroup({
                          label: `${group.group} - ${item.label}`,
                          students: item.students,
                        })
                      }
                    >
                      <span className="text-xs text-slate-600 group-hover/item:text-cyan-700">
                        {item.label}
                      </span>
                      <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-600">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedGroup} onOpenChange={o => !o && setSelectedGroup(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-lg">Students in {selectedGroup?.label}</DialogTitle>
          </DialogHeader>
          <div className="mt-2 max-h-[300px] overflow-y-auto">
            <div className="space-y-2 pr-4">
              {selectedGroup?.students.map(s => (
                <div
                  key={s}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 transition-colors hover:bg-slate-50"
                  onClick={() => {
                    onMentionStudent(s)
                    setSelectedGroup(null)
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-100 text-xs font-medium text-cyan-700">
                      {s.charAt(0)}
                    </div>
                    <span className="text-sm font-medium text-slate-700">{s}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-cyan-600 hover:bg-cyan-50 hover:text-cyan-700"
                  >
                    @ Mention
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Main Course Builder

// LessonSelectorDialog Removed

// Extended props for modals with lesson selector
// BuilderModalWithCourseBuilderNodesProps Removed

// Types and payload definitions
type PreviewUpdatePayload = Partial<Task> | Partial<Assessment>

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
import { LiveSessionSubmissionsPanel } from './LiveSessionSubmissionsPanel'

export const CourseBuilder = forwardRef<CourseBuilderRef, CourseBuilderProps>(
  function CourseBuilder(
    {
      courseId,
      courseName,
      panelMode = 'default',
      initialLessons,
      hideCourseNameInTabs = false,
      onSave,
      onMakeVisibleToStudents,
      insightsProps,
      isCollapsed = false,
      onMainTabChange,
      initialMainTab,
      leftPanelHidden: leftPanelHiddenProp,
      onLeftPanelHiddenChange,
      hideDirectorySearch = false,
      directoryMenusAlwaysVisible = false,
      saveMode,
      onSaveModeChange,
      isStudentView = false,
      onSyncToLiveSession,
    },
    ref
  ) {
    // Main section tabs (Live, Test PCI vs Builder)
    const [mainTab, setMainTab] = useState<'live' | 'builder' | 'test-pci'>(
      initialMainTab ?? 'builder'
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
      return (initialLessons || []).map((lesson, idx) => ({
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
        mimeType?: string
        folder?: string
      }[]
    >([])
    const assetsLoadedRef = useRef(false)
    const skipNextAssetsSaveRef = useRef(false)
    const [loadAsModalOpen, setLoadAsModalOpen] = useState(false)
    const [isSplitting, setIsSplitting] = useState(false)
    const [assetToLoad, setAssetToLoad] = useState<{
      name: string
      content?: string
      url?: string
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

    // Sync tutor board state to students via full-state snapshot
    useEffect(() => {
      if (!insightsProps?.socket || !insightsProps?.sessionId) return
      const timeout = setTimeout(() => {
        insightsProps.socket!.emit('tutor:whiteboard:update', {
          roomId: insightsProps.sessionId,
          board: {
            pages: tutorBoardPages,
            pageIndex: tutorBoardPageIndex,
            updatedAt: Date.now(),
          },
        })
      }, 300)
      return () => clearTimeout(timeout)
    }, [tutorBoardPages, tutorBoardPageIndex, insightsProps?.socket, insightsProps?.sessionId])
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

    const [assessmentBuilder, setAssessmentBuilder] = useState({
      title: '',
      taskContent: '',
      taskPci: '',
      details: '',
      extensions: [] as {
        id: string
        name: string
        description?: string
        content: string
        pci: string
        sourceDocument?: any
      }[],
      activeExtensionId: null as string | null,
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
    const openVideoOverlay = useVideoOverlayStore(s => s.openOverlay)
    const [monitorSelectedStudent, setMonitorSelectedStudent] = useState<{
      id: string
      name: string
    } | null>(null)
    const [liveSubmissionsPanelHidden, setLiveSubmissionsPanelHidden] = useState(false)
    const [liveSubmissionsPanelWidth] = useState(320)

    const [testPciSource, setTestPciSource] = useState<'task' | 'assessment'>('task')
    const [comingSoonDialog, setComingSoonDialog] = useState(false)
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
    const [dmiGenerating, setDmiGenerating] = useState(false)

    // Active tab tracking for Enter button
    const [taskBuilderActiveTab, setTaskBuilderActiveTab] = useState<'content' | 'pci'>('content')
    const [assessmentBuilderActiveTab, setAssessmentBuilderActiveTab] = useState<'content' | 'pci'>(
      'content'
    )

    // Main builder tab (task vs assessment)
    const [mainBuilderTab, setMainBuilderTab] = useState<'task' | 'assessment'>('task')

    useEffect(() => {
      onMainTabChange?.(mainTab)
    }, [mainTab, onMainTabChange])

    // Reset builder to blank slate whenever the builder tab is clicked
    useEffect(() => {
      if (mainTab !== 'builder') return
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
      setAiAssistOpen(false)
      setTaskAiMessages([])
      setAssessmentAiMessages([])
      setTaskUploadedFiles([])
      setAssessmentUploadedFiles([])
    }, [mainTab])

    useEffect(() => {
      if (!insightsProps) return
      if (mainTab === 'test-pci') {
        setTestPciTabs([
          { id: 'classroom', label: 'Classroom' },
          { id: 'student1', label: 'Test Student 1' },
          { id: 'student2', label: 'Test Student 2' },
        ])
      } else if (mainTab === 'live') {
        setTestPciTabs([
          { id: 'classroom', label: 'Classroom' },
          { id: 'student1', label: 'Whiteboards' },
          { id: 'student-monitor', label: 'Monitor' },
          { id: 'insights', label: 'Insights' },
        ])
      }
    }, [insightsProps, mainTab])

    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

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
    const [sessionStudents, setSessionStudents] = useState<any[]>([])
    const activeSession = insightsProps?.sessionId
      ? insightsProps.sessions?.find(s => s.id === insightsProps.sessionId)
      : null
    const isSessionActive = activeSession?.status === 'active'

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
          extensions: (task.extensions || []).map(ext => ({
            ...ext,
            description: ext.description || '',
          })),
          activeExtensionId,
        })
        setTaskDmiItems(task.dmiItems || [])
        setTaskDmiVersions(task.dmiVersions || [])
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
        extensions: [],
        activeExtensionId: null,
      })
      setAssessmentDmiItems(assessment.dmiItems || [])
      setAssessmentDmiVersions(assessment.dmiVersions || [])
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
          setSessionStudents(Array.isArray(data?.students) ? data.students : [])
        } catch {
          // ignore
        }
      }
      loadSession()
      return () => {
        cancelled = true
      }
    }, [insightsProps?.sessionId])

    useEffect(() => {
      if (mainTab !== 'live') return
      if (!insightsProps?.socket || !insightsProps?.sessionId) return
      const socket = insightsProps.socket

      const handleRoomState = (state: any) => {
        const liveStudents = Array.isArray(state?.students) ? state.students : []
        if (liveStudents.length === 0) return
        setSessionStudents(prev => {
          const map = new Map<string, any>()
          prev.forEach(s => {
            const id = s?.id ?? s?.userId
            if (id) map.set(id, s)
          })
          liveStudents.forEach((s: any) => {
            const id = s?.userId ?? s?.id
            if (!id) return
            const existing = map.get(id) || {}
            map.set(id, {
              ...existing,
              id,
              name: existing?.name ?? s?.name ?? 'Student',
              status: 'online',
            })
          })
          return Array.from(map.values())
        })
      }

      const handleStudentJoined = (payload: any) => {
        const id = payload?.userId
        if (!id) return
        setSessionStudents(prev => {
          const exists = prev.some(s => (s?.id ?? s?.userId) === id)
          if (exists) {
            return prev.map(s => ((s?.id ?? s?.userId) === id ? { ...s, status: 'online' } : s))
          }
          return [
            ...prev,
            {
              id,
              name: payload?.name ?? 'Student',
              status: 'online',
            },
          ]
        })
      }

      const handleStudentLeft = (payload: any) => {
        const id = payload?.userId
        if (!id) return
        setSessionStudents(prev =>
          prev.map(s => ((s?.id ?? s?.userId) === id ? { ...s, status: 'offline' } : s))
        )
      }

      socket.on('room_state', handleRoomState)
      socket.on('student_joined', handleStudentJoined)
      socket.on('student_left', handleStudentLeft)
      return () => {
        socket.off('room_state', handleRoomState)
        socket.off('student_joined', handleStudentJoined)
        socket.off('student_left', handleStudentLeft)
      }
    }, [insightsProps?.sessionId, insightsProps?.socket, mainTab])

    // Countdown timer removed — kept in CourseBuilderInsightsRoute header instead

    // Save tutor assets to API when they change (debounced)
    const saveAssetsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const saveAssetsToApi = useCallback(
      async (assets: typeof courseAssets) => {
        try {
          const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
          const csrfData = await csrfRes.json().catch(() => ({}))
          const csrfToken = csrfData?.token ?? null

          const payloadAssets = assets.map(a => ({
            ...a,
            metadata: a.folder ? { folder: a.folder } : undefined,
          }))

          const res = await fetch('/api/tutor/assets', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
            },
            credentials: 'include',
            body: JSON.stringify({ assets: payloadAssets }),
          })

          if (!res.ok) {
            console.error('Failed to save tutor assets')
          }
        } catch (error) {
          console.error('Error saving tutor assets:', error)
        }
      },
      [insightsProps]
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
      if (!loadedTaskId) return

      const timeoutId = setTimeout(() => {
        setCourseBuilderNodes(prev =>
          prev.map(mod => ({
            ...mod,
            lessons: mod.lessons.map(lesson => ({
              ...lesson,
              tasks: lesson.tasks.map(task =>
                task.id === loadedTaskId
                  ? {
                      ...task,
                      title: taskBuilder.title,
                      shortDescription: taskBuilder.details,
                      description: taskBuilder.taskContent,
                      instructions: taskBuilder.taskPci,
                      extensions: taskBuilder.extensions,
                      dmiItems: taskDmiItems,
                      dmiVersions: taskDmiVersions,
                      activeDmiVersionId:
                        testPciSource === 'task' && testPciViewMode.startsWith('dmi_')
                          ? testPciViewMode.replace('dmi_', '')
                          : task.activeDmiVersionId,
                      sourceDocument: task.sourceDocument,
                    }
                  : task
              ),
            })),
          }))
        )
      }, 1000) // Auto-save after 1 second of inactivity

      return () => clearTimeout(timeoutId)
    }, [
      taskBuilder.title,
      taskBuilder.details,
      taskBuilder.taskContent,
      taskBuilder.taskPci,
      taskBuilder.extensions,
      taskDmiItems,
      taskDmiVersions,
      testPciSource,
      testPciViewMode,
      loadedTaskId,
    ])

    // Auto-save assessment on the fly (debounced)
    useEffect(() => {
      if (!loadedAssessmentId) return

      const timeoutId = setTimeout(() => {
        setCourseBuilderNodes(prev =>
          prev.map(mod => ({
            ...mod,
            lessons: mod.lessons.map(lesson => ({
              ...lesson,
              homework: lesson.homework.map(hw =>
                hw.id === loadedAssessmentId
                  ? {
                      ...hw,
                      title: assessmentBuilder.title,
                      description: assessmentBuilder.taskContent,
                      instructions: assessmentBuilder.taskPci,
                      dmiItems: assessmentDmiItems,
                      dmiVersions: assessmentDmiVersions,
                      activeDmiVersionId:
                        testPciSource === 'assessment' && testPciViewMode.startsWith('dmi_')
                          ? testPciViewMode.replace('dmi_', '')
                          : hw.activeDmiVersionId,
                      sourceDocument: hw.sourceDocument,
                    }
                  : hw
              ),
            })),
          }))
        )
      }, 1000) // Auto-save after 1 second of inactivity

      return () => clearTimeout(timeoutId)
    }, [
      assessmentBuilder.title,
      assessmentBuilder.taskContent,
      assessmentBuilder.taskPci,
      assessmentDmiItems,
      assessmentDmiVersions,
      testPciSource,
      testPciViewMode,
      loadedAssessmentId,
    ])

    // Sync active builder content to classroom tab when in insights mode
    useEffect(() => {
      if (!insightsProps) return
      if (mainTab !== 'test-pci') return

      if (mainBuilderTab === 'task' && loadedTaskId) {
        const activeTaskExtension = taskBuilder.activeExtensionId
          ? taskBuilder.extensions.find(ext => ext.id === taskBuilder.activeExtensionId)
          : null
        const contentToDisplay = activeTaskExtension
          ? activeTaskExtension.content
          : taskBuilder.taskContent
        setTestPciContent(prev => ({ ...prev, classroom: contentToDisplay || '' }))
      } else if (mainBuilderTab === 'assessment' && loadedAssessmentId) {
        setTestPciContent(prev => ({ ...prev, classroom: assessmentBuilder.taskContent || '' }))
      }
    }, [
      mainBuilderTab,
      loadedTaskId,
      taskBuilder.activeExtensionId,
      taskBuilder.taskContent,
      taskBuilder.extensions,
      loadedAssessmentId,
      assessmentBuilder.taskContent,
      insightsProps,
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
      description: '',
      isLive: false,
    })

    const doSave = useCallback(() => {
      // If courseName is missing (e.g. builder-draft), prompt for properties
      if (!courseName && !coursePropsModal.name) {
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
          }
        )
      }
    }, [
      nodes,
      courseName,
      coursePropsModal.name,
      coursePropsModal.description,
      devMode,
      previewDifficulty,
      onSave,
    ])

    const handleSyncToLive = useCallback(() => {
      setLiveNodes(cloneNodes(builderNodes))
    }, [builderNodes, cloneNodes, setLiveNodes])

    // Expose save method via ref
    useImperativeHandle(
      ref,
      () => ({
        save: doSave,
        saveAll: doSave,
        syncToLive: handleSyncToLive,
        getLessons: () => nodes.map(n => n.lessons[0]),
      }),
      [doSave, handleSyncToLive, nodes]
    )

    const trackObjectUrl = useCallback((url: string) => {
      if (url.startsWith('blob:')) {
        objectUrlsRef.current.push(url)
      }
      return url
    }, [])

    const formatPciTranscript = (messages: { role: 'user' | 'assistant'; content: string }[]) =>
      messages
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n')

    const cloneTask = (task: Task): Task => ({
      ...task,
      id: `task-${generateId()}`,
      extensions: (task.extensions || []).map(ext => ({
        ...ext,
        id: `ext-${generateId()}`,
      })),
    })

    const cloneAssessment = (assessment: Assessment): Assessment => ({
      ...assessment,
      id: `homework-${generateId()}`,
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
          insightsProps.onDeployTask({
            id: homeworkItem.id,
            title: homeworkItem.title || 'Homework',
            content: homeworkItem.description || '',
            source: 'homework',
            dmiItems:
              homeworkItem.dmiItems?.map(i => ({
                id: i.id,
                questionNumber: i.questionNumber,
                questionText: i.questionText,
              })) || [],
            deployedAt: Date.now(),
            polls: [],
            questions: [],
            sourceDocument: homeworkItem.sourceDocument
              ? {
                  fileName: homeworkItem.sourceDocument.fileName,
                  fileUrl: homeworkItem.sourceDocument.fileUrl,
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
      const updateTaskPciFromMessages = (
        messages: { role: 'user' | 'assistant'; content: string }[]
      ) => {
        setTaskBuilder(prev => {
          if (prev.activeExtensionId) {
            return {
              ...prev,
              extensions: prev.extensions.map(ext =>
                ext.id === prev.activeExtensionId
                  ? { ...ext, pci: formatPciTranscript(messages) }
                  : ext
              ),
            }
          }
          return { ...prev, taskPci: formatPciTranscript(messages) }
        })
      }

      if (isTask) {
        if (taskBuilder.activeExtensionId) {
          setTaskExtensionPciMessages(prev => ({
            ...prev,
            [taskBuilder.activeExtensionId as string]: nextMessages,
          }))
        } else {
          setTaskPciMessages(nextMessages)
        }
        updateTaskPciFromMessages(nextMessages)
        setTaskPciLoading(true)
      } else {
        setAssessmentPciMessagesMap(prev => ({ ...prev, [assessmentId || '']: nextMessages }))
        setAssessmentBuilder(prev => ({ ...prev, taskPci: formatPciTranscript(nextMessages) }))
        setAssessmentPciLoadingMap(prev => ({ ...prev, [assessmentId || '']: true }))
      }

      try {
        const slideContent = isTask ? taskBuilder.taskContent : assessmentBuilder.taskContent
        const pci = isTask
          ? taskBuilder.activeExtensionId
            ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)?.pci ||
              taskBuilder.taskPci
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
          ? activeExt?.sourceDocument || taskSourceDocument
          : assessmentSourceDocument
        const sourceDocument = sourceDocData
          ? {
              fileName: sourceDocData.fileName,
              fileUrl: sourceDocData.fileUrl,
              mimeType: sourceDocData.mimeType,
            }
          : undefined

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
          updateTaskPciFromMessages(updated)
          setTaskPciErrorHint('')
        } else {
          const updated = nextMessages.concat(assistantMessage)
          setAssessmentPciMessagesMap(prev => ({ ...prev, [assessmentId || '']: updated }))
          setAssessmentBuilder(prev => ({ ...prev, taskPci: formatPciTranscript(updated) }))
          setAssessmentPciErrorHintMap(prev => ({ ...prev, [assessmentId || '']: '' }))
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

      // Get PCI content from active task/assessment
      const pciContent =
        testPciSource === 'task'
          ? taskBuilder.activeExtensionId
            ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)?.pci ||
              taskBuilder.taskPci
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
        const response = await fetch(pdfUrl)
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

    // Generate DMI using AI from content or PDF images with versioning
    const handleGenerateDMI = async (type: 'task' | 'assessment') => {
      const isTask = type === 'task'
      const builder = isTask ? taskBuilder : assessmentBuilder
      const activeExt =
        isTask && taskBuilder.activeExtensionId
          ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)
          : null
      const content = activeExt ? activeExt.content : builder.taskContent
      const sourceDoc = isTask
        ? activeExt?.sourceDocument || taskSourceDocument
        : assessmentSourceDocument

      const hasContent = content.trim().length > 0
      const hasPdf = sourceDoc?.mimeType === 'application/pdf' && sourceDoc.fileUrl

      if (!hasContent && !hasPdf) {
        toast.error('Please add Assessment content or load a PDF first')
        return
      }

      setDmiGenerating(true)
      try {
        let pdfPages: string[] | undefined
        if (hasPdf) {
          toast.info('Analyzing PDF with AI...')
          pdfPages = await renderPdfToImages(sourceDoc.fileUrl, 3)
        }

        const response = await fetch('/api/ai/generate-dmi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            title: builder.title,
            content: !hasPdf && hasContent ? content : undefined,
            pdfPages,
          }),
        })

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(errorBody.error || `Failed to generate DMI (${response.status})`)
        }

        const data = await response.json()
        const questions = data.questions || []

        if (questions.length === 0) {
          toast.warning('No questions could be generated. Try adding more content.')
          return
        }

        const items: DMIQuestion[] = questions.map((q: any) => ({
          id: `dmi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          questionNumber: q.questionNumber || 1,
          questionText: q.questionText || 'Question',
          answer: q.answer || '',
        }))

        // Calculate version number
        const existingVersions = isTask ? taskDmiVersions : assessmentDmiVersions
        const nextVersionNumber = existingVersions.length + 1

        // Create new version
        const newVersion: DMIVersion = {
          id: `dmi-version-${Date.now()}`,
          versionNumber: nextVersionNumber,
          items: items,
          createdAt: Date.now(),
          taskId: isTask ? loadedTaskId || undefined : undefined,
          assessmentId: !isTask ? loadedAssessmentId || undefined : undefined,
        }

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

        toast.success(`DMI form v${nextVersionNumber} created with ${items.length} questions`)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate DMI'
        toast.error(message)
      } finally {
        setDmiGenerating(false)
      }
    }

    // Load a specific DMI version
    const handleLoadDmiVersion = (version: DMIVersion, type: 'task' | 'assessment') => {
      if (type === 'task') {
        setTaskDmiItems(version.items)
      } else {
        setAssessmentDmiItems(version.items)
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
        })),
        deployedAt: Date.now(),
        polls: [],
        questions: [],
        sourceDocument: assessmentSourceDocument
          ? {
              fileName: assessmentSourceDocument.fileName,
              fileUrl: assessmentSourceDocument.fileUrl,
              mimeType: assessmentSourceDocument.mimeType,
            }
          : undefined,
      }

      insightsProps.onDeployTask(task)
      toast.success('DMI deployed to live class')
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

    // Dnd-kit sensors
    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: {
          distance: 8,
        },
      }),
      useSensor(KeyboardSensor, {
        coordinateGetter: sortableKeyboardCoordinates,
      })
    )

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
    const handleSaveCourseBuilderNode = (data: any) => {
      if (activeModal.itemId) {
        setCourseBuilderNodes(nodes.map(m => (m.id === activeModal.itemId ? { ...m, ...data } : m)))
      } else {
        setCourseBuilderNodes(nodes.map(m => (m.id === editingData.id ? { ...m, ...data } : m)))
      }
      setActiveModal({ type: 'node', isOpen: false })
      toast.success('Lesson saved')
    }

    const handleSaveLesson = (data: any) => {
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
    }

    const handleSaveTask = (
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
    }

    const handleSaveContent = (data: Content) => {
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
    }

    const handleSaveAssessment = (
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
    }

    const handleSaveCourseBuilderNodeQuiz = (data: any) => {
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
    }

    const saveNodesIfPossible = async (nextNodes: CourseBuilderNode[]) => {
      if (isStudentView) return
      if (!onSave) return
      if (!courseName && !coursePropsModal.name) {
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
      const nextNodes = nodes.filter(m => m.id !== nodeId)
      setCourseBuilderNodes(nextNodes)
      if (mainTab !== 'live') await saveNodesIfPossible(nextNodes)
      toast.success('Lesson deleted')
    }

    const deleteLesson = async (nodeId: string, lessonId: string) => {
      const nextNodes = nodes.map(m =>
        m.id === nodeId ? { ...m, lessons: m.lessons.filter(l => l.id !== lessonId) } : m
      )
      setCourseBuilderNodes(nextNodes)
      if (mainTab !== 'live') await saveNodesIfPossible(nextNodes)
      toast.success('Lesson deleted')
    }

    const deleteTask = async (nodeId: string, lessonId: string, taskId: string) => {
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

    // File upload handlers for Media and Docs
    const handleMediaUpload = (
      nodeId: string,
      lessonId: string,
      files: FileList | null,
      type: 'video' | 'image'
    ) => {
      if (!files || files.length === 0) return

      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      const lessonIndex = nodes[nodeIndex]?.lessons.findIndex(l => l.id === lessonId)
      if (nodeIndex === -1 || lessonIndex === -1) return

      const newCourseBuilderNodes = [...nodes]

      Array.from(files).forEach(file => {
        if (type === 'video') {
          newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].media.videos.push({
            id: `video-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            title: file.name,
            url: trackObjectUrl(URL.createObjectURL(file)),
            duration: 0,
          })
        } else {
          newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].media.images.push({
            id: `image-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            title: file.name,
            url: trackObjectUrl(URL.createObjectURL(file)),
          })
        }
      })

      setCourseBuilderNodes(newCourseBuilderNodes)
      toast.success(`${files.length} ${type}(s) uploaded`)
    }

    const handleDocUpload = (nodeId: string, lessonId: string, files: FileList | null) => {
      if (!files || files.length === 0) return

      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      const lessonIndex = nodes[nodeIndex]?.lessons.findIndex(l => l.id === lessonId)
      if (nodeIndex === -1 || lessonIndex === -1) return

      const newCourseBuilderNodes = [...nodes]

      Array.from(files).forEach(file => {
        const ext = file.name.split('.').pop()?.toLowerCase()
        const docType =
          ext === 'pdf'
            ? 'pdf'
            : ext === 'doc' || ext === 'docx'
              ? 'doc'
              : ext === 'ppt' || ext === 'pptx'
                ? 'ppt'
                : 'other'

        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].docs.push({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          title: file.name,
          url: trackObjectUrl(URL.createObjectURL(file)),
          type: docType,
        })
      })

      setCourseBuilderNodes(newCourseBuilderNodes)
      toast.success(`${files.length} document(s) uploaded`)
    }

    const handleAssetsMediaUpload = (files: FileList | null, type: 'video' | 'image') => {
      const { nodeId, lessonId } = ensureFirstLessonContext()
      handleMediaUpload(nodeId, lessonId, files, type)
    }

    const handleAssetsDocUpload = (files: FileList | null) => {
      const { nodeId, lessonId } = ensureFirstLessonContext()
      handleDocUpload(nodeId, lessonId, files)
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
              if (!asset.url) {
                toast.error(
                  `The document '${asset.name}' is missing its file URL. Please delete and upload it again.`
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
                mimeType: asset.mimeType || 'application/pdf',
                uploadedAt: new Date().toISOString(),
                extractedText,
              }

              setAssessmentSourceDocument(newDoc)
              setAssessmentUploadedFiles([{ id: 'source', name: asset.name }])
              setAssessmentBuilder(prev => ({ ...prev, taskContent: extractedText }))

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
              // For tasks, just dump the text
              onText(asset.content || `[Asset: ${asset.name}]`)
              toast.success(`Loaded text from '${asset.name}'`)
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

        if (target === 'assessment') {
          const f = files[0]
          if (!f) return
          toast.info(`Uploading '${f.name}'...`)

          let extractedText = ''
          try {
            extractedText = (await extractTextFromFile(f)) || ''
          } catch {
            extractedText = ''
          }

          let fileUrl = ''
          let fileMimeType = 'application/pdf'
          try {
            const uploadForm = new FormData()
            uploadForm.append('file', f)

            const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
            const csrfData = await csrfRes.json().catch(() => ({}))
            const csrfToken = csrfData?.token ?? null

            const uploadRes = await fetch('/api/uploads/documents', {
              method: 'POST',
              headers: {
                ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
              },
              body: uploadForm,
              credentials: 'include',
            })
            if (uploadRes.ok) {
              const uploadData = await uploadRes.json()
              fileUrl = uploadData.url || ''
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
            mimeType: newAsset.mimeType,
            uploadedAt: new Date().toISOString(),
            extractedText: newAsset.content,
          }

          setAssessmentSourceDocument(newDoc)
          setAssessmentUploadedFiles([{ id: 'source', name: newAsset.name }])
          setAssessmentBuilder(prev => ({ ...prev, taskContent: newAsset.content || '' }))

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
            }
            onText(combined.trim())
          }
          return
        }

        let combined = ''
        for (const f of files) {
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
        }
        onText(combined.trim())
        toast.success('File(s) parsed and loaded')
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
      <div className="mt-4 rounded-xl border bg-white shadow-sm">
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
            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.rtf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.mp4,.mov,.webm"
                className="hidden"
                onChange={async (e: any) => {
                  const files = Array.from(e.target.files || []) as File[]
                  const newAssets = await Promise.all(
                    files.map(async (f: File) => {
                      let textContent = ''
                      try {
                        const extracted = await extractTextFromFile(f)
                        textContent = extracted || `[Imported ${f.name}]`
                      } catch {
                        textContent = `[Imported ${f.name}]`
                      }

                      // Upload to server — any file gets converted to PDF
                      let fileUrl = ''
                      let fileMimeType = 'application/pdf'
                      try {
                        const uploadForm = new FormData()
                        uploadForm.append('file', f)

                        const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
                        const csrfData = await csrfRes.json().catch(() => ({}))
                        const csrfToken = csrfData?.token ?? null

                        const uploadRes = await fetch('/api/uploads/documents', {
                          method: 'POST',
                          headers: {
                            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
                          },
                          body: uploadForm,
                          credentials: 'include',
                        })
                        if (uploadRes.ok) {
                          const uploadData = await uploadRes.json()
                          fileUrl = uploadData.url || ''
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
                        mimeType: fileMimeType || undefined,
                        folder: designatedFolder !== 'Uncategorized' ? designatedFolder : undefined,
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
          </div>
        </div>

        {/* Only show 2 most recent files */}
        <div className="flex flex-col gap-2 px-3 pb-3">
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
                <div className="flex shrink-0 items-center gap-2">
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
          <DialogContent
            theme="default"
            className="rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-md"
          >
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-slate-900">Load as...</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <p className="text-sm font-medium text-slate-700">
                Select how you would like to load &quot;{assetToLoad?.name}&quot;:
              </p>

              {/* Option 1: Tasks (One task per page) */}
              <Button
                className="h-auto w-full justify-start gap-3 rounded-xl border-slate-200 bg-white py-4 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                variant="outline"
                disabled={isSplitting}
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

                  setIsSplitting(true)
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

                    if (isPdf && assetToLoad.url) {
                      // Fetch original PDF and split it physically
                      const pdfBytes = await fetch(assetToLoad.url).then(res => res.arrayBuffer())
                      const pdfDoc = await PDFDocument.load(pdfBytes)
                      const pageCount = pdfDoc.getPageCount()

                      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
                      const csrfData = await csrfRes.json().catch(() => ({}))
                      const csrfToken = csrfData?.token ?? null

                      for (let i = 0; i < pageCount; i++) {
                        const newPdf = await PDFDocument.create()
                        const [copiedPage] = await newPdf.copyPages(pdfDoc, [i])
                        newPdf.addPage(copiedPage)
                        const splitPdfBytes = await newPdf.save()

                        const blob = new Blob([splitPdfBytes as any], { type: 'application/pdf' })
                        const formData = new FormData()
                        formData.append(
                          'file',
                          blob,
                          `${assetToLoad.name.replace(/\.pdf$/i, '')}_page_${i + 1}.pdf`
                        )

                        const uploadRes = await fetch('/api/uploads/documents', {
                          method: 'POST',
                          headers: {
                            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
                          },
                          body: formData,
                          credentials: 'include',
                        })

                        const uploadData = await uploadRes.json()
                        if (!uploadRes.ok)
                          throw new Error(uploadData.error || 'Failed to upload split page')

                        if (existingTask && existingTaskIndex !== -1 && i === 0) {
                          updatedExistingTask = {
                            ...existingTask,
                            description: pages[i] || `Page ${i + 1} from ${assetToLoad.name}`,
                            sourceDocument: {
                              fileName: `${assetToLoad.name} (Page ${i + 1})`,
                              fileUrl: uploadData.url,
                              mimeType: 'application/pdf',
                              uploadedAt: new Date().toISOString(),
                            },
                          }
                          updatedTasks[existingTaskIndex] = updatedExistingTask
                        } else {
                          const newTask = DEFAULT_TASK(startIndex + i)
                          newTask.title = `Task ${groupNumber}.${existingTask ? i + 1 : i + 1}`
                          newTask.description = pages[i] || `Page ${i + 1} from ${assetToLoad.name}`
                          newTask.sourceDocument = {
                            fileName: `${assetToLoad.name} (Page ${i + 1})`,
                            fileUrl: uploadData.url,
                            mimeType: 'application/pdf',
                            uploadedAt: new Date().toISOString(),
                          }
                          newTasks.push(newTask)
                        }
                      }
                    } else {
                      // Standard non-PDF handling
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
                                    mimeType: assetToLoad.mimeType,
                                    uploadedAt: new Date().toISOString(),
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
                              mimeType: assetToLoad.mimeType,
                              uploadedAt: new Date().toISOString(),
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
                      newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks.push(...newTasks)
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
                    setIsSplitting(false)
                  }
                }}
              >
                {isSplitting ? (
                  <Loader2 className="mt-1 h-5 w-5 shrink-0 animate-spin text-orange-500" />
                ) : (
                  <ListTodo className="mt-1 h-5 w-5 shrink-0 text-orange-500" />
                )}
                <div className="flex flex-col items-start text-left">
                  <span className="font-semibold text-slate-900">Tasks</span>
                  <span className="mt-1 text-xs font-normal text-slate-500">
                    {isSplitting
                      ? 'Processing and splitting PDF...'
                      : 'Extract text and create one task per page'}
                  </span>
                </div>
              </Button>

              {/* Option 2: Task + Extensions */}
              <Button
                className="h-auto w-full justify-start gap-3 rounded-xl border-slate-200 bg-white py-4 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                variant="outline"
                disabled={isSplitting}
                onClick={async () => {
                  if (!assetToLoad) return
                  setIsSplitting(true)

                  try {
                    const textToInsert = assetToLoad.content || `[Asset: ${assetToLoad.name}]`

                    let pages: string[] = []
                    const pdfPagesUrls: string[] = []

                    const isPdf =
                      assetToLoad.mimeType === 'application/pdf' ||
                      assetToLoad.name.toLowerCase().endsWith('.pdf')

                    if (isPdf && assetToLoad.url) {
                      // Fetch original PDF and split it physically
                      const pdfBytes = await fetch(assetToLoad.url).then(res => res.arrayBuffer())
                      const pdfDoc = await PDFDocument.load(pdfBytes)
                      const pageCount = pdfDoc.getPageCount()

                      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
                      const csrfData = await csrfRes.json().catch(() => ({}))
                      const csrfToken = csrfData?.token ?? null

                      for (let i = 0; i < pageCount; i++) {
                        const newPdf = await PDFDocument.create()
                        const [copiedPage] = await newPdf.copyPages(pdfDoc, [i])
                        newPdf.addPage(copiedPage)
                        const splitPdfBytes = await newPdf.save()

                        const blob = new Blob([splitPdfBytes as any], { type: 'application/pdf' })
                        const formData = new FormData()
                        formData.append(
                          'file',
                          blob,
                          `${assetToLoad.name.replace(/\.pdf$/i, '')}_page_${i + 1}.pdf`
                        )

                        const uploadRes = await fetch('/api/uploads/documents', {
                          method: 'POST',
                          headers: {
                            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
                          },
                          body: formData,
                          credentials: 'include',
                        })

                        const uploadData = await uploadRes.json()
                        if (!uploadRes.ok)
                          throw new Error(uploadData.error || 'Failed to upload split page')

                        pdfPagesUrls.push(uploadData.url)
                      }

                      // Dummy text to represent pages since we use physical PDF URLs
                      pages = Array(pageCount)
                        .fill('')
                        .map((_, i) => `Page ${i + 1} from ${assetToLoad.name}`)
                    } else {
                      if (textToInsert.includes('\f')) {
                        pages = textToInsert.split('\f').filter(p => p.trim())
                      } else if (textToInsert.includes('--- Page')) {
                        pages = textToInsert.split(/--- Page \d+ ---/).filter(p => p.trim())
                      } else {
                        const chunks = textToInsert.split(/\n\n+/).filter(p => p.trim().length > 50)
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
                        mimeType: 'application/pdf',
                        uploadedAt: new Date().toISOString(),
                      }
                    } else if (assetToLoad.url && assetToLoad.mimeType) {
                      newTask.sourceDocument = {
                        fileName: assetToLoad.name,
                        fileUrl: assetToLoad.url,
                        mimeType: assetToLoad.mimeType,
                        uploadedAt: new Date().toISOString(),
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
                          mimeType: 'application/pdf',
                          uploadedAt: new Date().toISOString(),
                        }
                      }

                      return ext
                    })

                    newTask.extensions = extensions

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
                    setIsSplitting(false)
                  }
                }}
              >
                {isSplitting ? (
                  <Loader2 className="mt-1 h-5 w-5 shrink-0 animate-spin text-green-500" />
                ) : (
                  <Layers2 className="mt-1 h-5 w-5 shrink-0 text-green-500" />
                )}
                <div className="flex flex-col items-start text-left">
                  <span className="font-semibold text-slate-900">Task + Extensions</span>
                  <span className="mt-1 text-xs font-normal text-slate-500">
                    {isSplitting
                      ? 'Processing and splitting PDF...'
                      : 'First page as task, remaining as extensions'}
                  </span>
                </div>
              </Button>

              {/* Option 3: Assessment */}
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
                    Load entire document into {loadedAssessmentId ? 'current' : 'a new'} assessment
                  </span>
                </div>
              </Button>
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
                    className="w-full gap-1 rounded-full border-0 bg-teal-400 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-500"
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
                            <div className="flex shrink-0 items-center gap-2">
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

    // Check if the active extension has a document, otherwise fallback to task document
    const currentTaskDocument = activeTaskExtension?.sourceDocument || taskSourceDocument
    const hasTaskDocument = !!currentTaskDocument

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

    const hasAssessmentDocument = !!assessmentSourceDocument
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

    // Auto-save course edits (debounced)
    useEffect(() => {
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

    // Check if the portal target exists
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

    useEffect(() => {
      const el = document.getElementById('course-builder-tabs-portal')
      if (el) {
        setPortalTarget(el)
      }
    }, [])

    return (
      <div
        className={cn(
          'flex h-full w-full flex-col items-stretch',
          panelMode === 'live-class' && 'pt-3'
        )}
      >
        <Tabs
          value={mainTab}
          onValueChange={v => {
            setMainTab(v as 'live' | 'builder' | 'test-pci')
            // Add callback to notify parent route
            if (onMainTabChange) {
              onMainTabChange(v as 'live' | 'builder' | 'test-pci')
            }
          }}
          className="flex h-full w-full flex-1 flex-col bg-gray-50/50 px-4 pt-0 sm:px-6"
        >
          {portalTarget ? (
            createPortal(
              <div className="mb-0 flex w-full flex-col gap-2">
                <div className="flex w-full flex-wrap items-center gap-2">
                  {!isStudentView && (
                    <div className="flex min-h-[48px] flex-1 items-center justify-between gap-2 rounded-full border border-slate-200 bg-white px-2 shadow-[0_10px_24px_rgba(0,0,0,0.10)]">
                      <div className="flex flex-wrap items-center gap-2">
                        {insightsProps && (
                          <Button
                            variant={isMirroringToStudents ? 'default' : 'secondary'}
                            size="sm"
                            onClick={() => setIsMirroringToStudents(!isMirroringToStudents)}
                            className="h-8 gap-2 rounded-full px-3 text-xs shadow-none"
                          >
                            <div
                              className={`h-2 w-2 rounded-full ${isMirroringToStudents ? 'animate-pulse bg-green-400' : 'bg-red-400'}`}
                            />
                            {isMirroringToStudents ? 'Syncing to Students' : 'Sync Paused'}
                          </Button>
                        )}

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            if (!sessionContext?.roomUrl) return
                            openVideoOverlay({
                              roomUrl: sessionContext.roomUrl,
                              token: sessionContext.token,
                              autoRecord: !isStudentView,
                              isTutor: true,
                            })
                          }}
                          disabled={!sessionContext?.roomUrl}
                          className="h-8 gap-2 rounded-full px-3 text-xs shadow-none"
                        >
                          <VideoIcon className="h-4 w-4" />
                          Video
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            if (!isSessionActive) return
                            setIsMirroringToStudents(true)
                            setTestPciActiveTab('classroom')
                          }}
                          disabled={!isSessionActive}
                          className="h-8 gap-2 rounded-full px-3 text-xs shadow-none"
                          title={
                            !isSessionActive
                              ? 'Available when session is active'
                              : 'Mirror classroom'
                          }
                        >
                          <LayoutPanelTop className="h-4 w-4" />
                          Mirror Class
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            if (!isSessionActive) return
                            setIsMirroringToStudents(true)
                            setTestPciActiveTab('student1')
                          }}
                          disabled={!isSessionActive}
                          className="h-8 gap-2 rounded-full px-3 text-xs shadow-none"
                          title={
                            !isSessionActive
                              ? 'Available when session is active'
                              : 'Mirror whiteboard'
                          }
                        >
                          <PenTool className="h-4 w-4" />
                          Mirror Board
                        </Button>
                      </div>

                      {(insightsProps?.onToggleRecording || insightsProps?.onEndSession) && (
                        <div className="flex items-center gap-2 pr-1">
                          {insightsProps?.isRecording &&
                            insightsProps?.recordingDuration != null && (
                              <span className="font-mono text-xs text-red-500">
                                {formatDuration(insightsProps.recordingDuration)}
                              </span>
                            )}
                          {insightsProps?.onToggleRecording && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (!isSessionActive) return
                                insightsProps.onToggleRecording?.()
                              }}
                              disabled={!isSessionActive}
                              className="h-8 w-8 rounded-full p-0 hover:bg-slate-100 disabled:hover:bg-transparent"
                              title={
                                !isSessionActive
                                  ? 'Recording available when session is active'
                                  : insightsProps.isRecording
                                    ? 'Stop Recording'
                                    : 'Record'
                              }
                            >
                              {insightsProps.isRecording ? (
                                <Square className="h-4 w-4 fill-current text-red-500" />
                              ) : (
                                <Circle className="h-4 w-4 fill-current text-red-500" />
                              )}
                            </Button>
                          )}
                          {insightsProps?.onEndSession && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (!isSessionActive) return
                                insightsProps.onEndSession?.()
                              }}
                              disabled={!isSessionActive || insightsProps.endingSession}
                              className="h-8 gap-2 rounded-full px-3 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-600 disabled:hover:bg-transparent"
                              title={
                                !isSessionActive ? 'End available when session is active' : 'End'
                              }
                            >
                              {insightsProps.endingSession ? 'Ending…' : 'End'}
                            </Button>
                          )}
                        </div>
                      )}

                      {onSyncToLiveSession && (
                        <div className="flex items-center gap-2 pr-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              doSave()
                              handleSyncToLive()
                              onSyncToLiveSession()
                            }}
                            className="h-8 gap-2 rounded-full px-3 text-xs font-medium text-slate-600 hover:bg-slate-100"
                            title="Sync course to live session"
                          >
                            <RefreshCw className="h-4 w-4" />
                            Sync
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  <TabsList className="flex h-[48px] w-full flex-none items-center gap-2 border-0 bg-transparent p-0 shadow-none sm:w-auto">
                    <TabsTrigger
                      value="live"
                      className="z-20 flex cursor-pointer items-center justify-center gap-2 rounded-full border-0 px-4 py-2.5 text-sm font-semibold shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all data-[state=inactive]:bg-white data-[state=active]:bg-[linear-gradient(145deg,rgba(18,20,22,0.82),rgba(62,68,75,0.62))] data-[state=active]:text-white data-[state=inactive]:text-[#1F2933] data-[state=active]:shadow-[0_12px_26px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.25)]"
                      onClick={e => {
                        if (mainTab !== 'live') {
                          setMainTab('live')
                        }
                      }}
                    >
                      <div className="pointer-events-none relative z-10 flex items-center gap-2 rounded-full px-2 py-0.5 transition-colors">
                        <VideoIcon
                          className={cn(
                            'h-4 w-4 transition-all duration-300',
                            isSessionActive
                              ? 'text-red-500 drop-shadow-[0_0_8px_rgba(220,38,38,1)]'
                              : 'text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,1)]'
                          )}
                        />
                        {saveMode === 'draft' ? 'Classroom' : 'Live'}
                      </div>
                    </TabsTrigger>
                    {!isStudentView && (
                      <>
                        <TabsTrigger
                          value="test-pci"
                          className="flex items-center justify-center gap-2 rounded-full border-0 px-4 py-2.5 text-sm font-semibold shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all data-[state=inactive]:bg-white data-[state=active]:bg-[linear-gradient(145deg,rgba(18,20,22,0.82),rgba(62,68,75,0.62))] data-[state=active]:text-white data-[state=inactive]:text-[#1F2933] data-[state=active]:shadow-[0_12px_26px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.25)]"
                          onClick={e => {
                            if (mainTab !== 'test-pci') {
                              setMainTab('test-pci')
                            }
                          }}
                        >
                          <TestTube2 className="h-4 w-4" />
                          Test
                        </TabsTrigger>
                        <TabsTrigger
                          value="builder"
                          className="flex items-center justify-center gap-2 rounded-full border-0 px-4 py-2.5 text-sm font-semibold shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all data-[state=inactive]:bg-white data-[state=active]:bg-[linear-gradient(145deg,rgba(18,20,22,0.82),rgba(62,68,75,0.62))] data-[state=active]:text-white data-[state=inactive]:text-[#1F2933] data-[state=active]:shadow-[0_12px_26px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.25)]"
                          onClick={e => {
                            if (mainTab !== 'builder') {
                              setMainTab('builder')
                            }
                          }}
                        >
                          <div
                            className={cn(
                              'relative z-10 flex items-center gap-2 rounded-full px-2 py-0.5 transition-colors',
                              mainTab === 'builder'
                                ? 'pointer-events-auto cursor-pointer'
                                : 'pointer-events-none'
                            )}
                          >
                            <PencilRuler className="h-4 w-4" />
                            Build
                          </div>
                        </TabsTrigger>
                      </>
                    )}
                  </TabsList>
                </div>
              </div>,
              portalTarget
            )
          ) : (
            <div className="hidden">
              <TabsList>
                <TabsTrigger value="live">Go Live</TabsTrigger>
                {!isStudentView && (
                  <>
                    <TabsTrigger value="test-pci">Test</TabsTrigger>
                    <TabsTrigger value="builder">Build</TabsTrigger>
                  </>
                )}
              </TabsList>
            </div>
          )}

          <div className="relative flex h-full w-full min-w-0 flex-1 gap-0 pb-6 pt-0">
            {/* LEFT PANEL - Course Structure (resizable, ~75% of original width) */}
            {/* Floating collapsed/expanded pill */}
            <div
              className="absolute top-1/2 z-50 flex h-16 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-full border border-l-0 border-[#E5E7EB] bg-white shadow-[2px_0_8px_rgba(0,0,0,0.08)] transition-all hover:w-10 hover:bg-slate-50"
              style={{ left: leftPanelHidden ? 0 : leftPanelWidth - 16 }}
              onClick={() => setLeftPanelHidden(!leftPanelHidden)}
              title={leftPanelHidden ? 'Show directory' : 'Hide directory'}
            >
              {leftPanelHidden ? (
                <ChevronRight className="h-5 w-5 text-[#2B5FB8]" />
              ) : (
                <ChevronLeft className="h-5 w-5 text-[#2B5FB8]" />
              )}
            </div>

            {!leftPanelHidden && (
              <div
                className="relative z-40 flex h-full min-h-0 shrink-0 flex-col"
                ref={leftPanelRef}
                style={{ width: leftPanelWidth }}
              >
                <div className="flex h-full min-h-0 flex-col pr-4">
                  <Card className="flex h-full min-h-0 flex-1 flex-col rounded-[20px] border border-[rgba(0,0,0,0.04)] bg-[#FFFFFF] shadow-[0_18px_45px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]">
                    <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-1.5">
                      {/* Header with Hide, Import, and +Lesson buttons */}
                      <div className="mb-4 flex min-h-[58px] items-center justify-between px-1.5 pt-1.5">
                        <div className="flex flex-col justify-center gap-1">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-[#1F2933]">Directory</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {mainTab !== 'live' && mainTab !== 'test-pci' && (
                            <Button
                              size="sm"
                              onClick={addCourseBuilderNode}
                              className="h-7 gap-1 px-2 text-xs"
                            >
                              <Plus className="h-3 w-3" />
                              Lesson
                            </Button>
                          )}
                        </div>
                      </div>

                      {!hideDirectorySearch && (
                        <div className="relative mb-4">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
                          <input
                            placeholder="Search course..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full rounded-2xl border border-[#E5E7EB] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1F2933] outline-none placeholder:text-[#98A2B3] focus:border-[#B8CCFF] focus:ring-2 focus:ring-[#DCEAFF]"
                          />
                        </div>
                      )}

                      <ScrollArea className="min-h-0 flex-1 pr-1.5">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                        >
                          <div className="flex flex-col gap-4">
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
                                    inlineDragHandle
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
                                          {mainTab !== 'builder' ? (
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
                                        </div>
                                      </div>

                                      {expandedCourseBuilderNodes.has(node.id) && (
                                        <div className="mt-1 flex flex-col gap-2 px-3 pb-3">
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
                                                  disabled={mainTab !== 'builder'}
                                                  className={cn(
                                                    'h-6 w-6 rounded-md bg-[#2B5FB8]/10 p-0 text-[#2B5FB8] hover:bg-[#2B5FB8]/20',
                                                    mainTab !== 'builder' &&
                                                      'cursor-not-allowed opacity-40'
                                                  )}
                                                  onClick={() => {
                                                    if (mainTab !== 'builder') return
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
                                            <div className="mt-2 space-y-1">
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
                                                          'group/item relative mb-2 ml-0 mr-0 flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-xl border px-3 py-2 shadow-sm transition-colors',
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
                                                                              sourceDocument:
                                                                                hw.sourceDocument,
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
                                                                            description:
                                                                              taskBuilder.taskContent,
                                                                            instructions:
                                                                              taskBuilder.taskPci,
                                                                            extensions:
                                                                              taskBuilder.extensions,
                                                                            dmiItems: taskDmiItems,
                                                                            sourceDocument:
                                                                              t.sourceDocument,
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
                                                                      insightsProps.onDeployTask({
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

                                                              {mainTab === 'builder' && (
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
                                                                                                description:
                                                                                                  taskBuilder.taskContent,
                                                                                                instructions:
                                                                                                  taskBuilder.taskPci,
                                                                                                extensions:
                                                                                                  taskBuilder.extensions,
                                                                                                dmiItems:
                                                                                                  taskDmiItems,
                                                                                                sourceDocument:
                                                                                                  t.sourceDocument,
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
                                                                                                sourceDocument:
                                                                                                  h.sourceDocument,
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
                                                            <div className="ml-0 space-y-px">
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
                                                                              insightsProps.onDeployTask(
                                                                                {
                                                                                  id: ext.id,
                                                                                  title: ext.name,
                                                                                  content:
                                                                                    ext.description ||
                                                                                    ext.name,
                                                                                  source: 'task',
                                                                                  parentId: task.id,
                                                                                  isExtension: true,
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
                                                                                delete next[ext.id]
                                                                                return next
                                                                              }
                                                                            )
                                                                            setTaskExtensionPciInputs(
                                                                              prev => {
                                                                                const next = {
                                                                                  ...prev,
                                                                                }
                                                                                delete next[ext.id]
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
                                                  disabled={mainTab !== 'builder'}
                                                  className={cn(
                                                    'h-6 w-6 rounded-md bg-[#6D59D8]/10 p-0 text-[#6D59D8] hover:bg-[#6D59D8]/20',
                                                    mainTab !== 'builder' &&
                                                      'cursor-not-allowed opacity-40'
                                                  )}
                                                  onClick={() => {
                                                    if (mainTab !== 'builder') return
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
                                            <div className="mt-2 space-y-1">
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
                                                        'group/item relative mb-2 ml-0 mr-0 flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-xl border px-3 py-2 shadow-sm transition-colors',
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
                                                                        sourceDocument:
                                                                          t.sourceDocument,
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
                                                                        sourceDocument:
                                                                          h.sourceDocument,
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
                                                                    insightsProps.onDeployTask({
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

                                                            {mainTab === 'builder' && (
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
                                                  <div className="mt-2 space-y-1">
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
                                                              'group/item relative mb-2 ml-0 mr-0 flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-xl border px-3 py-2 shadow-sm transition-colors',
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
                                                                          insightsProps.onDeployTask(
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

                                                                  {mainTab === 'builder' && (
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
              <SubmissionsPanel
                courseId={courseId || ''}
                width={rightPanelWidth}
                hidden={rightPanelHidden}
                onToggleHidden={setRightPanelHidden}
              />
            )}

            {/* CENTER PANEL - New Three-Section Design */}
            <div
              className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-stretch pl-4"
              style={{
                paddingRight: !isStudentView && !rightPanelHidden ? rightPanelWidth + 16 : 0,
              }}
            >
              <div className="flex min-h-0 w-full flex-1 grow flex-col items-stretch gap-4">
                {mainTab !== 'builder' && (
                  <div className="h-full w-full flex-1">
                    <Card className="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_6px_16px_rgba(0,0,0,0.06)]">
                      <CardContent className="flex h-full min-h-0 w-full flex-col overflow-hidden p-0 pt-1">
                        <CardTitle className="mb-1 flex items-center justify-between gap-2 px-1 text-base font-semibold">
                          <div>
                            {/* Timer removed — kept in CourseBuilderInsightsRoute header instead */}
                          </div>
                        </CardTitle>
                        <div className="flex min-h-0 w-full flex-1 flex-col items-stretch gap-0 overflow-hidden">
                          {/* Main content with tabs */}
                          <div className="flex h-full w-full min-w-0 flex-1 flex-col pb-0">
                            <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden px-0">
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
                                <TabsList className="mb-4 grid w-full grid-cols-4 gap-2 bg-transparent p-0 shadow-none">
                                  {testPciTabs.map(tab => (
                                    <div key={tab.id} className="relative w-full">
                                      {editingTabId === tab.id ? (
                                        <Input
                                          value={tab.label}
                                          onChange={(e: any) => {
                                            setTestPciTabs(prev =>
                                              prev.map(t =>
                                                t.id === tab.id
                                                  ? { ...t, label: e.target.value }
                                                  : t
                                              )
                                            )
                                          }}
                                          onBlur={() => setEditingTabId(null)}
                                          onKeyDown={(e: any) => {
                                            if (e.key === 'Enter') setEditingTabId(null)
                                          }}
                                          className="w-full rounded-xl border border-[#CFE0FF] bg-[#EEF4FF] px-3 py-2.5 text-center text-sm font-medium text-[#2B5FB8] focus-visible:ring-0"
                                          autoFocus
                                        />
                                      ) : (
                                        <TabsTrigger
                                          value={tab.id}
                                          className="relative flex w-full items-center justify-center truncate rounded-xl border border-[#E5E7EB] bg-white px-2 py-2.5 text-[11px] font-medium text-[#667085] transition-all data-[state=active]:border-[#CFE0FF] data-[state=active]:bg-[#EEF4FF] data-[state=active]:text-[#2B5FB8] data-[state=inactive]:hover:bg-slate-50 sm:text-xs"
                                          onDoubleClick={() => setEditingTabId(tab.id)}
                                        >
                                          {tab.label}
                                        </TabsTrigger>
                                      )}
                                    </div>
                                  ))}
                                </TabsList>
                                {testPciTabs.map(tab => (
                                  <TabsContent
                                    key={tab.id}
                                    value={tab.id}
                                    padding="none"
                                    className="mt-2 flex h-full w-full min-w-0 flex-1 flex-col self-stretch overflow-hidden bg-transparent data-[state=active]:flex data-[state=inactive]:hidden"
                                  >
                                    {tab.id === 'insights' ? (
                                      insightsProps ? (
                                        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-cyan-200/70 bg-gradient-to-br from-white via-slate-50 to-cyan-50 p-1 shadow-[0_10px_40px_-20px_rgba(14,116,144,0.65)] ring-1 ring-cyan-200/60">
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
                                            <TabsList className="mb-1 grid w-full grid-cols-3 gap-1 border-0 bg-transparent shadow-none">
                                              <TabsTrigger
                                                value="analytics"
                                                className="w-full rounded-lg border-transparent bg-transparent px-1 text-xs text-[#667085] transition-all hover:bg-white hover:text-[#344054] hover:shadow-sm data-[state=active]:border-cyan-200/70 data-[state=active]:bg-cyan-100 data-[state=active]:text-cyan-900 data-[state=active]:shadow-sm"
                                              >
                                                Analytics
                                              </TabsTrigger>
                                              <TabsTrigger
                                                value="poll"
                                                className="w-full rounded-lg border-transparent bg-transparent px-1 text-xs text-[#667085] transition-all hover:bg-white hover:text-[#344054] hover:shadow-sm data-[state=active]:border-cyan-200/70 data-[state=active]:bg-cyan-100 data-[state=active]:text-cyan-900 data-[state=active]:shadow-sm"
                                              >
                                                Poll
                                              </TabsTrigger>
                                              <TabsTrigger
                                                value="question"
                                                className="w-full rounded-lg border-transparent bg-transparent px-1 text-xs text-[#667085] transition-all hover:bg-white hover:text-[#344054] hover:shadow-sm data-[state=active]:border-cyan-200/70 data-[state=active]:bg-cyan-100 data-[state=active]:text-cyan-900 data-[state=active]:shadow-sm"
                                              >
                                                Question
                                              </TabsTrigger>
                                            </TabsList>

                                            <TabsContent
                                              value="analytics"
                                              className="mx-[-16px] flex-1 overflow-auto data-[state=active]:flex data-[state=inactive]:hidden"
                                            >
                                              <AnalyticsPanel
                                                students={insightsProps.students}
                                                metrics={insightsProps.metrics}
                                                liveTasks={insightsProps.liveTasks}
                                                classDuration={insightsProps.classDuration}
                                                isRecording={insightsProps.isRecording}
                                                recordingDuration={insightsProps.recordingDuration}
                                                sessionId={insightsProps.sessionId}
                                              />
                                            </TabsContent>

                                            <TabsContent
                                              value="poll"
                                              className="flex flex-1 flex-col justify-end overflow-hidden pt-2 data-[state=active]:flex data-[state=inactive]:hidden"
                                            >
                                              {showAIPoll ? (
                                                <div className="mb-2 flex-1 overflow-hidden rounded-2xl border border-cyan-100 bg-white/60 shadow-sm backdrop-blur-md">
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
                                                  onMentionStudent={name =>
                                                    setPollPrompt(
                                                      pollPrompt
                                                        ? `${pollPrompt} @[${name}](student:${name}) `
                                                        : `@[${name}](student:${name}) `
                                                    )
                                                  }
                                                />
                                              )}
                                              <div
                                                className={cn(
                                                  'flex flex-col rounded-2xl border border-cyan-100 bg-white/40 p-px shadow-xl backdrop-blur-md transition-all duration-300',
                                                  showAIPoll
                                                    ? 'h-[30%] min-h-[120px]'
                                                    : 'h-[40%] min-h-[150px]'
                                                )}
                                              >
                                                <div className="flex flex-1 flex-col space-y-0.5 p-1">
                                                  <div className="flex items-center justify-between">
                                                    <Label className="text-xs font-semibold uppercase tracking-wider text-cyan-700">
                                                      Poll question
                                                    </Label>
                                                    <span className="text-xs font-medium text-cyan-600">
                                                      {selectedContextLabel ?? 'No item selected'}
                                                    </span>
                                                  </div>
                                                  <div className="relative flex-1">
                                                    <MentionTextarea
                                                      mentionItems={mentionItems}
                                                      className="h-full min-h-[100px] w-full border-0 bg-transparent py-4 pl-3 pr-24 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                                      placeholder="What should students answer?"
                                                      disableAutoResize
                                                      value={pollPrompt}
                                                      onChange={event =>
                                                        setPollPrompt(event.target.value)
                                                      }
                                                    />
                                                    <div className="absolute bottom-3 right-3 flex items-center gap-1">
                                                      <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className={cn(
                                                          'h-9 w-9 rounded-xl hover:bg-cyan-100 hover:text-cyan-700 disabled:opacity-30',
                                                          showAIPoll
                                                            ? 'bg-cyan-100 text-cyan-700'
                                                            : 'text-cyan-600'
                                                        )}
                                                        title="Generate with Socratic AI"
                                                        onClick={() => setShowAIPoll(!showAIPoll)}
                                                        disabled={!activeInsightsTaskId}
                                                      >
                                                        <Sparkles className="h-4 w-4" />
                                                      </Button>
                                                      <Button
                                                        size="icon"
                                                        className="h-9 w-9 rounded-xl bg-cyan-600 shadow-lg hover:bg-cyan-700 disabled:opacity-30"
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
                                                <div className="border-t border-cyan-50/50 bg-cyan-50/20 px-1 py-1">
                                                  <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                      <span className="text-muted-foreground text-[10px] uppercase tracking-wider">
                                                        Scale:
                                                      </span>
                                                      <div className="flex gap-1">
                                                        {[1, 2, 3, 4, 5].map(v => (
                                                          <span
                                                            key={v}
                                                            className="flex h-5 w-5 items-center justify-center rounded-md border border-cyan-100 bg-white text-[10px] font-medium text-cyan-600 shadow-sm"
                                                          >
                                                            {v}
                                                          </span>
                                                        ))}
                                                      </div>
                                                    </div>
                                                    <p className="max-w-[140px] truncate text-[10px] font-medium text-cyan-600">
                                                      Task:{' '}
                                                      {activeInsightsTask?.title || 'None Selected'}
                                                    </p>
                                                  </div>
                                                </div>
                                              </div>
                                            </TabsContent>

                                            <TabsContent
                                              value="question"
                                              className="flex flex-1 flex-col justify-end overflow-hidden pt-2 data-[state=active]:flex data-[state=inactive]:hidden"
                                            >
                                              {showAIQuestion ? (
                                                <div className="mb-2 flex-1 overflow-hidden rounded-2xl border border-cyan-100 bg-white/60 shadow-sm backdrop-blur-md">
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
                                                  onMentionStudent={name =>
                                                    setQuestionPrompt(
                                                      questionPrompt
                                                        ? `${questionPrompt} @[${name}](student:${name}) `
                                                        : `@[${name}](student:${name}) `
                                                    )
                                                  }
                                                />
                                              )}
                                              <div
                                                className={cn(
                                                  'flex flex-col rounded-2xl border border-cyan-100 bg-white/40 p-px shadow-xl backdrop-blur-md transition-all duration-300',
                                                  showAIQuestion
                                                    ? 'h-[30%] min-h-[120px]'
                                                    : 'h-[40%] min-h-[150px]'
                                                )}
                                              >
                                                <div className="flex flex-1 flex-col space-y-0.5 p-1">
                                                  <div className="flex items-center justify-between">
                                                    <Label className="text-xs font-semibold uppercase tracking-wider text-cyan-700">
                                                      Question prompt
                                                    </Label>
                                                    <span className="text-xs font-medium text-cyan-600">
                                                      {selectedContextLabel ?? 'No item selected'}
                                                    </span>
                                                  </div>
                                                  <div className="relative flex-1">
                                                    <MentionTextarea
                                                      mentionItems={mentionItems}
                                                      className="h-full min-h-[120px] w-full border-0 bg-transparent py-4 pl-3 pr-24 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                                      placeholder="Ask your AI coach or share a reflection..."
                                                      disableAutoResize
                                                      value={questionPrompt}
                                                      onChange={event =>
                                                        setQuestionPrompt(event.target.value)
                                                      }
                                                    />
                                                    <div className="absolute bottom-3 right-3 flex items-center gap-1">
                                                      <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className={cn(
                                                          'h-9 w-9 rounded-xl hover:bg-cyan-100 hover:text-cyan-700 disabled:opacity-30',
                                                          showAIQuestion
                                                            ? 'bg-cyan-100 text-cyan-700'
                                                            : 'text-cyan-600'
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
                                                        className="h-9 w-9 rounded-xl bg-cyan-600 shadow-lg hover:bg-cyan-700 disabled:opacity-30"
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
                                                <div className="border-t border-cyan-50/50 bg-cyan-50/20 px-1 py-1 text-[10px]">
                                                  <div className="flex items-center justify-between">
                                                    <p className="font-medium text-cyan-600">
                                                      Topic:{' '}
                                                      {activeInsightsTask?.title || 'General'}
                                                    </p>
                                                    <Badge
                                                      variant="outline"
                                                      className="border-cyan-200 bg-white/50 text-cyan-700"
                                                    >
                                                      AI Integrated
                                                    </Badge>
                                                  </div>
                                                </div>
                                              </div>
                                            </TabsContent>
                                          </Tabs>
                                        </div>
                                      ) : null
                                    ) : (
                                      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto bg-white p-0">
                                        {(() => {
                                          if (mainTab === 'live' && tab.id === 'student1') {
                                            if (monitorSelectedStudent) {
                                              const studentBoard =
                                                insightsProps?.studentBoards?.[
                                                  monitorSelectedStudent.id
                                                ]
                                              const studentPages =
                                                (studentBoard?.pages as WhiteboardPages) ||
                                                createDefaultWhiteboardPages()
                                              const studentPageIndex =
                                                typeof studentBoard?.pageIndex === 'number'
                                                  ? studentBoard.pageIndex
                                                  : 0
                                              return (
                                                <Dialog
                                                  open
                                                  onOpenChange={open => {
                                                    if (!open) {
                                                      setMonitorSelectedStudent(null)
                                                      setTestPciActiveTab('student-monitor')
                                                    }
                                                  }}
                                                >
                                                  <DialogContent className="h-[90vh] w-[90vw] max-w-none overflow-hidden rounded-2xl border border-slate-200 bg-white p-0">
                                                    <div className="flex h-full w-full flex-col">
                                                      <div className="flex items-center justify-between border-b bg-white px-4 py-2 text-sm">
                                                        <div className="font-medium text-slate-800">
                                                          Viewing: {monitorSelectedStudent.name}
                                                        </div>
                                                        <Button
                                                          variant="ghost"
                                                          size="sm"
                                                          className="h-8 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                                          onClick={() =>
                                                            setMonitorSelectedStudent(null)
                                                          }
                                                        >
                                                          Clear
                                                        </Button>
                                                      </div>
                                                      <div className="min-h-0 flex-1">
                                                        <EnhancedWhiteboard
                                                          videoOverlay={false}
                                                          pages={studentPages}
                                                          currentPageIndex={studentPageIndex}
                                                          readOnly
                                                        />
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
                                                <div className="flex h-full w-full items-center justify-center rounded-md border bg-white p-6 text-sm text-slate-500">
                                                  Monitor is unavailable without an active session.
                                                </div>
                                              )
                                            }
                                            return (
                                              <div
                                                className="relative h-full w-full"
                                                style={{
                                                  paddingRight: liveSubmissionsPanelHidden
                                                    ? 0
                                                    : liveSubmissionsPanelWidth + 16,
                                                }}
                                              >
                                                <div className="h-full w-full">
                                                  <MonitoringPanel
                                                    socket={insightsProps.socket}
                                                    sessionId={insightsProps.sessionId}
                                                    tutorId={insightsProps.tutorId}
                                                    students={sessionStudents}
                                                    selectedStudentId={
                                                      monitorSelectedStudent?.id ?? null
                                                    }
                                                    onNavigateToWhiteboard={(
                                                      studentId,
                                                      studentName
                                                    ) => {
                                                      setMonitorSelectedStudent({
                                                        id: studentId,
                                                        name: studentName,
                                                      })
                                                    }}
                                                    onOpenWhiteboard={(studentId, studentName) => {
                                                      setMonitorSelectedStudent({
                                                        id: studentId,
                                                        name: studentName,
                                                      })
                                                      setTestPciActiveTab('student1')
                                                    }}
                                                  />
                                                </div>

                                                <LiveSessionSubmissionsPanel
                                                  sessionId={insightsProps.sessionId}
                                                  width={liveSubmissionsPanelWidth}
                                                  hidden={liveSubmissionsPanelHidden}
                                                  onToggleHidden={setLiveSubmissionsPanelHidden}
                                                  selectedStudentId={
                                                    monitorSelectedStudent?.id ?? null
                                                  }
                                                  onSelectStudent={(studentId, studentName) => {
                                                    setMonitorSelectedStudent({
                                                      id: studentId,
                                                      name: studentName,
                                                    })
                                                  }}
                                                />
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

                                          const doc =
                                            mainTab === 'live'
                                              ? testPciSource === 'task'
                                                ? liveTask?.sourceDocument
                                                : liveAssessment?.sourceDocument
                                              : testPciSource === 'task'
                                                ? currentTaskDocument ||
                                                  (taskBuilder as any).sourceDocument
                                                : assessmentSourceDocument ||
                                                  (assessmentBuilder as any).sourceDocument
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
                                              <div className="h-full w-full rounded-md border bg-white p-4">
                                                <p className="text-muted-foreground whitespace-pre-wrap text-sm">
                                                  {testPciContent[tab.id] ||
                                                    `${tab.label} view content`}
                                                </p>
                                              </div>
                                            )
                                          }

                                          return (
                                            <ResizablePanelGroup
                                              orientation="horizontal"
                                              className="h-full w-full"
                                            >
                                              {hasDoc && (
                                                <ResizablePanel
                                                  defaultSize={hasDmi ? 50 : 100}
                                                  minSize={20}
                                                >
                                                  <div className="h-full w-full pr-1">
                                                    {doc?.fileUrl ? (
                                                      <iframe
                                                        src={
                                                          doc.fileUrl.includes('#')
                                                            ? `${doc.fileUrl}&toolbar=0&navpanes=0`
                                                            : `${doc.fileUrl}#toolbar=0&navpanes=0`
                                                        }
                                                        className="h-full w-full rounded-md border-0"
                                                        title="PDF Viewer"
                                                      />
                                                    ) : (
                                                      <p className="text-muted-foreground whitespace-pre-wrap p-2 text-sm">
                                                        {mainTab === 'live'
                                                          ? testPciSource === 'task'
                                                            ? liveTask?.description
                                                            : liveAssessment?.description
                                                          : doc?.extractedText}
                                                      </p>
                                                    )}
                                                  </div>
                                                </ResizablePanel>
                                              )}
                                              {hasDoc && hasDmi && <ResizableHandle withHandle />}
                                              {hasDmi && (
                                                <ResizablePanel
                                                  defaultSize={hasDoc ? 50 : 100}
                                                  minSize={20}
                                                >
                                                  <div className="ml-1 h-full w-full overflow-y-auto rounded-md border bg-white p-4">
                                                    <div className="space-y-4">
                                                      {version.items.map(item => (
                                                        <div
                                                          key={item.id}
                                                          className="rounded-lg border bg-gray-50 p-3"
                                                        >
                                                          <p className="text-sm font-medium text-gray-900">
                                                            <span className="mr-1 text-indigo-600">
                                                              Q{item.questionNumber}:
                                                            </span>
                                                            {item.questionText}
                                                          </p>
                                                          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                                                            <span className="font-medium">
                                                              Answer:
                                                            </span>{' '}
                                                            {item.answer}
                                                          </p>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                </ResizablePanel>
                                              )}
                                            </ResizablePanelGroup>
                                          )
                                        })()}
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
                                  <div className="mt-1 w-full rounded-2xl border border-cyan-300 bg-white/90 shadow-[0_0_15px_rgba(34,211,238,0.4)] backdrop-blur-md transition-all duration-300 focus-within:shadow-[0_0_25px_rgba(34,211,238,0.6)]">
                                    <div className="relative flex w-full flex-col p-px">
                                      <div className="flex w-full flex-col">
                                        <MentionTextarea
                                          mentionItems={mentionItems}
                                          className="min-h-[100px] w-full flex-1 border-0 bg-transparent px-4 py-4 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
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
                                                        {testPciViewMode ===
                                                          `dmi_${version.id}` && (
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
                                            disabled={testPciLoading}
                                            onClick={() => {
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
                                                    insightsProps.onDeployTask({
                                                      id: task.id,
                                                      title: task.title || 'Task',
                                                      content: task.description || '',
                                                      source: 'task',
                                                      dmiItems:
                                                        task.dmiItems?.map(item => ({
                                                          id: item.id,
                                                          questionNumber: item.questionNumber,
                                                          questionText: item.questionText,
                                                        })) || [],
                                                      deployedAt: Date.now(),
                                                      polls: [],
                                                      questions: [],
                                                      sourceDocument: task.sourceDocument
                                                        ? {
                                                            fileName: task.sourceDocument.fileName,
                                                            fileUrl: task.sourceDocument.fileUrl,
                                                            mimeType:
                                                              task.sourceDocument.mimeType ||
                                                              'application/pdf',
                                                          }
                                                        : undefined,
                                                    })
                                                    toast.success('Task DMI deployed to live class')
                                                  }
                                                } else {
                                                  handleDeployAssessmentDmi()
                                                }
                                              }}
                                              title="Deploy to Class"
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
                  </div>
                )}

                {mainTab === 'builder' && (
                  <div className="h-full w-full flex-1">
                    {/* COMBINED BUILDER: Task & Assessment Tabs */}
                    <Card className="flex h-full w-full flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_6px_16px_rgba(0,0,0,0.06)]">
                      <CardContent className="flex h-full flex-col overflow-hidden p-2">
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
                                        className="relative flex h-full min-h-0 flex-row overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm"
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={(e: any) => {
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
                                                <div className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center gap-1 rounded-lg border border-[#E5E7EB] bg-slate-50/50 p-1">
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                      setExtractedTextFontSize(
                                                        Math.max(10, extractedTextFontSize - 2)
                                                      )
                                                    }
                                                    className="h-6 w-6 rounded-md p-0 text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm"
                                                    title="Decrease font size"
                                                  >
                                                    A-
                                                  </Button>
                                                  <span className="w-6 text-center text-xs font-semibold text-slate-600">
                                                    {extractedTextFontSize}
                                                  </span>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                      setExtractedTextFontSize(
                                                        Math.min(32, extractedTextFontSize + 2)
                                                      )
                                                    }
                                                    className="h-6 w-6 rounded-md p-0 text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm"
                                                    title="Increase font size"
                                                  >
                                                    A+
                                                  </Button>
                                                </div>
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
                                              className="h-full min-h-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent p-4 text-[#1F2933] focus-visible:ring-0 focus-visible:ring-offset-0"
                                              style={{ fontSize: `${extractedTextFontSize}px` }}
                                              disableAutoResize
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
                                      <div className="flex h-full min-h-0 flex-col rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
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
                                          {taskPciErrorHint && (
                                            <div className="mb-px rounded-md border border-rose-200 bg-rose-50 px-px py-px text-xs text-rose-700">
                                              PCI assistant error: {taskPciErrorHint}
                                            </div>
                                          )}
                                          <div className="mt-2 w-full rounded-2xl border border-cyan-300 bg-white/90 shadow-[0_0_15px_rgba(34,211,238,0.4)] backdrop-blur-md transition-all duration-300 focus-within:shadow-[0_0_25px_rgba(34,211,238,0.6)]">
                                            <div className="relative flex w-full flex-col p-px">
                                              <div className="flex w-full flex-col">
                                                <MentionTextarea
                                                  mentionItems={mentionItems}
                                                  placeholder="Ask the PCI assistant..."
                                                  className="min-h-[100px] w-full flex-1 border-0 bg-transparent px-4 py-4 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                                  value={activeTaskPciInput}
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
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 rounded-full bg-white text-xs font-medium text-gray-600 shadow-sm hover:text-gray-900"
                                                    onClick={() => {
                                                      const content = taskBuilder.activeExtensionId
                                                        ? taskBuilder.extensions.find(
                                                            e =>
                                                              e.id === taskBuilder.activeExtensionId
                                                          )?.content || taskBuilder.taskContent
                                                        : taskBuilder.taskContent

                                                      setTestPciScores({})
                                                      setTestPciInputs({
                                                        classroom: '',
                                                        student1: '',
                                                        student2: '',
                                                      })

                                                      setTestPciContent({
                                                        classroom: content,
                                                        student1: content,
                                                        student2: content,
                                                      })
                                                      setTestPciSource('task')
                                                      if (taskDmiVersions.length > 0) {
                                                        setTestPciViewMode(
                                                          `dmi_${taskDmiVersions[0].id}`
                                                        )
                                                      } else {
                                                        const hasDoc = !!(
                                                          currentTaskDocument ||
                                                          (taskBuilder as any).sourceDocument
                                                        )
                                                        setTestPciViewMode(hasDoc ? 'pdf' : 'text')
                                                      }
                                                      setTestPciActiveTab('classroom')
                                                      setMainTab('test-pci')
                                                      toast.success(
                                                        'Test PCI prefilled with task content'
                                                      )
                                                    }}
                                                  >
                                                    Test
                                                  </Button>
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 rounded-full bg-white text-xs font-medium text-gray-600 shadow-sm hover:text-gray-900"
                                                    onClick={() => {
                                                      toast.success('Task saved successfully')
                                                    }}
                                                  >
                                                    Save
                                                  </Button>
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
                                        className="relative flex h-full min-h-0 flex-row overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm"
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={(e: any) => {
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
                                                <div className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center gap-1 rounded-lg border border-[#E5E7EB] bg-slate-50/50 p-1">
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                      setExtractedTextFontSize(
                                                        Math.max(10, extractedTextFontSize - 2)
                                                      )
                                                    }
                                                    className="h-6 w-6 rounded-md p-0 text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm"
                                                    title="Decrease font size"
                                                  >
                                                    A-
                                                  </Button>
                                                  <span className="w-6 text-center text-xs font-semibold text-slate-600">
                                                    {extractedTextFontSize}
                                                  </span>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                      setExtractedTextFontSize(
                                                        Math.min(32, extractedTextFontSize + 2)
                                                      )
                                                    }
                                                    className="h-6 w-6 rounded-md p-0 text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm"
                                                    title="Increase font size"
                                                  >
                                                    A+
                                                  </Button>
                                                </div>
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
                                              className="h-full min-h-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent p-4 text-[#1F2933] focus-visible:ring-0 focus-visible:ring-offset-0"
                                              style={{ fontSize: `${extractedTextFontSize}px` }}
                                              disableAutoResize
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
                                              {assessmentSourceDocument?.mimeType ===
                                              'application/pdf' ? (
                                                <PDFViewer
                                                  key={assessmentSourceDocument.fileUrl}
                                                  fileUrl={assessmentSourceDocument.fileUrl}
                                                  className="absolute inset-0 h-full w-full"
                                                  defaultScale={0.75}
                                                  hidePageNavigation
                                                  onHidePreview={() => {
                                                    if (!assessmentTextVisible)
                                                      setAssessmentTextVisible(true)
                                                    setAssessmentPdfVisible(false)
                                                  }}
                                                />
                                              ) : assessmentSourceDocument &&
                                                assessmentSourceDocument.mimeType !==
                                                  'application/pdf' &&
                                                assessmentSourceDocument.mimeType.startsWith(
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
                                                      src={assessmentSourceDocument.fileUrl}
                                                      alt={assessmentSourceDocument.fileName}
                                                      fill
                                                      className="object-contain"
                                                      unoptimized
                                                    />
                                                  </div>
                                                </div>
                                              ) : assessmentSourceDocument &&
                                                assessmentSourceDocument.fileUrl ? (
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
                                                    href={assessmentSourceDocument.fileUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-center text-sm font-medium text-blue-600 hover:underline"
                                                  >
                                                    Open {assessmentSourceDocument.fileName} in new
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
                                      <div className="relative flex h-full min-h-0 flex-col rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
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
                                              disabled={dmiGenerating}
                                              onClick={() => {
                                                const content = assessmentBuilder.taskContent
                                                const hasPdf =
                                                  assessmentSourceDocument?.mimeType ===
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
                                          {(assessmentPciErrorHintMap[loadedAssessmentId || ''] ||
                                            '') && (
                                            <div className="mb-px rounded-md border border-rose-200 bg-rose-50 px-px py-px text-xs text-rose-700">
                                              PCI assistant error:{' '}
                                              {assessmentPciErrorHintMap[
                                                loadedAssessmentId || ''
                                              ] || ''}
                                            </div>
                                          )}
                                          <div className="mt-2 w-full rounded-2xl border border-cyan-300 bg-white/90 shadow-[0_0_15px_rgba(34,211,238,0.4)] backdrop-blur-md transition-all duration-300 focus-within:shadow-[0_0_25px_rgba(34,211,238,0.6)]">
                                            <div className="relative flex w-full flex-col p-px">
                                              <div className="flex w-full flex-col">
                                                <MentionTextarea
                                                  mentionItems={mentionItems}
                                                  placeholder="Ask the PCI assistant..."
                                                  className="min-h-[100px] w-full flex-1 border-0 bg-transparent px-4 py-4 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                                  value={
                                                    assessmentPciInputMap[
                                                      loadedAssessmentId || ''
                                                    ] || ''
                                                  }
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
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 rounded-full bg-white text-xs font-medium text-gray-600 shadow-sm hover:text-gray-900"
                                                    onClick={() => {
                                                      const content = assessmentBuilder.taskContent

                                                      setTestPciScores({})
                                                      setTestPciInputs({
                                                        classroom: '',
                                                        student1: '',
                                                        student2: '',
                                                      })

                                                      setTestPciContent({
                                                        classroom: content,
                                                        student1: content,
                                                        student2: content,
                                                      })
                                                      setTestPciSource('assessment')
                                                      if (assessmentDmiVersions.length > 0) {
                                                        setTestPciViewMode(
                                                          `dmi_${assessmentDmiVersions[0].id}`
                                                        )
                                                      } else {
                                                        const hasDoc = !!(assessmentBuilder as any)
                                                          .sourceDocument
                                                        setTestPciViewMode(hasDoc ? 'pdf' : 'text')
                                                      }
                                                      setTestPciActiveTab('classroom')
                                                      setMainTab('test-pci')
                                                      toast.success(
                                                        'Test PCI prefilled with assessment content'
                                                      )
                                                    }}
                                                  >
                                                    Test
                                                  </Button>
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 rounded-full bg-white text-xs font-medium text-gray-600 shadow-sm hover:text-gray-900"
                                                    onClick={() => {
                                                      toast.success('Assessment saved successfully')
                                                    }}
                                                  >
                                                    Save
                                                  </Button>
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
          <DialogContent
            theme="default"
            className="rounded-2xl border border-slate-400 bg-white/95 shadow-2xl backdrop-blur-md sm:max-w-md"
          >
            <DialogHeader>
              <DialogTitle>Import as...</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-4">
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
          <DialogContent
            theme="default"
            className="rounded-2xl border border-slate-400 bg-white/95 shadow-2xl backdrop-blur-md sm:max-w-md"
          >
            <DialogHeader>
              <DialogTitle>DMI Version History</DialogTitle>
              <DialogDescription>
                View and restore previous DMI versions for{' '}
                {mainBuilderTab === 'task' ? 'Task' : 'Assessment'}.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[400px] overflow-y-auto py-4">
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
                        className="hover:bg-muted/50 flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Version {version.versionNumber}</span>
                            <span className="text-muted-foreground text-xs">
                              {new Date(version.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {version.items.length} question{version.items.length !== 1 ? 's' : ''}
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
                            onClick={() => handleLoadDmiVersion(version, mainBuilderTab)}
                          >
                            Load
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive h-8 w-8"
                            onClick={() => handleDeleteDmiVersion(version.id, mainBuilderTab)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDmiVersionList(false)}>
                Close
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
          <DialogContent
            theme="default"
            className="rounded-2xl border border-slate-400 bg-white/95 shadow-2xl backdrop-blur-md sm:max-w-lg"
          >
            <DialogHeader>
              <DialogTitle>DMI Preview — Version {previewDmiVersion?.versionNumber}</DialogTitle>
              <DialogDescription>
                {previewDmiVersion?.items.length} question
                {previewDmiVersion?.items.length !== 1 ? 's' : ''} ·{' '}
                {previewDmiVersion
                  ? new Date(previewDmiVersion.createdAt).toLocaleDateString()
                  : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[500px] overflow-y-auto py-4">
              {!previewDmiVersion || previewDmiVersion.items.length === 0 ? (
                <div className="text-muted-foreground py-6 text-center text-sm">
                  No questions in this version.
                </div>
              ) : (
                <div className="space-y-4">
                  {previewDmiVersion.items.map((item, idx) => (
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
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  if (previewDmiVersion) {
                    handleLoadDmiVersion(previewDmiVersion, mainBuilderTab)
                  }
                  setPreviewDmiVersion(null)
                }}
              >
                Load This Version
              </Button>
              <Button variant="outline" onClick={() => setPreviewDmiVersion(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PPT Upload Options Dialog */}
        <Dialog
          open={pptUploadDialog.isOpen}
          onOpenChange={open => {
            if (!open) setPptUploadDialog({ isOpen: false, file: null, target: null })
          }}
        >
          <DialogContent
            theme="default"
            className="rounded-2xl border border-slate-400 bg-white/95 shadow-2xl backdrop-blur-md sm:max-w-md"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-orange-500" />
                PowerPoint Upload Options
              </DialogTitle>
              <DialogDescription>
                How would you like to use &quot;{pptUploadDialog.file?.name}&quot;?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
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
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setPptUploadDialog({ isOpen: false, file: null, target: null })}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Coming Soon Dialog */}
        <Dialog open={comingSoonDialog} onOpenChange={setComingSoonDialog}>
          <DialogContent className="rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Coming Soon!</DialogTitle>
              <DialogDescription>
                The Go Live feature is currently under development. Stay tuned!
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setComingSoonDialog(false)}>
                Close
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
                variant="outline"
                className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
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
