'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { TabsContent } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  BarChart3,
  DollarSign,
  Loader2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Calendar,
  Send,
  Bot,
  BookOpen,
  Users,
  Video,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useAutoScrollOnExpand } from '@/hooks/use-auto-scroll-on-expand'
import { RevenueDashboard } from '../dashboard/components/RevenueDashboard'
import { StudentReportsTab } from '@/components/reports/student-reports-tab'

import { cn } from '@/lib/utils'
import { SessionCalendarPanel } from '@/components/session-calendar-panel'
import { CountryFlag } from '@/components/country-flag'

interface ClassOption {
  id: string
  title: string
  categories?: string[]
  type: 'class' | 'course'
}

interface ClassReportData {
  classInfo: {
    id: string
    totalStudents: number
    averageScore: number
  }
  charts: {
    scoreDistribution: { range: string; count: number }[]
    clusterDistribution: { name: string; count: number; color: string }[]
  }
  topStudents: {
    id: string
    name: string
    averageScore: number
    completionRate: number
  }[]
  studentsNeedingAttention: {
    id: string
    name: string
    averageScore: number
    issue: string
  }[]
  summary: {
    totalStudents: number
    averageScore: number
    advancedCount: number
    intermediateCount: number
    strugglingCount: number
  }
}

interface Student {
  id: string
  name: string
  email?: string
  averageScore?: number
  completionRate?: number
  cluster?: string
  courseCount?: number
  classCount?: number
}

interface SessionOverviewItem {
  id: string
  title: string
  subject: string
  status: string
  scheduledAt: string
  startedAt?: string | null
  endedAt?: string | null
  courseId?: string | null
}

import { MentionTextarea } from '@/components/class/mention-textarea'

interface CourseItem {
  id: string
  name: string
  description: string | null
  categories: string[]
  isPublished: boolean
  createdAt: string
  updatedAt: string
  nationality?: string
  variantCategory?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  id: string
}

export default function TutorReports() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [classData, setClassData] = useState<ClassReportData | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [availableClasses, setAvailableClasses] = useState<ClassOption[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCluster, setSelectedCluster] = useState<string>('all')
  const [globalAttentionStudents, setGlobalAttentionStudents] = useState<Student[]>([])
  const [globalAllStudents, setGlobalAllStudents] = useState<Student[]>([])
  const [loadingGlobals, setLoadingGlobals] = useState(true)

  const [rosterExpanded, setRosterExpanded] = useState(true)
  const [reportsExpanded, setReportsExpanded] = useState(true)

  interface AnalyticsData {
    totalCourses: number
    totalStudents: number
    totalRevenues: number
    totalSessions: number
    currency: string
  }

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)

  // Fetch real students and classes on mount
  useEffect(() => {
    const loadData = async () => {
      setLoadingGlobals(true)
      try {
        // Fetch students
        const studentsRes = await fetch('/api/tutor/students', { credentials: 'include' })
        let studentList: Student[] = []
        if (studentsRes.ok) {
          const data = await studentsRes.json()
          studentList = (data.students ?? []).map((s: any) => ({
            id: s.id,
            name: s.name,
            email: s.email,
            courseCount: s.courseCount ?? 0,
            classCount: s.classCount ?? 0,
            // We don't have real performance data yet; leave optional fields undefined
          }))
        }
        setStudents(studentList)
        setGlobalAllStudents(studentList)
        setGlobalAttentionStudents(studentList.filter((s: Student) => s.cluster === 'struggling'))

        // Fetch available classes for dropdown
        const classesRes = await fetch('/api/tutor/classes?includeEnded=1', {
          credentials: 'include',
        })
        if (classesRes.ok) {
          const data = await classesRes.json()
          const classes: ClassOption[] = (data.classes ?? []).map((c: any) => ({
            id: c.id,
            title: c.title,
            categories: c.subject ? [c.subject] : [],
            type: 'class',
          }))
          setAvailableClasses(classes)
        }
      } catch (error) {
        console.error('Error loading report data:', error)
      } finally {
        setLoadingGlobals(false)
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  // Fetch lifetime analytics
  useEffect(() => {
    let active = true
    const loadAnalytics = async () => {
      setAnalyticsLoading(true)
      try {
        const res = await fetch('/api/tutor/analytics', { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load analytics')
        const data = await res.json()
        if (!active) return
        setAnalytics({
          totalCourses: data.totalCourses ?? 0,
          totalStudents: data.totalStudents ?? 0,
          totalRevenues: data.totalRevenues ?? 0,
          totalSessions: data.totalSessions ?? 0,
          currency: data.currency ?? 'SGD',
        })
      } catch (error) {
        console.error('Error loading analytics:', error)
        if (!active) return
        setAnalytics(null)
      } finally {
        if (active) setAnalyticsLoading(false)
      }
    }
    loadAnalytics()
    return () => {
      active = false
    }
  }, [])

  // Fetch report data when selected class changes
  useEffect(() => {
    if (!selectedClassId) {
      setIsLoading(false)
      return
    }

    const fetchReportData = async () => {
      setIsLoading(true)
      try {
        // Build report from real student data (performance metrics not yet available)
        const relevantStudents = students.length > 0 ? students : []
        const reportData: ClassReportData = {
          classInfo: {
            id: selectedClassId,
            totalStudents: relevantStudents.length,
            averageScore: 0,
          },
          charts: {
            scoreDistribution: [
              { range: '0-59', count: 0 },
              { range: '60-69', count: 0 },
              { range: '70-79', count: 0 },
              { range: '80-89', count: 0 },
              { range: '90-100', count: 0 },
            ],
            clusterDistribution: [
              { name: 'Advanced', count: 0, color: '#22c55e' },
              { name: 'Intermediate', count: 0, color: '#eab308' },
              { name: 'Struggling', count: 0, color: '#ef4444' },
            ],
          },
          topStudents: [],
          studentsNeedingAttention: [],
          summary: {
            totalStudents: relevantStudents.length,
            averageScore: 0,
            advancedCount: 0,
            intermediateCount: 0,
            strugglingCount: 0,
          },
        }
        setClassData(reportData)
      } catch (error) {
        console.error('Error fetching report data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchReportData()
  }, [selectedClassId, students])

  const filteredStudents = students.filter(student => {
    const matchesSearch =
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (student.email?.toLowerCase() ?? '').includes(searchQuery.toLowerCase())
    const matchesCluster = selectedCluster === 'all' || student.cluster === selectedCluster
    return matchesSearch && matchesCluster
  })

  const getClusterBadgeClass = (cluster?: string) => {
    switch (cluster) {
      case 'advanced':
        return 'bg-green-100 text-green-700 hover:bg-green-100'
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100'
      case 'struggling':
        return 'bg-red-100 text-red-700 hover:bg-red-100'
      default:
        return 'bg-gray-100 text-gray-700 hover:bg-gray-100'
    }
  }

  const getClusterLabel = (cluster?: string) => {
    switch (cluster) {
      case 'advanced':
        return 'Advanced'
      case 'intermediate':
        return 'Intermediate'
      case 'struggling':
        return 'Needs Support'
      default:
        return 'Not Assessed'
    }
  }

  if (isLoading && availableClasses.length === 0 && loadingGlobals) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  const analyticsPills = [
    {
      icon: BookOpen,
      label: 'Total Courses',
      value: analytics?.totalCourses ?? 0,
    },
    {
      icon: Users,
      label: 'Total Students',
      value: analytics?.totalStudents ?? 0,
    },
    {
      icon: null,
      label: 'Total Revenues',
      value: analytics?.totalRevenues ?? 0,
    },
    {
      icon: Video,
      label: 'Total Sessions',
      value: analytics?.totalSessions ?? 0,
    },
  ]

  return (
    <div className="flex h-full min-h-full flex-col bg-white px-3 pb-0 lg:px-4">
      {/* Hero */}
      <section className="relative mb-4 flex-shrink-0 rounded-[20px] border border-white/10 bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] p-5 shadow-[0_12px_40px_-4px_rgba(0,0,0,0.22)] ring-1 ring-white/20">
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <h1 className="text-xl font-bold text-white">Analytics</h1>
            <p className="mt-1 text-sm text-white/60">Track your teaching impact</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 sm:absolute sm:right-5 sm:top-1/2 sm:-translate-y-1/2 sm:justify-end">
            {analyticsPills.map(pill => (
              <div
                key={pill.label}
                className={cn(
                  'flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm',
                  analyticsLoading && 'animate-pulse'
                )}
              >
                {pill.icon && <pill.icon className="h-4 w-4 text-white/80" />}
                <span className="text-xs font-medium text-white/80">{pill.label}</span>
                <span className="text-sm font-bold text-white">{pill.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mode selector + tab content */}
      <div className="flex min-h-0 flex-1 flex-col pb-0.5">
        <SessionCalendarPanel
          value={activeTab}
          onValueChange={setActiveTab}
          variant="charcoal"
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'revenue', label: 'Revenue Insights' },
            { value: 'students', label: 'Student Roster' },
            { value: 'reports', label: 'Student Reports' },
          ]}
        >
          {/* Revenue Tab */}
          <TabsContent value="revenue" className="flex h-full flex-col gap-4 pb-4">
            <RevenueDashboard className="flex-1 overflow-hidden" themeId="current" embedded />
          </TabsContent>

          {/* Students Tab */}
          <TabsContent value="students" className="flex h-full flex-col gap-4 pb-4">
            <div className="flex flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_14px_45px_rgba(0,0,0,0.14)]">
              <button
                type="button"
                onClick={() => setRosterExpanded(prev => !prev)}
                className="panel-header panel-header-metallic w-full text-left"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="panel-header-icon">
                      <Users className="h-5 w-5 text-slate-900" />
                    </div>
                    <div>
                      <div className="panel-header-title">Student Roster</div>
                    </div>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
                    {rosterExpanded ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </div>
                </div>
              </button>
              {rosterExpanded && (
                <div className="h-full space-y-6 p-6">
                  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">Student Roster</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Manage and view all enrolled students
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Search students..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-64 border-slate-200 bg-slate-50/50"
                      />
                      <Select value={selectedCluster} onValueChange={setSelectedCluster}>
                        <SelectTrigger className="w-40 border-slate-200 bg-slate-50/50">
                          <SelectValue placeholder="Filter by cluster" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Students</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                          <SelectItem value="intermediate">Intermediate</SelectItem>
                          <SelectItem value="struggling">Needs Support</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {filteredStudents.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
                        {searchQuery
                          ? 'No students match your search.'
                          : 'No students enrolled yet.'}
                      </div>
                    ) : (
                      filteredStudents.map(student => (
                        <div
                          key={student.id}
                          className="flex items-center justify-between rounded-[12px] border border-[rgba(0,0,0,0.04)] bg-[#FFFFFF] p-4 shadow-[0_14px_45px_rgba(0,0,0,0.14)] transition-all duration-200 ease-in-out hover:bg-slate-50 hover:shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
                        >
                          <div className="flex items-center gap-4">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="bg-indigo-50 font-medium text-indigo-600">
                                {student.name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold text-slate-800">{student.name}</p>
                              <p className="text-xs font-medium text-slate-500">{student.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                Courses
                              </p>
                              <p className="font-semibold text-slate-700">
                                {student.courseCount ?? 0}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                Classes
                              </p>
                              <p className="font-semibold text-slate-700">
                                {student.classCount ?? 0}
                              </p>
                            </div>
                            {student.cluster && (
                              <Badge
                                className={cn(
                                  getClusterBadgeClass(student.cluster),
                                  'border-0 font-semibold'
                                )}
                              >
                                {getClusterLabel(student.cluster)}
                              </Badge>
                            )}
                            <Link href={`/tutor/reports/${student.id}`}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-slate-400 hover:bg-slate-100 hover:text-slate-800"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="flex h-full flex-col gap-4 pb-4">
            <div className="flex flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_14px_45px_rgba(0,0,0,0.14)]">
              <button
                type="button"
                onClick={() => setReportsExpanded(prev => !prev)}
                className="panel-header panel-header-metallic w-full text-left"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="panel-header-icon">
                      <BarChart3 className="h-5 w-5 text-slate-900" />
                    </div>
                    <div>
                      <div className="panel-header-title">Student Reports</div>
                    </div>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
                    {reportsExpanded ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </div>
                </div>
              </button>
              {reportsExpanded && (
                <div className="min-h-0 flex-1 p-6">
                  <StudentReportsTab />
                </div>
              )}
            </div>
          </TabsContent>

          {/* Courses & Classes Tab */}
          <CoursesAndClassesTab />
        </SessionCalendarPanel>
      </div>
    </div>
  )
}

// Inline AI Chat for course insights
function ItemAIChat({
  course,
  session,
  courses,
  sessions,
  students,
}: {
  course: CourseItem | null
  session?: SessionOverviewItem | null
  courses: CourseItem[]
  sessions: SessionOverviewItem[]
  students: Student[]
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const courseSessions = course
        ? sessions.filter(s => s.courseId === course.id || s.subject === course.name)
        : session
          ? [session]
          : []

      const contextPayload = {
        courseName: course?.name,
        courseDescription: course?.description,
        courseCategory: course?.categories?.[0],
        sessionTitle: session?.title,
        sessionSubject: session?.subject,
        sessionCount: courseSessions.length,
        sessions: courseSessions.map(s => ({
          title: s.title,
          status: s.status,
          scheduledAt: s.scheduledAt,
        })),
        enrolledStudents: students.map(s => ({
          name: s.name,
          courses: s.courseCount ?? 0,
        })),
      }

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          subject: course?.categories?.[0] ?? session?.subject ?? 'general',
          context: {
            ...contextPayload,
            previousMessages: [...messages, userMsg].slice(-6).map(m => ({
              role: m.role,
              content: m.content,
            })),
          },
        }),
      })

      const data = await res.json()
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content:
          data.response ||
          'I apologize, but I am having trouble responding right now. Please try again.',
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'I apologize, but I am having trouble responding right now. Please try again.',
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, course, session, sessions, students, messages])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const mentionItems = useMemo(() => {
    const items: { id: string; type: string; label: string; subtitle?: string }[] = []
    courses.forEach(c =>
      items.push({ id: c.id, type: 'course', label: c.name, subtitle: 'Course' })
    )
    sessions.forEach(s =>
      items.push({ id: s.id, type: 'session', label: s.title, subtitle: 'Session' })
    )
    students.forEach(s =>
      items.push({ id: s.id, type: 'student', label: s.name, subtitle: 'Student' })
    )
    return items
  }, [courses, sessions, students])

  const isCourse = !!course
  const isSession = !!session

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Chat Area */}
      <div className="flex min-h-0 flex-1 flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center space-y-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                <Bot className="h-6 w-6 text-blue-500" />
              </div>
              <p className="max-w-[280px] text-sm text-gray-500">
                {isCourse
                  ? 'Ask me anything about student performance, engagement, or insights for this course.'
                  : isSession
                    ? 'Ask me about attendance, participation, or metrics for this specific session.'
                    : 'Select a course or session to ask specific questions, or ask me general questions about your students.'}
              </p>
            </div>
          ) : (
            <>
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={cn(
                    'flex gap-3',
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
                      <Bot className="h-4 w-4 text-blue-600" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                      msg.role === 'user'
                        ? 'rounded-tr-sm bg-blue-600 text-white'
                        : 'rounded-tl-sm border border-gray-100 bg-white text-gray-800'
                    )}
                  >
                    <div className="whitespace-pre-line leading-relaxed">{msg.content}</div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
                    <Bot className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm border border-gray-100 bg-white px-4 py-3 shadow-sm">
                    <div className="flex gap-1.5">
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400" />
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 delay-100" />
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 delay-200" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="shrink-0 p-4">
          <div className="relative flex items-end gap-2 rounded-2xl border border-gray-200 bg-white p-1 pl-3 shadow-sm transition-all focus-within:border-blue-300 focus-within:ring-1 focus-within:ring-blue-200">
            <MentionTextarea
              mentionItems={mentionItems}
              placeholder={
                isCourse
                  ? 'Ask about course performance...'
                  : isSession
                    ? 'Ask about this session...'
                    : 'Ask a general question...'
              }
              className="max-h-[120px] min-h-[44px] w-full resize-none border-0 bg-transparent py-3 text-sm shadow-none outline-none placeholder:text-gray-400 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <Button
              size="icon"
              className={cn(
                'mb-1 mr-1 h-9 w-9 shrink-0 rounded-xl transition-all',
                input.trim()
                  ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
                  : 'bg-gray-200 text-white hover:bg-gray-200'
              )}
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
            >
              <Send className="ml-0.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Courses & Classes Tab Component
function CoursesAndClassesTab() {
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [coursesLoading, setCoursesLoading] = useState(true)
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [sessionsOverview, setSessionsOverview] = useState<SessionOverviewItem[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [students, setStudents] = useState<Student[]>([])
  const [expandedPanel, setExpandedPanel] = useState<'courses' | 'ai'>('courses')
  const coursesPanelRef = useAutoScrollOnExpand(expandedPanel === 'courses')
  const aiPanelRef = useAutoScrollOnExpand(expandedPanel === 'ai')

  const selectedCourse = courses.find(c => c.id === selectedCourseId) || null

  const courseTitle = (course: {
    name: string
    nationality?: string
    variantCategory?: string
    categories?: string[]
  }) => {
    const category = course.variantCategory || (course.categories || [])[0] || 'General'
    if (!course.nationality || course.nationality === 'Global') return course.name
    return (
      <span className="inline-flex items-center gap-1">
        {course.name} — {category} —{' '}
        <CountryFlag countryName={course.nationality} size="xs" showLabel />
      </span>
    )
  }
  const selectedSession = sessionsOverview.find(s => s.id === selectedSessionId) || null

  useEffect(() => {
    const loadCourses = async () => {
      setCoursesLoading(true)
      try {
        const res = await fetch('/api/tutor/courses', { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load courses')
        const data = await res.json()
        const allCourses: CourseItem[] = (data.courses ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          categories: Array.isArray(c.categories) ? c.categories : [],
          isPublished: c.isPublished,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          nationality: c.nationality,
          variantCategory: c.variantCategory,
        }))
        // Filter to published courses only
        setCourses(allCourses.filter(c => c.isPublished))
      } catch {
        setCourses([])
      } finally {
        setCoursesLoading(false)
      }
    }

    const loadSessionsOverview = async () => {
      setSessionsLoading(true)
      try {
        const res = await fetch('/api/tutor/classes?includeEnded=1', { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load sessions')
        const data = await res.json()
        setSessionsOverview((data.classes || []) as SessionOverviewItem[])
      } catch {
        setSessionsOverview([])
      } finally {
        setSessionsLoading(false)
      }
    }

    const loadStudents = async () => {
      try {
        const res = await fetch('/api/tutor/students', { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load students')
        const data = await res.json()
        setStudents(
          (data.students ?? []).map((s: any) => ({
            id: s.id,
            name: s.name,
            email: s.email,
            courseCount: s.courseCount ?? 0,
            classCount: s.classCount ?? 0,
          }))
        )
      } catch {
        setStudents([])
      }
    }

    loadCourses()
    loadSessionsOverview()
    loadStudents()
  }, [])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const courseSessions = selectedCourse
    ? sessionsOverview.filter(
        s => s.courseId === selectedCourse.id || s.subject === selectedCourse.name
      )
    : []

  const displayedSessions = selectedCourse ? courseSessions : sessionsOverview

  const handleCourseClick = (courseId: string) => {
    if (selectedCourseId === courseId) {
      // Deselect course
      setSelectedCourseId(null)
      setSelectedSessionId(null)
    } else {
      setSelectedCourseId(courseId)
      // If a session is already selected but doesn't belong to this course, clear it
      if (selectedSessionId) {
        const session = sessionsOverview.find(s => s.id === selectedSessionId)
        const newCourse = courses.find(c => c.id === courseId)
        if (
          session &&
          newCourse &&
          session.courseId !== courseId &&
          session.subject !== newCourse.name
        ) {
          setSelectedSessionId(null)
        }
      }
    }
  }

  const handleSessionClick = (sessionId: string) => {
    if (selectedSessionId === sessionId) {
      // Deselect session, keep course selected
      setSelectedSessionId(null)
    } else {
      setSelectedSessionId(sessionId)
      // Auto-select the matching course if not already selected
      const session = sessionsOverview.find(s => s.id === sessionId)
      if (session?.courseId) {
        const matchingCourse = courses.find(
          c => c.id === session.courseId || c.name === session.subject
        )
        if (matchingCourse && selectedCourseId !== matchingCourse.id) {
          setSelectedCourseId(matchingCourse.id)
        }
      }
    }
  }

  return (
    <TabsContent value="overview" className="flex h-full flex-col gap-4 pb-4">
      {/* Panel 1 - Shared Courses & Classes / Sessions */}
      <div className="flex flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_14px_45px_rgba(0,0,0,0.14)]">
        <button
          type="button"
          onClick={() => setExpandedPanel(prev => (prev === 'courses' ? 'ai' : 'courses'))}
          className="panel-header panel-header-metallic w-full text-left"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="panel-header-icon">
                <BookOpen className="h-5 w-5 text-slate-900" />
              </div>
              <div>
                <div className="panel-header-title">Courses & Classes</div>
              </div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
              {expandedPanel === 'courses' ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </div>
          </div>
        </button>
        {expandedPanel === 'courses' && (
          <div className="min-h-0 flex-1 p-6" ref={coursesPanelRef}>
            <div className="grid h-[280px] shrink-0 grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="flex flex-col overflow-hidden">
                <div className="shrink-0 pb-3">
                  <h3 className="text-base font-bold text-slate-800">
                    Courses & Classes ({courses.length})
                  </h3>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto pr-2">
                  {coursesLoading ? (
                    <div className="flex h-full items-center justify-center py-10 text-sm text-slate-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading courses...
                    </div>
                  ) : courses.length === 0 ? (
                    <div className="flex h-full items-center justify-center py-10 text-center text-sm text-slate-500">
                      No published courses found.
                    </div>
                  ) : (
                    courses.map(course => (
                      <div
                        key={course.id}
                        className={cn(
                          'cursor-pointer rounded-[12px] border p-4 transition-colors',
                          selectedCourseId === course.id
                            ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-400/20'
                            : 'border-[rgba(0,0,0,0.04)] bg-[#FFFFFF] hover:bg-slate-50'
                        )}
                        onClick={() => handleCourseClick(course.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="text-sm font-semibold text-slate-800">
                            {courseTitle(course)}
                          </div>
                          <Badge
                            variant="secondary"
                            className="border-0 bg-indigo-100 text-[10px] text-indigo-700 hover:bg-indigo-200"
                          >
                            Course
                          </Badge>
                        </div>
                        <div className="mt-1.5 truncate text-xs text-slate-500">
                          {course.description || course.categories[0] || 'Untitled'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex flex-col overflow-hidden">
                <div className="shrink-0 pb-3">
                  <h3 className="text-base font-bold text-slate-800">
                    Sessions
                    {selectedCourse && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        ({displayedSessions.length} for {courseTitle(selectedCourse)})
                      </span>
                    )}
                  </h3>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto pr-2">
                  {sessionsLoading ? (
                    <div className="flex h-full items-center justify-center py-10 text-sm text-slate-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading sessions...
                    </div>
                  ) : displayedSessions.length === 0 ? (
                    <div className="flex h-full items-center justify-center py-10 text-center text-sm text-slate-500">
                      {selectedCourse ? (
                        <>No sessions found for {courseTitle(selectedCourse)}.</>
                      ) : (
                        'No sessions found.'
                      )}
                    </div>
                  ) : (
                    displayedSessions.map((sessionItem: SessionOverviewItem) => {
                      const isOngoing = sessionItem.status === 'ACTIVE'
                      const isEnded =
                        Boolean(sessionItem.endedAt) || sessionItem.status === 'COMPLETED'
                      const statusLabel = isOngoing ? 'Ongoing' : isEnded ? 'Ended' : 'Scheduled'
                      return (
                        <div
                          key={sessionItem.id}
                          className={cn(
                            'cursor-pointer rounded-[12px] border p-4 transition-colors',
                            selectedSessionId === sessionItem.id
                              ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-400/20'
                              : 'border-[rgba(0,0,0,0.04)] bg-[#FFFFFF] hover:bg-slate-50'
                          )}
                          onClick={() => handleSessionClick(sessionItem.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800">
                                {sessionItem.title}
                              </p>
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {sessionItem.subject}
                              </p>
                            </div>
                            <Badge
                              variant={isOngoing ? 'default' : isEnded ? 'secondary' : 'outline'}
                              className={cn(
                                'shrink-0 border-0 text-[10px]',
                                isOngoing
                                  ? 'bg-emerald-500 text-white'
                                  : isEnded
                                    ? 'bg-slate-100 text-slate-500'
                                    : 'bg-blue-100 text-blue-700'
                              )}
                            >
                              {statusLabel}
                            </Badge>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Panel 2 - Course Overview / Analytics Strip */}
      <div className="rounded-[18px] border border-[rgba(0,0,0,0.05)] bg-[#FFFFFF] p-6 shadow-[0_14px_45px_rgba(0,0,0,0.14)]">
        <div className="flex shrink-0 items-center gap-6 overflow-x-auto">
          {selectedCourse && selectedSession ? (
            <>
              {/* Course summary */}
              <div className="flex shrink-0 items-center gap-2 border-r border-slate-100 pr-6 font-bold text-indigo-600">
                <BarChart3 className="h-5 w-5" />
                <span className="text-base">{courseTitle(selectedCourse)}</span>
              </div>
              <div className="flex items-center gap-8 text-sm">
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Published
                  </span>
                  <span className="font-semibold text-slate-800">
                    {formatDate(selectedCourse.createdAt)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Sessions
                  </span>
                  <span className="font-semibold text-slate-800">{courseSessions.length}</span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Category
                  </span>
                  <span className="font-semibold text-slate-800">
                    {selectedCourse.categories[0] || 'N/A'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Students
                  </span>
                  <span className="font-semibold text-slate-800">{students.length}</span>
                </div>
              </div>
              {/* Divider */}
              <div className="h-8 w-px bg-slate-200" />
              {/* Session summary */}
              <div className="flex shrink-0 items-center gap-2 border-r border-slate-100 pr-6 font-bold text-emerald-600">
                <Calendar className="h-5 w-5" />
                <span className="text-base">{selectedSession.title}</span>
              </div>
              <div className="flex items-center gap-8 text-sm">
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Status
                  </span>
                  <span className="font-semibold text-slate-800">{selectedSession.status}</span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Scheduled
                  </span>
                  <span className="font-semibold text-slate-800">
                    {formatDate(selectedSession.scheduledAt)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Subject
                  </span>
                  <span className="font-semibold text-slate-800">
                    {selectedSession.subject || 'N/A'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Students
                  </span>
                  <span className="font-semibold text-slate-800">{students.length}</span>
                </div>
              </div>
            </>
          ) : selectedCourse ? (
            <>
              <div className="flex shrink-0 items-center gap-2 border-r border-slate-100 pr-6 font-bold text-indigo-600">
                <BarChart3 className="h-5 w-5" />
                <span className="text-base">{courseTitle(selectedCourse)}</span>
              </div>
              <div className="flex items-center gap-8 text-sm">
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Published
                  </span>
                  <span className="font-semibold text-slate-800">
                    {formatDate(selectedCourse.createdAt)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Sessions
                  </span>
                  <span className="font-semibold text-slate-800">{courseSessions.length}</span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Category
                  </span>
                  <span className="font-semibold text-slate-800">
                    {selectedCourse.categories[0] || 'N/A'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Students
                  </span>
                  <span className="font-semibold text-slate-800">{students.length}</span>
                </div>
              </div>
            </>
          ) : selectedSession ? (
            <>
              <div className="flex shrink-0 items-center gap-2 border-r border-slate-100 pr-6 font-bold text-indigo-600">
                <BarChart3 className="h-5 w-5" />
                <span className="text-base">{selectedSession.title}</span>
              </div>
              <div className="flex items-center gap-8 text-sm">
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Status
                  </span>
                  <span className="font-semibold text-slate-800">{selectedSession.status}</span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Scheduled
                  </span>
                  <span className="font-semibold text-slate-800">
                    {formatDate(selectedSession.scheduledAt)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Subject
                  </span>
                  <span className="font-semibold text-slate-800">
                    {selectedSession.subject || 'N/A'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Students
                  </span>
                  <span className="font-semibold text-slate-800">{students.length}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex w-full items-center justify-center gap-2 py-2 text-slate-500">
              <BarChart3 className="h-5 w-5" />
              <span className="text-sm font-semibold">
                Select a course or class to view analytics
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Panel 3 - Ask AI Component */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_14px_45px_rgba(0,0,0,0.14)]">
        <button
          type="button"
          onClick={() => setExpandedPanel(prev => (prev === 'ai' ? 'courses' : 'ai'))}
          className="panel-header panel-header-metallic w-full text-left"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="panel-header-icon">
                <Bot className="h-5 w-5 text-slate-900" />
              </div>
              <div>
                <div className="panel-header-title">Ask AI about your courses and students.</div>
              </div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
              {expandedPanel === 'ai' ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </div>
          </div>
        </button>
        {expandedPanel === 'ai' && (
          <div className="min-h-0 flex-1 p-6" ref={aiPanelRef}>
            <ItemAIChat
              course={selectedCourse}
              session={selectedSession}
              courses={courses}
              sessions={sessionsOverview}
              students={students}
            />
          </div>
        )}
      </div>
    </TabsContent>
  )
}
