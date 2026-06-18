'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClipboardCheck, Loader2, ChevronDown, ChevronRight, FileQuestion } from 'lucide-react'
import { toast } from 'sonner'

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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <ClipboardCheck className="h-6 w-6" />
          Grading
        </h1>
        <p className="mt-1 text-gray-600">Review and grade student submissions</p>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as StatusFilter)}>
        <TabsList className="mb-4 grid w-full grid-cols-3 gap-1 border-0 bg-transparent shadow-none">
          <TabsTrigger
            value="submitted"
            className="w-full rounded-lg border-transparent bg-transparent px-1 text-xs text-[#667085] transition-all hover:bg-white hover:text-[#344054] hover:shadow-sm data-[state=active]:border-blue-200/70 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900 data-[state=active]:shadow-sm"
          >
            Needs grading
          </TabsTrigger>
          <TabsTrigger
            value="graded"
            className="w-full rounded-lg border-transparent bg-transparent px-1 text-xs text-[#667085] transition-all hover:bg-white hover:text-[#344054] hover:shadow-sm data-[state=active]:border-blue-200/70 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900 data-[state=active]:shadow-sm"
          >
            Graded
          </TabsTrigger>
          <TabsTrigger
            value="all"
            className="w-full rounded-lg border-transparent bg-transparent px-1 text-xs text-[#667085] transition-all hover:bg-white hover:text-[#344054] hover:shadow-sm data-[state=active]:border-blue-200/70 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900 data-[state=active]:shadow-sm"
          >
            All
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : submissions.length === 0 ? (
        <div className="py-16 text-center">
          <FileQuestion className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-700">No submissions</h3>
          <p className="mt-1 text-sm text-gray-500">
            {tab === 'submitted' ? 'Nothing is waiting to be graded.' : 'No submissions found.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map(sub => (
            <SubmissionRow
              key={sub.submissionId}
              submission={sub}
              expanded={expanded === sub.submissionId}
              onToggle={() =>
                setExpanded(expanded === sub.submissionId ? null : sub.submissionId)
              }
              onGraded={() => load(tab)}
            />
          ))}
        </div>
      )}
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

  return (
    <Card>
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
        <CardContent className="space-y-4 border-t pt-4">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-gray-700">Answers</h4>
            {answerEntries.length === 0 ? (
              <p className="text-sm text-gray-400">No structured answers recorded.</p>
            ) : (
              <ul className="space-y-2">
                {answerEntries.map(([qid, ans]) => (
                  <li key={qid} className="rounded-md bg-gray-50 p-2 text-sm">
                    <span className="font-medium text-gray-500">Q{qid}: </span>
                    <span className="text-gray-800">
                      {typeof ans === 'string' ? ans : JSON.stringify(ans)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[140px_1fr] sm:items-start">
            <div>
              <Label htmlFor={`score-${submission.submissionId}`}>Score (/{submission.maxScore})</Label>
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
