import type {
  InsightsSessionOption,
  CourseBuilderInsightsProps as BaseCourseBuilderInsightsProps,
} from '../../dashboard/components/builder-types'

export type { InsightsSessionOption }

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

export interface CourseBuilderInsightsProps extends BaseCourseBuilderInsightsProps {}
