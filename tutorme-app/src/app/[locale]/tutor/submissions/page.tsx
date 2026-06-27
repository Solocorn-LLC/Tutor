'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAutoScrollOnExpand } from '@/hooks/use-auto-scroll-on-expand'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import {
  ClipboardCheck,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileQuestion,
  Users,
  CheckCircle2,
  Inbox,
} from 'lucide-react'
import { toast } from 'sonner'
import { SessionCalendarPanel } from '@/components/session-calendar-panel'
import { cn } from '@/lib/utils'

interface Submission {
  submissionId: string
  taskId: string
  taskTitle: string
  studentId: string
  studentName: string
  status: string
  score: number | null
  maxScore: number
  answers: Record<string, unknown> | null
  tutorFeedback: string | null
  timeSpent: number
  submittedAt: string | null
  gradedAt: string | null
  questionMeta?: Record<
    string,
    {
      questionText?: string
      rubric?: string
      modelAnswer?: string
      marks?: number
      needsReview?: boolean
    }
  >
}

type StatusFilter = 'all' | 'submitted' | 'graded'

export default function TutorSubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<StatusFilter>('submitted')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async (status: StatusFilter) => {
    setLoading(true)
    try {
      const qs = status === 'all' ? '' : `?status=${status}`
      const res = await fetch(`/api/tutor/submissions${qs}`, { credentials: 'include' })
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setSubmissions(data?.submissions ?? [])
    } catch {
      setSubmissions([])
      toast.error('Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(tab)
  }, [load, tab])

  const newCount = submissions.filter(s => s.status === 'submitted').length
  const totalCount = submissions.length

  const statusLabel = tab === 'submitted' ? 'Grade' : tab === 'graded' ? 'Graded' : 'All'

  return (
    <div className="flex h-full min-h-full flex-col bg-white px-6 pb-0 pt-2 lg:pt-4">
      {/* Hero — Analytics-style header */}
      <section className="relative mb-4 flex-shrink-0 rounded-[20px] border border-white/10 bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] p-5 shadow-[0_12px_40px_-4px_rgba(0,0,0,0.22)] ring-1 ring-white/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Grading</h1>
            <p className="mt-1 text-sm text-white/60">Review and grade student submissions</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div
              className={cn(
                'flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm',
                loading && 'animate-pulse'
              )}
            >
              <Inbox className="h-4 w-4 text-white/80" />
              <span className="text-xs font-medium text-white/80">New</span>
              <span className="text-sm font-bold text-white">{newCount}</span>
            </div>
            <div
              className={cn(
                'flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm',
                loading && 'animate-pulse'
              )}
            >
              <Users className="h-4 w-4 text-white/80" />
              <span className="text-xs font-medium text-white/80">Total</span>
              <span className="text-sm font-bold text-white">{totalCount}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Mode selector + tab content */}
      <div className="flex min-h-0 flex-1 flex-col pb-0.5 pt-2">
        <SessionCalendarPanel
          value={tab}
          onValueChange={v => setTab(v as StatusFilter)}
          variant="charcoal"
          tabs={[
            { value: 'submitted', label: 'Grade', icon: ClipboardCheck },
            { value: 'graded', label: 'Graded', icon: CheckCircle2 },
            { value: 'all', label: 'All', icon: Users },
          ]}
        >
          <TabsContent value="submitted" className="h-full overflow-hidden bg-white">
            <SubmissionList
              submissions={submissions}
              loading={loading}
              emptyMessage="Nothing is waiting to be graded."
              expanded={expanded}
              onToggle={setExpanded}
              onGraded={() => load(tab)}
            />
          </TabsContent>
          <TabsContent value="graded" className="h-full overflow-hidden bg-white">
            <SubmissionList
              submissions={submissions}
              loading={loading}
              emptyMessage="No graded submissions found."
              expanded={expanded}
              onToggle={setExpanded}
              onGraded={() => load(tab)}
            />
          </TabsContent>
          <TabsContent value="all" className="h-full overflow-hidden bg-white">
            <SubmissionList
              submissions={submissions}
              loading={loading}
              emptyMessage="No submissions found."
              expanded={expanded}
              onToggle={setExpanded}
              onGraded={() => load(tab)}
            />
          </TabsContent>
        </SessionCalendarPanel>
      </div>
    </div>
  )
}

function SubmissionList({
  submissions,
  loading,
  emptyMessage,
  expanded,
  onToggle,
  onGraded,
}: {
  submissions: Submission[]
  loading: boolean
  emptyMessage: string
  expanded: string | null
  onToggle: (id: string | null) => void
  onGraded: () => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (submissions.length === 0) {
    return (
      <div className="py-16 text-center">
        <FileQuestion className="mx-auto mb-4 h-12 w-12 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-700">No submissions</h3>
        <p className="mt-1 text-sm text-gray-500">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="h-full space-y-3 overflow-y-auto pb-4 pr-2">
      {submissions.map(sub => (
        <SubmissionRow
          key={sub.submissionId}
          submission={sub}
          expanded={expanded === sub.submissionId}
          onToggle={() => onToggle(expanded === sub.submissionId ? null : sub.submissionId)}
          onGraded={onGraded}
        />
      ))}
    </div>
  )
}

function SubmissionRow({
  submission,
  expanded,
  onToggle,
  onGraded,
}: {
  submission: Submission
  expanded: boolean
  onToggle: () => void
  onGraded: () => void
}) {
  const contentRef = useAutoScrollOnExpand(expanded, { delay: 150 })
  const [score, setScore] = useState<string>(submission.score?.toString() ?? '')
  const [feedback, setFeedback] = useState<string>(submission.tutorFeedback ?? '')
  const [saving, setSaving] = useState(false)

  const handleGrade = async () => {
    const numericScore = Number(score)
    if (Number.isNaN(numericScore) || numericScore < 0) {
      toast.error('Enter a valid score')
      return
    }
    setSaving(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrf = (await csrfRes.json().catch(() => ({})))?.token ?? null

      const res = await fetch(`/api/tutor/submissions/${submission.submissionId}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrf && { 'X-CSRF-Token': csrf }) },
        credentials: 'include',
        body: JSON.stringify({
          score: numericScore,
          maxScore: submission.maxScore,
          feedback: feedback.trim() || undefined,
          approved: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data?.error ?? 'Failed to save grade')
        return
      }
      toast.success('Grade saved')
      onGraded()
    } catch {
      toast.error('Failed to save grade')
    } finally {
      setSaving(false)
    }
  }

  const answers = submission.answers ?? {}
  const answerEntries = Object.entries(answers)
  const questionMeta = submission.questionMeta ?? {}
  const reviewCount = Object.values(questionMeta).filter(m => m?.needsReview).length

  return (
    <Card className="overflow-hidden bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={onToggle}
        role="button"
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
            )}
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{submission.taskTitle}</CardTitle>
              <CardDescription className="truncate">
                {submission.studentName}
                {submission.submittedAt &&
                  ` · ${new Date(submission.submittedAt).toLocaleDateString()}`}
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {submission.score != null && (
              <span className="text-sm font-semibold text-gray-700">
                {Math.round(submission.score)}/{submission.maxScore}
              </span>
            )}
            <Badge
              variant={submission.status === 'graded' ? 'default' : 'outline'}
              className="capitalize"
            >
              {submission.status}
            </Badge>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent ref={contentRef} className="space-y-4 border-t pt-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-700">Answers</h4>
              {reviewCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  {reviewCount} need{reviewCount === 1 ? 's' : ''} your review
                </span>
              )}
            </div>
            {answerEntries.length === 0 ? (
              <p className="text-sm text-gray-400">No structured answers recorded.</p>
            ) : (
              <ul className="space-y-2">
                {answerEntries.map(([qid, ans]) => {
                  const meta = questionMeta[qid]
                  return (
                    <li
                      key={qid}
                      className={`rounded-md p-2 text-sm ${
                        meta?.needsReview
                          ? 'border border-amber-200 bg-amber-50'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-gray-600">
                          {meta?.questionText ?? `Q${qid}`}
                        </span>
                        {meta?.needsReview && (
                          <span className="shrink-0 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Needs review
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-gray-800">
                        <span className="text-gray-400">Answer: </span>
                        {typeof ans === 'string' ? ans : JSON.stringify(ans)}
                      </p>
                      {meta?.modelAnswer && (
                        <p className="mt-1 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                          <span className="font-semibold">Model answer:</span> {meta.modelAnswer}
                        </p>
                      )}
                      {meta?.rubric && (
                        <p className="mt-1 rounded bg-sky-50 px-2 py-1 text-xs text-sky-800">
                          <span className="font-semibold">Marking:</span> {meta.rubric}
                          {typeof meta.marks === 'number' ? ` · ${meta.marks} marks` : ''}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[140px_1fr] sm:items-start">
            <div>
              <Label htmlFor={`score-${submission.submissionId}`}>
                Score (/{submission.maxScore})
              </Label>
              <Input
                id={`score-${submission.submissionId}`}
                type="number"
                min={0}
                max={submission.maxScore}
                value={score}
                onChange={e => setScore(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor={`fb-${submission.submissionId}`}>Feedback</Label>
              <Textarea
                id={`fb-${submission.submissionId}`}
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Feedback for the student…"
                className="mt-1"
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleGrade} disabled={saving} className="gap-1">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {submission.status === 'graded' ? 'Update grade' : 'Save grade'}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
