export type ProgressItemType = 'video' | 'lesson' | 'course' | 'task'

export type ProgressItem = {
  id: string
  type: ProgressItemType
  title: string
  progress: number // 0-100
  completed: boolean
  lastAccessedAt?: Date
  metadata?: Record<string, unknown>
}
