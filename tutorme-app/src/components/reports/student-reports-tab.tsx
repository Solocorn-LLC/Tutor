'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { FileText, Loader2, Send, Plus, Trash2 } from 'lucide-react'

type ReportData = {
  reportId: string
  title: string
  studentName?: string
  createdAt: string
  status: string
  strengths?: string[]
  weaknesses?: string[]
  overallComments?: string
  score?: number | null
}

export function StudentReportsTab() {
  const [reports, setReports] = useState<ReportData[]>([])
  const [loading, setLoading] = useState(true)
  const [editingReport, setEditingReport] = useState<ReportData | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Edit form state
  const [strengths, setStrengths] = useState<string[]>([])
  const [weaknesses, setWeaknesses] = useState<string[]>([])
  const [overallComments, setOverallComments] = useState('')
  const [score, setScore] = useState<number | ''>('')

  useEffect(() => {
    loadReports()
  }, [])

  const loadReports = async () => {
    try {
      const res = await fetch('/api/tutor/reports')
      if (res.ok) {
        const data = await res.json()
        setReports(data.reports || [])
      }
    } catch (err) {
      toast.error('Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  const openEditor = (report: ReportData) => {
    setEditingReport(report)
    setStrengths(report.strengths || [])
    setWeaknesses(report.weaknesses || [])
    setOverallComments(report.overallComments || '')
    setScore(report.score !== null && report.score !== undefined ? report.score : '')
    setModalOpen(true)
  }

  const handleSave = async (sendNow: boolean) => {
    if (!editingReport) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/tutor/reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: editingReport.reportId,
          status: sendNow ? 'sent' : 'draft',
          strengths,
          weaknesses,
          overallComments,
          score: score === '' ? null : Number(score),
        }),
      })

      if (res.ok) {
        toast.success(sendNow ? 'Report sent to student!' : 'Draft saved')
        setModalOpen(false)
        loadReports()
      } else {
        toast.error('Failed to save report')
      }
    } catch (err) {
      toast.error('An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  const addStrength = () => setStrengths([...strengths, ''])
  const updateStrength = (i: number, val: string) => {
    const newArr = [...strengths]
    newArr[i] = val
    setStrengths(newArr)
  }
  const removeStrength = (i: number) => setStrengths(strengths.filter((_, idx) => idx !== i))

  const addWeakness = () => setWeaknesses([...weaknesses, ''])
  const updateWeakness = (i: number, val: string) => {
    const newArr = [...weaknesses]
    newArr[i] = val
    setWeaknesses(newArr)
  }
  const removeWeakness = (i: number) => setWeaknesses(weaknesses.filter((_, idx) => idx !== i))

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Student Reports</h1>
        <p className="text-gray-500">
          Manage requested reports, add feedback, and deploy them to students.
        </p>
      </div>

      <div className="grid gap-4">
        {reports.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-12 text-center text-gray-500">
            No report requests yet.
          </div>
        ) : (
          reports.map(report => (
            <Card key={report.reportId}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5 text-indigo-600" />
                    {report.title}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Requested by <strong>{report.studentName || 'Student'}</strong> on{' '}
                    {new Date(report.createdAt).toLocaleDateString()}
                  </CardDescription>
                </div>
                <Badge
                  variant={
                    report.status === 'sent'
                      ? 'default'
                      : report.status === 'draft'
                        ? 'secondary'
                        : 'outline'
                  }
                  className={report.status === 'sent' ? 'bg-green-100 text-green-800' : ''}
                >
                  {report.status.toUpperCase()}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="flex justify-end">
                  {report.status === 'sent' ? (
                    <Button variant="outline" size="sm" onClick={() => openEditor(report)}>
                      View / Edit Sent Report
                    </Button>
                  ) : (
                    <Button
                      variant="modal-primary"
                      size="sm"
                      onClick={() => openEditor(report)}
                    >
                      Generate & Send
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Editor Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Report: {editingReport?.title}</DialogTitle>
            <DialogDescription>For {editingReport?.studentName || 'Student'}</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Strengths */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-900">Strengths</h4>
                <Button variant="outline" size="sm" onClick={addStrength} className="h-7 text-xs">
                  <Plus className="mr-1 h-3 w-3" /> Add
                </Button>
              </div>
              {strengths.length === 0 && (
                <p className="text-sm italic text-gray-500">No strengths added.</p>
              )}
              {strengths.map((str, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Input
                    value={str}
                    onChange={e => updateStrength(i, e.target.value)}
                    placeholder="E.g., Excellent grasp of algebraic concepts..."
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeStrength(i)}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Weaknesses */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-900">Areas for Improvement</h4>
                <Button variant="outline" size="sm" onClick={addWeakness} className="h-7 text-xs">
                  <Plus className="mr-1 h-3 w-3" /> Add
                </Button>
              </div>
              {weaknesses.length === 0 && (
                <p className="text-sm italic text-gray-500">No weaknesses added.</p>
              )}
              {weaknesses.map((wk, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Input
                    value={wk}
                    onChange={e => updateWeakness(i, e.target.value)}
                    placeholder="E.g., Needs more practice with geometry..."
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeWeakness(i)}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Comments */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-900">Overall Comments</h4>
              <Textarea
                rows={4}
                value={overallComments}
                onChange={e => setOverallComments(e.target.value)}
                placeholder="Provide overall feedback..."
              />
            </div>

            {/* Score */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-900">Overall Score (%)</h4>
              <Input
                type="number"
                min="0"
                max="100"
                value={score}
                onChange={e => setScore(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="E.g., 85"
                className="w-32"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="modal-secondary" onClick={() => handleSave(false)} disabled={isSaving}>
              Save Draft
            </Button>
            <Button
              variant="modal-primary"
              onClick={() => handleSave(true)}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send to Student
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
