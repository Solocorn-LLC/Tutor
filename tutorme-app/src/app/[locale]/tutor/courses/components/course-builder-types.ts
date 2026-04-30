import type { LiveTask } from '@/lib/socket'
import type { LiveStudent, EngagementMetrics } from '@/types/live-session'

export interface BatchItem {
  id: string
  name: string
  startDate: string | null
  order: number
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  languageOfInstruction?: string | null
  price?: number | null
  currency?: string | null
  schedule: Array<{ dayOfWeek: string; startTime: string; durationMinutes: number }>
  enrollmentCount: number
  isLive?: boolean
  assignedCourses?: Array<{
    id: string
    courseId: string
    batchId: string
    assignedAt: string
    assignedBy: string
    groupDifficulty: 'beginner' | 'intermediate' | 'advanced'
    resolutionStrategy: string
    status: string
    enrollmentCount: number
    completionCount: number
    courseSnapshot: {
      title: string
      description: string
      moduleCount: number
      lessonCount: number
    }
  }>
}

export interface InsightsSessionOption {
  id: string
  title: string
  subject: string
  scheduledAt: string
  status: string
  durationMinutes: number
}

export interface CourseBuilderInsightsProps {
  courseId?: string | null
  courses?: Array<{ id: string; name: string; categories?: string[]; isPublished?: boolean }>
  onCourseChange?: (courseId: string) => void
  sessionId: string | null
  sessions: InsightsSessionOption[]
  onSessionChange: (sessionId: string) => void
  onStartSession?: () => void
  onEndSession?: () => void
  endingSession?: boolean
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
  socket?: any
  tutorId?: string
  studentBoards?: Record<string, { pages: unknown[]; pageIndex: number; updatedAt?: number }>
}
