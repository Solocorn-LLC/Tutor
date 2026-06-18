export interface LiveStudent {
  id: string
  name: string
  status: 'online' | 'offline' | 'idle' | 'away'
  engagementScore: number
  handRaised: boolean
  attentionLevel: 'high' | 'medium' | 'low'
  lastActive: string
  joinedAt: string
  reactions: number
  chatMessages: number

  // For smart grouping
  skillLevel?: 'beginner' | 'intermediate' | 'advanced'
  recentPerformance?: number
}

export interface HandRaise {
  id: string
  studentId: string
  studentName: string
  topic?: string
  priority: 'high' | 'normal' | 'low'
  raisedAt: string
  status: 'pending' | 'acknowledged' | 'answered'
}

export interface ChatMessage {
  id: string
  studentId: string
  studentName: string
  content: string
  timestamp: string
  sentiment: 'positive' | 'neutral' | 'negative' | 'confused' | 'question'
  isQuestion?: boolean
  isPinned?: boolean
}

export interface EngagementMetrics {
  totalStudents: number
  activeStudents: number
  averageEngagement: number
  participationRate: number
  totalChatMessages: number
  classDuration: number
  classStartTime: string
  veryEngaged: number
  engaged: number
  passive: number
  disengaged: number
  engagementTrend: 'up' | 'down' | 'stable'
}

export interface Alert {
  id: string
  type: 'disengagement' | 'confusion' | 'technical' | 'participation'
  severity: 'high' | 'medium' | 'low'
  title: string
  message: string
  timestamp: string
  acknowledged: boolean
}

export interface LiveSessionState {
  sessionId: string
  status: 'preparing' | 'live' | 'paused' | 'ended'
  students: LiveStudent[]
  handRaises: HandRaise[]
  messages: ChatMessage[]
  metrics: EngagementMetrics
  alerts: Alert[]
}
