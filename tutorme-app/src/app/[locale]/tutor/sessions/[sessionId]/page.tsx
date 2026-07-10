'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Users, CheckCircle, BookOpen, Clock } from 'lucide-react'
import { toast } from 'sonner'

interface SessionData {
  session: {
    id: string
    title: string
    subject: string
    status: string
    scheduledAt: string | null
    startedAt: string | null
    scheduleName?: string | null
    courseName?: string | null
    variantName?: string | null
    summary?: string
    summaryJson?: {
      sessionMeta?: {
        title?: string
        subject?: string
        participants?: number
        messages?: number
        generatedAt?: string
      }
      transcriptMeta?: {
        source?: string
        hasTranscriptText?: boolean
      }
    }
  }
  students: Array<{
    id: string
    name: string
    status: 'online' | 'offline'
    engagementScore: number
    handRaised: boolean
    chatMessages: number
    joinedAt: string
  }>
  messages: Array<{
    id: string
    studentId: string
    studentName: string
    content: string
    timestamp: string
    isQuestion: boolean
  }>
  metrics: {
    totalStudents: number
    activeStudents: number
    totalChatMessages: number
    classDuration: number
    classStartTime: string
    homeworkAssigned: number
    assetsDeployed: number
  }
}

export default function TutorSessionInsightsPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.sessionId as string
  const [data, setData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId) return

    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/tutor/classes/${sessionId}`, {
          credentials: 'include',
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to load session')
        }
        const json = await res.json()
        setData(json)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load session')
      } finally {
        setLoading(false)
      }
    }

    fetchSession()
  }, [sessionId])

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[linear-gradient(145deg,#ECEFF3_0%,#D6DBE3_40%,#C9D0DA_60%,#EEF2F6_100%)]">
        <p className="text-[#7F7C77]">Loading session insights…</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-[linear-gradient(145deg,#ECEFF3_0%,#D6DBE3_40%,#C9D0DA_60%,#EEF2F6_100%)]">
        <p className="text-[#7F7C77]">Session not found.</p>
        <Button
          onClick={() => router.push('/tutor/classes')}
          className="bg-[#2563EB] text-white hover:brightness-105"
        >
          Back to Classes
        </Button>
      </div>
    )
  }

  const { session, students, metrics } = data
  const scheduledDate = session.scheduledAt
    ? new Date(session.scheduledAt).toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unknown date'

  return (
    <div className="min-h-screen w-full bg-[linear-gradient(145deg,#ECEFF3_0%,#D6DBE3_40%,#C9D0DA_60%,#EEF2F6_100%)] p-6 font-sans lg:p-0">
      <div className="mx-auto w-full max-w-[calc(100%-2rem)] space-y-6 px-3 lg:px-0 lg:py-4">
        <div className="rounded-2xl bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.16)] ring-1 ring-black/5 lg:mx-4 lg:p-6">
          <Card className="rounded-lg border border-[#E5E7EB] bg-[linear-gradient(145deg,#ECEFF3_0%,#D6DBE3_40%,#C9D0DA_60%,#EEF2F6_100%)] p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] ring-1 ring-white/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push('/tutor/classes')}
                  className="h-9 w-9 rounded-full p-0 text-[#344054] transition-colors hover:bg-gray-100"
                  aria-label="Back to Sessions"
                >
                  <ArrowLeft className="mx-auto h-5 w-5" />
                </button>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-[#344054]">
                    {session.courseName
                      ? `${session.courseName}${session.variantName ? ` — ${session.variantName}` : ''}`
                      : session.title || 'Untitled Session'}
                  </h1>
                  <p className="mt-1 text-sm text-[#7F7C77]">
                    {[
                      session.scheduleName || (session.courseName ? 'One-time session' : null),
                      scheduledDate,
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                </div>
              </div>
              <Badge
                variant={session.status === 'ended' ? 'secondary' : 'default'}
                className={
                  session.status === 'ended'
                    ? 'bg-[#D6DBE3] text-[#7F7C77]'
                    : 'bg-[#1D4ED8] text-white'
                }
              >
                {session.status === 'ended' ? 'Ended' : session.status}
              </Badge>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="rounded-lg border border-[#E5E7EB] bg-[rgba(255,255,255,0.75)] shadow-sm ring-1 ring-white/40 transition-all duration-200 hover:bg-[rgba(255,255,255,0.92)]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#7F7C77]">
                  <Users className="h-4 w-4 text-[#2563EB]" />
                  Attendance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-[#344054]">{metrics.totalStudents}</p>
                <p className="mt-1 text-xs font-medium text-[#7F7C77]">
                  {metrics.activeStudents} joined live
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-lg border border-[#E5E7EB] bg-[rgba(255,255,255,0.75)] shadow-sm ring-1 ring-white/40 transition-all duration-200 hover:bg-[rgba(255,255,255,0.92)]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#7F7C77]">
                  <CheckCircle className="h-4 w-4 text-[#2DBE8A]" />
                  Task Completion Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-[#344054]">
                  {metrics.totalStudents > 0 && metrics.homeworkAssigned > 0
                    ? `${Math.round((metrics.assetsDeployed / metrics.homeworkAssigned) * 100)}%`
                    : 'N/A'}
                </p>
                <p className="mt-1 text-xs font-medium text-[#7F7C77]">
                  {metrics.assetsDeployed} of {metrics.homeworkAssigned} tasks completed
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-lg border border-[#E5E7EB] bg-[rgba(255,255,255,0.75)] shadow-sm ring-1 ring-white/40 transition-all duration-200 hover:bg-[rgba(255,255,255,0.92)]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#7F7C77]">
                  <BookOpen className="h-4 w-4 text-[#F17623]" />
                  Homework Assigned
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-[#344054]">{metrics.homeworkAssigned}</p>
                <p className="mt-1 text-xs font-medium text-[#7F7C77]">
                  Tasks &amp; assessments deployed
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-lg border border-[#E5E7EB] bg-[rgba(255,255,255,0.75)] shadow-sm ring-1 ring-white/40 transition-all duration-200 hover:bg-[rgba(255,255,255,0.92)]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#7F7C77]">
                  <Clock className="h-4 w-4 text-[#2563EB]" />
                  Duration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-[#344054]">{metrics.classDuration}m</p>
                <p className="mt-1 text-xs font-medium text-[#7F7C77]">Session length</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="flex h-full flex-col rounded-lg border border-[#E5E7EB] bg-white shadow-sm ring-1 ring-black/5">
              <CardHeader className="rounded-t-lg border-b border-[#E5E7EB] bg-[linear-gradient(145deg,#EEF4FF_0%,#E4EDFF_60%,#F5F9FF_100%)]">
                <CardTitle className="text-base font-semibold text-[#2563EB]">AI Summary</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 pt-4">
                {session.summary ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4 text-sm leading-relaxed text-[#3F3D39]">
                      <p className="whitespace-pre-wrap">{session.summary}</p>
                    </div>
                    {session.summaryJson?.sessionMeta && (
                      <div className="rounded-lg border border-[#C9B7FF] bg-[#F3EEFF] p-3">
                        <div className="flex flex-wrap gap-4 text-xs font-medium text-[#6D59D8]">
                          <span>
                            Participants: {session.summaryJson.sessionMeta.participants ?? '-'}
                          </span>
                          <span>Messages: {session.summaryJson.sessionMeta.messages ?? '-'}</span>
                          <span>
                            Generated:{' '}
                            {session.summaryJson.sessionMeta.generatedAt
                              ? new Date(
                                  session.summaryJson.sessionMeta.generatedAt
                                ).toLocaleString()
                              : '-'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full min-h-[120px] items-center justify-center">
                    <p className="text-sm italic text-[#7F7C77]">
                      No summary available for this session.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="flex h-full flex-col rounded-lg border border-[#E5E7EB] bg-white shadow-sm ring-1 ring-black/5">
              <CardHeader className="rounded-t-lg border-b border-[#E5E7EB] bg-[linear-gradient(145deg,#ECEFF3_0%,#D6DBE3_40%,#C9D0DA_60%,#EEF2F6_100%)]">
                <CardTitle className="text-base font-semibold text-[#344054]">
                  Attendance List
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0 pt-0">
                {students.length === 0 ? (
                  <div className="flex min-h-[120px] items-center justify-center p-6">
                    <p className="text-sm italic text-[#7F7C77]">
                      No students attended this session.
                    </p>
                  </div>
                ) : (
                  <ul className="max-h-[400px] divide-y divide-[#E5E7EB] overflow-y-auto">
                    {students.map((student, idx) => (
                      <li
                        key={student.id}
                        className={`flex items-center justify-between p-4 ${idx % 2 === 0 ? 'bg-white' : 'bg-[#F9FAFB]'} transition-colors hover:bg-[#EEF4FF]`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-2.5 w-2.5 rounded-full shadow-sm ${
                              student.status === 'online' ? 'bg-[#2DBE8A]' : 'bg-[#C7CDD4]'
                            }`}
                          />
                          <span className="text-sm font-semibold text-[#344054]">
                            {student.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-medium">
                          <span className="rounded-md border border-[#E5E7EB] bg-white px-2 py-1 text-[#3F3D39]">
                            Score: {student.engagementScore}
                          </span>
                          <span className="rounded-md border border-[#E5E7EB] bg-white px-2 py-1 text-[#3F3D39]">
                            Msgs: {student.chatMessages}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
