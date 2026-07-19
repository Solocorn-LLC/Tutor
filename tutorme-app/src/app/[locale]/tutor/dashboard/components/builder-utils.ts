import {
  Plus,
  Trash2,
  Copy,
  FileText,
  Video as VideoIcon,
  ImageIcon,
  FileQuestion,
  ChevronRight,
  ChevronDown,
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
  LayoutTemplate,
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
} from 'lucide-react'
import {
  type QuizQuestion,
  type Task,
  type Assessment,
  type CourseBuilderNode,
  type Lesson,
  type Quiz,
  type CourseBuilderNodeQuiz,
  type Content,
  type ImportedLearningResource,
} from './builder-types'

export const generateId = () => crypto.randomUUID()

/**
 * Deep-clone a sourceDocument so that cloned/duplicated tasks and assessments
 * each own an independent copy. Prevents mutations (e.g. replacing the file)
 * on one item from affecting its siblings.
 */
export function deepCloneSourceDocument(
  doc: ImportedLearningResource | undefined
): ImportedLearningResource | undefined {
  if (!doc) return undefined
  return {
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileUrl: doc.fileUrl,
    fileKey: doc.fileKey,
    extractedText: doc.extractedText,
    uploadedAt: doc.uploadedAt,
  }
}

export const AI_SUGGESTIONS = [
  {
    id: 1,
    type: 'content',
    title: 'Add prerequisites section',
    description: 'Students often struggle without reviewing basics first',
    icon: Lightbulb,
  },
  {
    id: 2,
    type: 'quiz',
    title: 'Add checkpoint quiz',
    description: 'Insert a 5-question quiz after this lesson',
    icon: FileQuestion,
  },
  {
    id: 3,
    type: 'video',
    title: 'Replace with video',
    description: 'Convert this text section to a 5-min video',
    icon: VideoIcon,
  },
  {
    id: 4,
    type: 'activity',
    title: 'Add group activity',
    description: 'Collaborative exercise for peer learning',
    icon: Users,
  },
  {
    id: 5,
    type: 'assessment',
    title: 'Add practice problems',
    description: '3 similar problems with varying difficulty',
    icon: PenTool,
  },
]

export const CONTENT_TEMPLATES = [
  {
    id: 'lesson-standard',
    name: 'Standard Lesson',
    category: 'lesson',
    description: 'Title, content, and summary format',
    icon: BookOpen,
  },
  {
    id: 'lesson-video',
    name: 'Video Lesson',
    category: 'lesson',
    description: 'Video-based lesson with discussion questions',
    icon: VideoIcon,
  },
  {
    id: 'quiz-mcq',
    name: 'Multiple Choice Quiz',
    category: 'quiz',
    description: 'Standard multiple choice assessment',
    icon: FileQuestion,
  },
  {
    id: 'activity-interactive',
    name: 'Interactive Activity',
    category: 'activity',
    description: 'Drag-drop or interactive exercise',
    icon: Gamepad2,
  },
  {
    id: 'assessment-project',
    name: 'Project Assignment',
    category: 'assessment',
    description: 'Long-form project with rubric',
    icon: PenTool,
  },
  {
    id: 'lesson-flipped',
    name: 'Flipped Classroom',
    category: 'lesson',
    description: 'Pre-work video + in-class activity',
    icon: MonitorPlay,
  },
]

export const DEFAULT_CONTENT = (order: number): Content => ({
  id: `content-${generateId()}`,
  title: `Content ${order + 1}`,
  type: 'text',
  body: '',
  order,
})

export const DEFAULT_LESSON = (order: number): Lesson => ({
  id: `lesson-${generateId()}`,
  title: `Lesson ${order + 1}`,
  description: '',
  duration: 45,
  order,
  isPublished: false,
  media: { videos: [], images: [] },
  docs: [],
  content: [],
  tasks: [],
  assessments: [],
  homework: [],
  worksheets: [],
  difficultyMode: 'all',
  variants: {},
})

export const DEFAULT_TASK = (order: number): Task => ({
  id: `task-${generateId()}`,
  title: `Task ${order + 1}`,
  shortDescription: '',
  description: '',
  instructions: '',
  extensions: [],
  estimatedMinutes: 15,
  points: 10,
  submissionType: 'text',
  isAiGraded: false,
  answerKey: '',
  answerKeyProtected: true,
  questions: [],
  randomizeQuestions: false,
  difficultyMode: 'all',
  variants: {},
  isPublished: false,
})

export const DEFAULT_HOMEWORK = (
  order: number,
  category: 'assessment' | 'homework' = 'assessment'
): Assessment => ({
  id: `homework-${generateId()}`,
  title: category === 'homework' ? `Homework ${order + 1}` : `Assessment ${order + 1}`,
  description: '',
  instructions: '',
  category,
  estimatedMinutes: 30,
  points: 20,
  submissionType: 'file',
  isAiGraded: false,
  allowLateSubmission: true,
  questions: [],
  randomizeQuestions: false,
  timeLimit: undefined,
  attemptsAllowed: 1,
  passingScore: 70,
  showCorrectAnswers: true,
  answersNeverVisible: false,
  latePenalty: 10,
  answerKey: '',
  answerKeyProtected: true,
  difficultyMode: 'all',
  variants: {},
  isPublished: false,
})

export const DEFAULT_QUIZ = (order: number): Quiz => ({
  id: `quiz-${generateId()}`,
  title: `Quiz ${order + 1}`,
  description: '',
  attemptsAllowed: 1,
  questions: [],
  passingScore: 70,
  showCorrectAnswers: true,
  randomizeQuestions: false,
  answersNeverVisible: false,
  difficultyMode: 'all',
  variants: {},
  isPublished: false,
  allowLateSubmission: true,
  latePenalty: 0,
  answerKey: '',
  answerKeyProtected: true,
})

export const DEFAULT_NODE_QUIZ = (order: number): CourseBuilderNodeQuiz => ({
  ...DEFAULT_QUIZ(order),
  coverage: 'all_lessons',
})

export const DEFAULT_NODE = (order: number): CourseBuilderNode => ({
  id: `node-${generateId()}`,
  title: `Lesson ${order + 1}`,
  description: '',
  order,
  isPublished: false,
  lessons: [DEFAULT_LESSON(0)],
  quizzes: [],
  difficultyMode: 'all',
  variants: {},
})

export function convertQuizToAssessment(quiz: Quiz): Assessment {
  return {
    id: `homework-${generateId()}`,
    title: quiz.title?.replace(/quiz/gi, 'Assessment') || 'Assessment',
    description: quiz.description || '',
    instructions: quiz.description || '',
    category: 'assessment',
    estimatedMinutes: quiz.timeLimit ?? 30,
    points: quiz.questions?.reduce((sum, q) => sum + (q.points || 1), 0) || 20,
    submissionType: 'questions',
    allowLateSubmission: true,
    latePenalty: 0,
    questions: quiz.questions || [],
    randomizeQuestions: quiz.randomizeQuestions || false,
    timeLimit: quiz.timeLimit,
    attemptsAllowed: quiz.attemptsAllowed || 1,
    passingScore: quiz.passingScore,
    showCorrectAnswers: quiz.showCorrectAnswers ?? true,
    answersNeverVisible: quiz.answersNeverVisible ?? false,
    answerKey: '',
    answerKeyProtected: true,
    difficultyMode: quiz.difficultyMode ?? 'all',
    variants: quiz.variants ?? {},
    isPublished: quiz.isPublished ?? false,
    sourceDocument: quiz.sourceDocument,
  }
}

/**
 * Generate a PDF question paper from questions using jsPDF
 */
export async function generateQuestionPaperPDF(
  title: string,
  description: string,
  questions: QuizQuestion[]
): Promise<{ blob: Blob; url: string; fileName: string }> {
  // Dynamic import jsPDF to avoid SSR issues and to get the correct default
  // export in both dev and production builds.
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()

  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  let y = 20

  // Title
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(title.toUpperCase(), pageWidth / 2, y, { align: 'center' })
  y += 12

  // Line under title
  doc.setDrawColor(0)
  doc.line(margin, y, pageWidth - margin, y)
  y += 10

  // Instructions
  if (description) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('INSTRUCTIONS:', margin, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    const descLines = doc.splitTextToSize(description, contentWidth)
    doc.text(descLines, margin, y)
    y += descLines.length * 5 + 8
  }

  // Summary box
  doc.setFillColor(240, 240, 240)
  doc.rect(margin, y - 5, contentWidth, 15, 'F')
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0)
  doc.text(
    `Total Questions: ${questions.length}    |    Total Points: ${totalPoints}`,
    margin + 5,
    y + 5
  )
  y += 20

  // Questions
  questions.forEach((q, idx) => {
    // Check for page break
    if (y > 260) {
      doc.addPage()
      y = 20
    }

    // Question header
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(`Question ${idx + 1}`, margin, y)

    // Points badge
    doc.setFillColor(230, 230, 230)
    doc.rect(pageWidth - margin - 30, y - 5, 30, 8, 'F')
    doc.setFontSize(9)
    doc.text(`${q.points || 1} pt${q.points !== 1 ? 's' : ''}`, pageWidth - margin - 15, y, {
      align: 'center',
    })
    y += 8

    // Question text
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const questionLines = doc.splitTextToSize(q.question, contentWidth)
    doc.text(questionLines, margin, y)
    y += questionLines.length * 5 + 6

    // Options for MCQ/Multi-select
    if (q.options && q.options.length > 0) {
      q.options.forEach((opt, optIdx) => {
        if (y > 270) {
          doc.addPage()
          y = 20
        }
        const letter = String.fromCharCode(65 + optIdx)
        doc.setFontSize(10)
        doc.text(`    ${letter}. ${opt}`, margin, y)
        y += 6
      })
      y += 4
    }

    // True/False
    if (q.type === 'truefalse') {
      doc.text('    [  ] True', margin + 5, y)
      y += 6
      doc.text('    [  ] False', margin + 5, y)
      y += 10
    }

    // Fill in blank
    if (q.type === 'fillblank') {
      doc.setDrawColor(180)
      doc.line(margin + 5, y, margin + 100, y)
      y += 10
    }

    // Short answer
    if (q.type === 'shortanswer') {
      doc.setDrawColor(180)
      doc.line(margin + 5, y, pageWidth - margin, y)
      y += 12
    }

    // Essay
    if (q.type === 'essay') {
      doc.setDrawColor(180)
      for (let i = 0; i < 4; i++) {
        doc.line(margin + 5, y + i * 8, pageWidth - margin, y + i * 8)
      }
      y += 40
    }

    y += 8
  })

  // Footer
  const totalPages = (doc.internal as any).getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(128)
    doc.text(`Page ${i} of ${totalPages}  |  ${title}`, pageWidth / 2, 285, { align: 'center' })
  }

  const pdfBlob = doc.output('blob')
  const pdfUrl = URL.createObjectURL(pdfBlob)
  const fileName = `${title.replace(/[^a-z0-9]/gi, '_')}_Question_Paper.pdf`

  return { blob: pdfBlob, url: pdfUrl, fileName }
}

/**
 * Generate a simple PDF from a task's typed content so that text-only
 * tasks can be previewed and deployed exactly like uploaded PDF documents.
 *
 * Uses html2canvas to rasterise the text as an image inside the PDF. This avoids
 * font/encoding limitations and gives us full browser language support (CJK,
 * Arabic, Devanagari, emojis, etc.) without bundling huge font files.
 *
 * The PDF page is a landscape snapshot of the Task Slide viewport: a plain white
 * document showing the task content as it appears in the slide. It does not
 * include the task number/title card or the purple branding. The height expands
 * only if the content exceeds the default viewport height.
 */
export async function generateTaskTextPDF(
  title: string,
  content: string
): Promise<{ blob: Blob; fileName: string }> {
  if (typeof document === 'undefined') {
    throw new Error('generateTaskTextPDF must be called in a browser')
  }

  const { default: jsPDF } = await import('jspdf')
  const html2canvas = (await import('html2canvas')).default

  const VIEWPORT_WIDTH = 1100
  const VIEWPORT_MIN_HEIGHT = 620

  // Off-screen landscape slide viewport that mirrors the Task Slide display area.
  const viewport = document.createElement('div')
  viewport.style.position = 'fixed'
  viewport.style.left = '-9999px'
  viewport.style.top = '-9999px'
  viewport.style.width = `${VIEWPORT_WIDTH}px`
  viewport.style.minHeight = `${VIEWPORT_MIN_HEIGHT}px`
  viewport.style.padding = '48px'
  viewport.style.background = '#ffffff'
  viewport.style.color = '#1F2933'
  viewport.style.border = '1px solid #E5E7EB'
  viewport.style.fontFamily =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif'
  viewport.style.fontSize = '20px'
  viewport.style.lineHeight = '1.6'
  viewport.style.whiteSpace = 'pre-wrap'
  viewport.style.wordBreak = 'break-word'
  viewport.style.boxSizing = 'border-box'
  viewport.style.overflow = 'hidden'
  viewport.setAttribute('dir', 'auto')
  viewport.textContent = content.trim()

  document.body.appendChild(viewport)

  try {
    const canvas = await html2canvas(viewport, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    })

    const viewportCssWidth = viewport.scrollWidth
    const viewportCssHeight = viewport.scrollHeight
    // 1 CSS px = 0.75 pt (72 pt / 96 dpi)
    const ptWidth = viewportCssWidth * 0.75
    const ptHeight = viewportCssHeight * 0.75

    const doc = new jsPDF({ unit: 'pt', format: [ptWidth, ptHeight] })
    const imgData = canvas.toDataURL('image/png')
    doc.addImage(imgData, 'PNG', 0, 0, ptWidth, ptHeight)

    const safeTitle = title.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'Task'
    return { blob: doc.output('blob'), fileName: `${safeTitle}.pdf` }
  } finally {
    if (viewport.parentNode) {
      document.body.removeChild(viewport)
    }
  }
}

export function resolveSelectedItem(
  selectedItem: { type: string; id: string } | null,
  nodes: CourseBuilderNode[]
): {
  item: Task | Assessment | CourseBuilderNodeQuiz | Lesson | CourseBuilderNode
  nodeId: string
  lessonId?: string
} | null {
  if (!selectedItem) return null
  for (const mod of nodes) {
    if (selectedItem.type === 'node' && mod.id === selectedItem.id) {
      return { item: mod, nodeId: mod.id }
    }
    if (selectedItem.type === 'nodeQuiz') {
      const quiz = mod.quizzes?.find(q => q.id === selectedItem.id)
      if (quiz) return { item: quiz, nodeId: mod.id }
    }
    for (const lesson of mod.lessons) {
      if (selectedItem.type === 'lesson' && lesson.id === selectedItem.id) {
        return { item: lesson, nodeId: mod.id, lessonId: lesson.id }
      }
      if (selectedItem.type === 'task') {
        const task = lesson.tasks?.find(t => t.id === selectedItem.id)
        if (task) return { item: task, nodeId: mod.id, lessonId: lesson.id }
      }
      if (selectedItem.type === 'homework') {
        const hw = lesson.homework?.find(h => h.id === selectedItem.id)
        if (hw) return { item: hw, nodeId: mod.id, lessonId: lesson.id }
      }
    }
  }
  return null
}

export function normalizeCourseBuilderNodesForAssessments(
  rawCourseBuilderNodes: CourseBuilderNode[]
): CourseBuilderNode[] {
  return rawCourseBuilderNodes.map(mod => ({
    ...mod,
    lessons: (mod.lessons && mod.lessons.length > 0 ? mod.lessons : [DEFAULT_LESSON(0)]).map(
      lesson => {
        const existingAssessments = lesson.homework || []
        // Legacy migration: quizzes were migrated to homework (assessments)
        const legacyQuizzes = (lesson as any).quizzes || []
        const migratedAssessments = legacyQuizzes.map(convertQuizToAssessment)
        return {
          ...lesson,
          homework: [...existingAssessments, ...migratedAssessments],
        }
      }
    ),
  }))
}

export function normalizeGeneratedQuestionType(rawType: unknown): QuizQuestion['type'] {
  const type = typeof rawType === 'string' ? rawType.trim().toLowerCase() : ''
  if (type === 'mcq' || type === 'multiple_choice') return 'mcq'
  if (type === 'multiselect' || type === 'multi_select') return 'multiselect'
  if (type === 'truefalse' || type === 'true_false') return 'truefalse'
  if (type === 'matching') return 'matching'
  if (type === 'fillblank' || type === 'fill_in_blank') return 'fillblank'
  if (type === 'shortanswer' || type === 'short_answer') return 'shortanswer'
  return 'essay'
}

export function mapGeneratedCourseBuilderNodesToBuilder(
  rawCourseBuilderNodes: unknown[]
): CourseBuilderNode[] {
  if (!Array.isArray(rawCourseBuilderNodes)) return []

  return rawCourseBuilderNodes.map((rawCourseBuilderNode, nodeIdx) => {
    const nodeObj = (rawCourseBuilderNode ?? {}) as Record<string, any>
    const rawLessons = Array.isArray(nodeObj.lessons) ? nodeObj.lessons : []
    const rawExam = nodeObj.exam && typeof nodeObj.exam === 'object' ? nodeObj.exam : null

    return {
      ...DEFAULT_NODE(nodeIdx),
      title: String(nodeObj.title || `Lesson ${nodeIdx + 1}`),
      description: String(nodeObj.description || ''),
      lessons: rawLessons.map((rawLesson: Record<string, any>, lessonIdx: number) => {
        const tasks = Array.isArray(rawLesson.tasks) ? rawLesson.tasks : []
        const assessments = Array.isArray(rawLesson.assessments) ? rawLesson.assessments : []
        const mapQuestions = (rawQuestions: unknown[]): QuizQuestion[] =>
          (Array.isArray(rawQuestions) ? rawQuestions : []).map(
            (rawQuestion: unknown, questionIdx: number) => {
              const questionObj = (rawQuestion ?? {}) as Record<string, any>
              const qType = normalizeGeneratedQuestionType(questionObj.type)
              return {
                id: `q-${generateId()}`,
                type: qType,
                question: String(questionObj.question || `Question ${questionIdx + 1}`),
                options:
                  qType === 'mcq' || qType === 'multiselect'
                    ? Array.isArray(questionObj.options) && questionObj.options.length > 0
                      ? questionObj.options.map((opt: unknown) => String(opt))
                      : ['', '', '', '']
                    : qType === 'truefalse'
                      ? ['True', 'False']
                      : undefined,
                correctAnswer: questionObj.correctAnswer as string | string[] | undefined,
                points: Math.max(1, Number(questionObj.points) || 1),
                explanation:
                  typeof questionObj.explanation === 'string' ? questionObj.explanation : '',
              }
            }
          )

        return {
          ...DEFAULT_LESSON(lessonIdx),
          title: String(rawLesson.title || `Lesson ${lessonIdx + 1}`),
          description: String(rawLesson.description || ''),
          duration: Math.max(15, Number(rawLesson.duration) || 45),
          tasks: tasks.map((task: Record<string, any>, taskIdx: number) => ({
            ...DEFAULT_TASK(taskIdx),
            title: String(task.title || `Task ${taskIdx + 1}`),
            description: String(task.description || ''),
            instructions: String(task.instructions || ''),
            estimatedMinutes: Math.max(5, Number(task.estimatedMinutes) || 15),
            points: Math.max(1, Number(task.points) || 10),
            submissionType:
              Array.isArray(task.questions) && task.questions.length > 0 ? 'questions' : 'text',
            questions: mapQuestions(Array.isArray(task.questions) ? task.questions : []),
          })),
          homework: assessments.map((assessment: Record<string, any>, assessmentIdx: number) => ({
            ...DEFAULT_HOMEWORK(assessmentIdx),
            title: String(assessment.title || `Assessment ${assessmentIdx + 1}`),
            description: String(assessment.description || ''),
            instructions: String(assessment.instructions || ''),
            estimatedMinutes: Math.max(10, Number(assessment.estimatedMinutes) || 30),
            points: Math.max(1, Number(assessment.points) || 20),
            submissionType:
              Array.isArray(assessment.questions) && assessment.questions.length > 0
                ? 'questions'
                : 'text',
            questions: mapQuestions(
              Array.isArray(assessment.questions) ? assessment.questions : []
            ),
          })),
        }
      }),
      quizzes: rawExam
        ? [
            {
              ...DEFAULT_NODE_QUIZ(0),
              title: String(rawExam.title || `Lesson ${nodeIdx + 1} Exam`),
              description: String(rawExam.description || ''),
              questions: (Array.isArray(rawExam.questions) ? rawExam.questions : []).map(
                (rawQuestion: unknown, questionIdx: number) => {
                  const questionObj = (rawQuestion ?? {}) as Record<string, any>
                  const qType = normalizeGeneratedQuestionType(questionObj.type)
                  return {
                    id: `q-${generateId()}`,
                    type: qType,
                    question: String(questionObj.question || `Question ${questionIdx + 1}`),
                    options:
                      qType === 'mcq' || qType === 'multiselect'
                        ? Array.isArray(questionObj.options) && questionObj.options.length > 0
                          ? questionObj.options.map((opt: unknown) => String(opt))
                          : ['', '', '', '']
                        : qType === 'truefalse'
                          ? ['True', 'False']
                          : undefined,
                    correctAnswer: questionObj.correctAnswer as string | string[] | undefined,
                    points: Math.max(1, Number(questionObj.points) || 1),
                    explanation:
                      typeof questionObj.explanation === 'string' ? questionObj.explanation : '',
                  }
                }
              ),
            },
          ]
        : [],
    }
  })
}

// Generate a consistent color from a string (for avatars)
export function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase()
  return '#' + '00000'.substring(0, 6 - c.length) + c
}

// Format seconds as MM:SS
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
