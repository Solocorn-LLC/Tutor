import type { LiveTask } from '@/lib/socket'
import type { LiveStudent, EngagementMetrics } from '@/types/live-session'

// ============================================
// HIERARCHICAL STRUCTURE TYPES
// ============================================

export interface Video {
  id: string
  title: string
  url: string
  duration: number
  thumbnail?: string
}

export interface Image {
  id: string
  title: string
  url: string
  alt?: string
}

export interface Document {
  id: string
  title: string
  url: string
  type: 'pdf' | 'doc' | 'ppt' | 'other'
}

export interface ImportedLearningResource {
  fileName: string
  mimeType: string
  fileUrl: string
  extractedText?: string
  uploadedAt: string
}

export interface VisibleDocumentPayload {
  id: string
  title: string
  description?: string
  content?: string
  itemType: 'task' | 'homework' | 'nodeQuiz' | 'lesson' | 'node'
  type?: 'task' | 'homework' | 'nodeQuiz' | 'lesson' | 'node'
  sourceDocument?: ImportedLearningResource
  questions?: QuizQuestion[]
}

export interface BuilderModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: any) => void
  initialData?: any
}

export interface BuilderModalWithNodesProps extends BuilderModalProps {
  nodes?: CourseBuilderNode[]
}

export interface DMIQuestion {
  id: string
  questionNumber: number
  questionText: string
  answer: string
}

export interface DMIVersion {
  id: string
  versionNumber: number
  items: DMIQuestion[]
  createdAt: number
  taskId?: string
  assessmentId?: string
}

export interface Task extends WithDifficultyVariants {
  id: string
  title: string
  shortDescription?: string
  description: string
  instructions: string
  extensions?: Array<{
    id: string
    name: string
    description?: string
    content: string
    pci: string
  }>
  dmiItems?: DMIQuestion[]
  dmiVersions?: DMIVersion[]
  activeDmiVersionId?: string
  estimatedMinutes: number
  points: number
  submissionType: 'text' | 'file' | 'link' | 'none' | 'questions'
  isAiGraded: boolean
  rubric?: string
  /** @protected Instructor-only answer key */
  answerKey?: string
  /** @protected Whether answer key is encrypted/protected */
  answerKeyProtected?: boolean
  /** Questions for question-based tasks */
  questions?: QuizQuestion[]
  /** Whether questions are randomized */
  randomizeQuestions?: boolean
  /** When false, not visible to students (draft) */
  isPublished?: boolean
  sourceDocument?: ImportedLearningResource
}

export interface Assessment extends WithDifficultyVariants {
  id: string
  title: string
  description: string
  instructions: string
  dmiItems?: DMIQuestion[]
  dmiVersions?: DMIVersion[]
  activeDmiVersionId?: string
  category?: 'assessment' | 'homework'
  difficulty?: string
  dueDate?: string
  estimatedMinutes: number
  points: number
  submissionType: 'text' | 'file' | 'link' | 'multiple' | 'questions'
  isAiGraded?: boolean
  allowLateSubmission: boolean
  latePenalty?: number
  /** @protected Instructor-only answer key */
  answerKey?: string
  /** @protected Whether answer key is encrypted/protected */
  answerKeyProtected?: boolean
  /** Questions for question-based homework */
  questions?: QuizQuestion[]
  /** Whether questions are randomized */
  randomizeQuestions?: boolean
  /** Time limit for completion (optional) */
  timeLimit?: number
  enforceTimeLimit?: boolean
  enforceDueDate?: boolean
  attemptsAllowed?: number
  maxAttempts?: number
  passingScore?: number
  showCorrectAnswers?: boolean
  answersNeverVisible?: boolean
  /** When false, not visible to students (draft) */
  isPublished?: boolean
  sourceDocument?: ImportedLearningResource
}

export interface QuizQuestion {
  id: string
  type: 'mcq' | 'truefalse' | 'shortanswer' | 'essay' | 'multiselect' | 'matching' | 'fillblank'
  question: string
  options?: string[]
  correctAnswer?: string | string[]
  points: number
  explanation?: string
  matchingPairs?: Array<{ left: string; right: string }>
  extendEnabled?: boolean
  source?: 'task' | 'assessment' | 'homework'
}

export interface Quiz extends WithDifficultyVariants {
  id: string
  title: string
  description: string
  timeLimit?: number
  attemptsAllowed: number
  questions: QuizQuestion[]
  passingScore?: number
  showCorrectAnswers: boolean
  randomizeQuestions: boolean
  /** @protected When true, correct answers are never shown to students */
  answersNeverVisible?: boolean
  /** When false, not visible to students (draft) */
  isPublished?: boolean
  sourceDocument?: ImportedLearningResource
  /** Allow late submissions */
  allowLateSubmission?: boolean
  /** Late penalty percentage */
  latePenalty?: number
  /** @protected Instructor-only answer key */
  answerKey?: string
  /** @protected Whether answer key is encrypted/protected */
  answerKeyProtected?: boolean
}

export interface Content {
  id: string
  title: string
  type: 'text' | 'video' | 'audio' | 'interactive' | 'embed'
  body?: string
  url?: string
  duration?: number
  order: number
  sourceDocument?: ImportedLearningResource
}

// ============================================
// DIFFICULTY & ADAPTIVE CONTENT TYPES
// ============================================

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced'

export type DifficultyMode = 'fixed' | 'adaptive' | 'all'

/** Partial variant for a specific difficulty level */
export interface DifficultyVariant {
  title?: string
  description?: string
  duration?: number
  instructions?: string
  points?: number
  /** Whether this variant is enabled */
  enabled?: boolean
}

/** Mixin for content that supports difficulty variants */
export interface WithDifficultyVariants {
  /** How this content handles difficulty levels */
  difficultyMode: DifficultyMode
  /** Fixed difficulty level (when mode is 'fixed') */
  fixedDifficulty?: DifficultyLevel
  /** Difficulty-specific overrides (when mode is 'adaptive') */
  variants?: {
    beginner?: DifficultyVariant
    intermediate?: DifficultyVariant
    advanced?: DifficultyVariant
  }
}

export interface Lesson extends WithDifficultyVariants {
  id: string
  title: string
  description?: string
  /** Optional section descriptions for course builder UI */
  taskSectionDescription?: string
  assessmentSectionDescription?: string
  homeworkSectionDescription?: string
  duration: number
  order: number
  isPublished: boolean
  media: {
    videos: Video[]
    images: Image[]
  }
  docs: Document[]
  content: Content[]
  /** Task folder - contains tasks with extensions */
  tasks: Task[]
  /** Assessment folder - contains assessments with DMIs */
  assessments: Assessment[]
  /** Homework folder - contains homework items */
  homework: Assessment[]
  worksheets?: any[]
}

export interface CourseBuilderNodeQuiz extends Quiz, WithDifficultyVariants {
  coverage: 'all_lessons' | 'selected_lessons'
  coveredLessonIds?: string[]
}

export interface CourseBuilderNode extends WithDifficultyVariants {
  id: string
  title: string
  description?: string
  order: number
  isPublished: boolean
  lessons: Lesson[]
  quizzes: CourseBuilderNodeQuiz[]
}

/** Worksheet type for legacy compatibility */
export interface Worksheet {
  id: string
  title: string
  description?: string
  questions: QuizQuestion[]
  isPublished?: boolean
}

// ============================================
// PROPS
// ============================================

export interface InsightsSessionOption {
  id: string
  title: string
  subject: string
  scheduledAt: string
  status: string
}

export interface CourseBuilderInsightsProps {
  courseId?: string | null
  courses?: Array<{ id: string; name: string; categories?: string[]; isPublished?: boolean }>
  onCourseChange?: (courseId: string) => void
  sessionId: string | null
  sessions: InsightsSessionOption[]
  onSessionChange: (sessionId: string) => void
  onStartSession?: () => void
  liveTasks: LiveTask[]
  onDeployTask: (task: LiveTask) => void
  onSendPoll: (payload: { taskId: string; question: string }) => void
  onSendQuestion: (payload: { taskId: string; prompt: string }) => void
  students?: LiveStudent[]
  metrics?: EngagementMetrics | null
  classDuration?: number
  isRecording?: boolean
  recordingDuration?: number
  onToggleRecording?: () => void
  onEndSession?: () => void
  endingSession?: boolean
  socket?: any
  tutorId?: string
  studentBoards?: Record<string, { pages: unknown[]; pageIndex: number; updatedAt?: number }>
}

export interface CourseBuilderProps {
  courseId: string | null
  courseName?: string
  panelMode?: 'default' | 'live-class'
  initialLessons?: Lesson[]
  hideCourseNameInTabs?: boolean
  hideDirectorySearch?: boolean
  directoryMenusAlwaysVisible?: boolean
  onMakeVisibleToStudents?: (payload: VisibleDocumentPayload) => void
  onSave?: (
    lessons: Lesson[],
    options?: {
      developmentMode: 'single' | 'multi'
      previewDifficulty: 'all' | 'beginner' | 'intermediate' | 'advanced'
      courseName?: string
      courseDescription?: string
      isAutoSave?: boolean
      isLive?: boolean
    }
  ) => void
  insightsProps?: CourseBuilderInsightsProps
  isCollapsed?: boolean
  onMainTabChange?: (tab: 'live' | 'builder' | 'test-pci') => void
  initialMainTab?: 'live' | 'builder' | 'test-pci'
  leftPanelHidden?: boolean
  onLeftPanelHiddenChange?: (hidden: boolean) => void
  saveMode?: 'live' | 'draft'
  onSaveModeChange?: (mode: 'live' | 'draft') => void
  isStudentView?: boolean
  onSyncToLiveSession?: () => void
}

export interface CourseBuilderRef {
  save: () => void
  syncToLive?: () => void
  getLessons?: () => unknown[]
}
