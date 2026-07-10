export type CommsRole = 'student' | 'tutor'

export interface Conversation {
  id: string
  otherParticipant: {
    id: string
    name: string
    avatarUrl: string | null
  }
  lastMessage: {
    content: string
    createdAt: string
    read: boolean
    senderId: string
  } | null
  unreadCount: number
  updatedAt: string
}

export interface Message {
  id: string
  content: string
  type: string
  senderId: string
  sender: {
    id: string
    profile: {
      name: string | null
      avatarUrl: string | null
    } | null
  }
  createdAt: string
  read: boolean
}

export interface AppNotification {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
  actionUrl?: string | null
  data?: Record<string, unknown> | null
  // Derived from data for UI display
  courseName?: string | null
  tutorName?: string | null
  tutorUsername?: string | null
}
