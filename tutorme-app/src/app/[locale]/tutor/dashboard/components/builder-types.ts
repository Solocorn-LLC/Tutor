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
  fileKey?: string
  extractedText?: string
  uploadedAt: string
  /** True when this document was auto-generated from typed text rather than uploaded. */
  generatedFromText?: boolean
  /** Version of the snapshot generator that produced this document. Bumping it forces re-generation of older auto-snapshots. */
  snapshotVersion?: number
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
  /** The paper's real question reference (e.g. "1(a)", "3b"), preserved from the
   *  source. Shown instead of the re-serialized questionNumber when present, and
   *  used to match an uploaded marking scheme. */
  questionLabel?: string
  questionText: string
  answer: string
  /** Points this question is worth. Drives the auto-total and weighted grading;
   *  defaults to 1 when absent. */
  marks?: number
  /** All accepted answer forms beyond the canonical `answer` — alternative
   *  phrasings, equivalent values, units, spellings, or methods that earn full
   *  credit. Populated from a marking scheme. Tutor-only evaluation layer (a
   *  recognized stripped key) — never sent to students. */
  acceptableVariants?: string[]
  /** Marking guidance / model answer for open-ended items. For adaptive schemes
   *  this captures the award structure verbatim-faithfully (method marks, or
   *  holistic E/P/I band descriptors). Tutor-only — never sent to students. */
  rubric?: string
  /** Where the answer came from (ASMT-5). `answer_sheet_extracted` when filled
   *  from an uploaded marking scheme. Tutor-only evaluation layer. */
  answerProvenance?: 'tutor_provided' | 'answer_sheet_extracted' | 'llm_inferred' | 'tutor_edited'
  /** Which answer-input control the student sees (defaults to long answer). */
  questionType?: import('@/lib/assessment/question-types').DmiQuestionType
  /** Options for choice types (mcq / true_false / multiple_response). */
  options?: string[]
  /** Correct left↔right pairs for `matching` (the right values form the bank). */
  pairs?: import('@/lib/assessment/question-types').DmiMatchPair[]
  /** Image the student clicks for a `hotspot` item. */
  hotspotImageUrl?: string
  /** Correct clickable regions for `hotspot` (answer key, not shown to student). */
  regions?: import('@/lib/assessment/question-types').DmiHotspotRegion[]
  /** The paper section this question belongs to (e.g. "Section A"), when the
   *  paper is divided into sections (ASMT-4). Drives section grouping. */
  section?: string
  /** The expected response format, distinct from the input control `questionType`
   *  (e.g. "numeric", "explanation", "diagram"). Reserved (ASMT-4); populated by
   *  a later pass. */
  responseType?: string
  /** Source materials this question depends on — passage/figure/table refs
   *  (ASMT-4). Reserved; populated by a later pass. */
  sourceDependencies?: string[]
}

/** A section of an assessment paper (ASMT-4): a titled group of questions. */
export interface DMISection {
  id: string
  title: string
  /** Section-level instructions, when present on the paper. */
  instructions?: string
  /** Total marks for the section (sum of its questions). */
  marks?: number
  /** Ids of the DMIQuestions in this section, in paper order. */
  questionIds: string[]
}

export interface DMIVersion {
  id: string
  versionNumber: number
  items: DMIQuestion[]
  createdAt: number
  taskId?: string
  assessmentId?: string
  /** Examining body (e.g. "AP", "IB") and subject for this assessment. Defaults
   *  are derived from the course category; the tutor can override them, and a
   *  later per-paper detector will populate them. Drives marking-scheme handling
   *  that adapts to each board's standard. */
  examBody?: string
  subject?: string
  /** Section grouping derived from the questions' `section` tags (ASMT-4).
   *  Empty/absent when the paper has no sections. */
  sections?: DMISection[]
  /** Total marks across all questions (ASMT-4 metadata). */
  totalMarks?: number
}

export interface Task extends WithDifficultyVariants {
  id: string
  title: string
  shortDescription?: string
  description: string
  instructions: string
  /** Append-only audit log of PCI approvals (TASK-18). Each "Apply to PCI"
   *  records the transcript + approved text for auditability/versioning. */
  pciHistory?: import('@/lib/assessment/pci').PciAuditRecord[]
  /** Current approved structured PCI spec (TASK-6), when finalized. */
  pciSpec?: import('@/lib/assessment/pci-spec').PciSpec
  extensions?: Array<{
    id: string
    name: string
    description?: string
    content: string
    pci: string
    sourceDocument?: ImportedLearningResource
  }>
  dmiItems?: DMIQuestion[]
  dmiVersions?: DMIVersion[]
  activeDmiVersionId?: string
  /** How the DMI was sourced — persisted so the PCI-chat study-material variant
   *  works for a returning tutor (not just in the DMI-generation session). */
  documentKind?: 'question_paper' | 'study_material'
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
  /** Current approved structured PCI spec (TASK-6), when finalized. Persisted at
   *  deploy to BuilderTask.pciSpec so the grader can use the same structured
   *  marking policy tasks already get. */
  pciSpec?: import('@/lib/assessment/pci-spec').PciSpec
  dmiItems?: DMIQuestion[]
  dmiVersions?: DMIVersion[]
  activeDmiVersionId?: string
  /** How the DMI was sourced — persisted so the PCI-chat study-material variant
   *  works for a returning tutor (not just in the DMI-generation session). */
  documentKind?: 'question_paper' | 'study_material'
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
  durationMinutes?: number
}

export interface CourseBuilderInsightsProps {
  courseId?: string | null
  /** Enable the debounced course auto-save even in insights mode (used by the
   *  in-session Edit-course modal so edits persist without a Save click). */
  autoSave?: boolean
  courses?: Array<{ id: string; name: string; categories?: string[]; isPublished?: boolean }>
  /** Local drafts (not yet published). Carries the category chosen at creation
   *  so the builder can resolve Board/Subject before the course is published. */
  draftCourses?: Array<{ id: string; name: string; categories?: string[] }>
  onCourseChange?: (courseId: string) => void
  sessionId: string | null
  sessions: InsightsSessionOption[]
  onSessionChange: (sessionId: string) => void
  onStartSession?: () => void
  liveTasks: LiveTask[]
  /** In-session task/assessment completions (with answers) for the Submissions tab. */
  liveSubmissions?: {
    taskId: string
    studentId: string
    studentName?: string
    submittedAt: string | number
    answers?: Record<string, string>
  }[]
  /** Present only inside a live session; deploy buttons hide when undefined. */
  onDeployTask?: (task: LiveTask) => void
  onSendPoll: (payload: { taskId: string; question: string; options?: string[] }) => void
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
  /** Live socket connection state, so the classroom WiFi indicator reflects the
   *  real connection instead of merely whether a session exists. */
  isConnected?: boolean
  tutorId?: string
  tutorName?: string
  studentBoards?: Record<string, { pages: unknown[]; pageIndex: number; updatedAt?: number }>
}

export interface CourseBuilderProps {
  courseId: string | null
  courseName?: string
  courseDescription?: string
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
  mainTab?: 'live' | 'builder' | 'test-pci'
  leftPanelHidden?: boolean
  onLeftPanelHiddenChange?: (hidden: boolean) => void
  saveMode?: 'live' | 'draft'
  onSaveModeChange?: (mode: 'live' | 'draft') => void
  isStudentView?: boolean
  onSyncToLiveSession?: (silent?: boolean) => void
  onUnsyncedChangesChange?: (hasUnsynced: boolean) => void
  /**
   * When a live session is opened with an assigned lesson, expand and scroll to
   * that lesson once on mount. Value is the lesson id (courseLesson.lessonId).
   */
  focusLessonId?: string | null
}

export interface CourseBuilderRef {
  save: () => void
  syncToLive?: () => void
  getLessons?: () => unknown[]
  saveAll?: (isAuto?: boolean) => void
  openVideo?: () => void
  triggerSync?: () => void
}
