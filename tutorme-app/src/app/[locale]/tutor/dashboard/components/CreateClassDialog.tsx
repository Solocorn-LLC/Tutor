'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { Loader2 } from 'lucide-react'

const SUBJECTS = [
  { value: 'math', label: 'Mathematics' },
  { value: 'physics', label: 'Physics' },
  { value: 'chemistry', label: 'Chemistry' },
  { value: 'biology', label: 'Biology' },
  { value: 'english', label: 'English' },
  { value: 'history', label: 'History' },
  { value: 'cs', label: 'Computer Science' },
  { value: 'ielts', label: 'IELTS' },
  { value: 'toefl', label: 'TOEFL' },
]

interface CreateClassDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onClassCreated?: (classData?: { id: string; [key: string]: unknown }) => void
  redirectToClass?: boolean
  initialDate?: Date | null
}

export function CreateClassDialog({
  open,
  onOpenChange,
  onClassCreated,
  redirectToClass = true,
  initialDate,
}: CreateClassDialogProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    subject: '',
    description: '',
    maxStudents: 50,
    durationMinutes: 60,
    scheduledAt: '',
  })

  useEffect(() => {
    if (!open || !initialDate) return
    const nextDate = new Date(initialDate)
    nextDate.setHours(9, 0, 0, 0)
    const nextValue = format(nextDate, "yyyy-MM-dd'T'HH:mm")
    setForm(prev => {
      const currentDatePart = prev.scheduledAt.split('T')[0]
      const nextDatePart = nextValue.split('T')[0]
      if (!prev.scheduledAt || currentDatePart !== nextDatePart) {
        return { ...prev, scheduledAt: nextValue }
      }
      return prev
    })
  }, [open, initialDate])

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error('Please enter a class title')
      return
    }
    if (!form.subject) {
      toast.error('Please select a subject')
      return
    }
    if (!form.scheduledAt) {
      toast.error('Please select date and time')
      return
    }

    setCreating(true)
    setApiError(null)
    try {
      const scheduledDate = new Date(form.scheduledAt)
      if (Number.isNaN(scheduledDate.getTime())) {
        const message = 'Please provide a valid date and time.'
        setApiError(message)
        toast.error(message)
        return
      }

      const res = await fetchWithCsrf('/api/class/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          subject: form.subject,
          description: form.description,
          maxStudents: form.maxStudents,
          durationMinutes: form.durationMinutes,
          scheduledAt: scheduledDate.toISOString(),
        }),
      })

      const raw = await res.text()
      let data: { error?: string; session?: { id: string } } = {}
      if (raw) {
        try {
          data = JSON.parse(raw) as { error?: string; session?: { id: string } }
        } catch {
          data = { error: `Request failed (${res.status}): ${raw.slice(0, 180)}` }
        }
      }
      if (res.ok) {
        toast.success('Class created successfully!')
        onOpenChange(false)
        onClassCreated?.(data.session)
        if (redirectToClass && data.session?.id) {
          router.push(`/tutor/insights?sessionId=${data.session.id}`)
        }
      } else {
        const message = data.error || 'Room creation failed. Please try again.'
        setApiError(message)
        toast.error(message)
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'An error occurred. Please check your connection and try again.'
      setApiError(message)
      toast.error(message)
    } finally {
      setCreating(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (creating) return
    if (!next) setApiError(null)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[500px]"
        aria-busy={creating}
        aria-describedby={apiError ? 'create-class-api-error' : undefined}
      >
        <DialogHeader>
          <DialogTitle>Create New Class</DialogTitle>
          <DialogDescription>
            Schedule a new live class session for your students.
          </DialogDescription>
        </DialogHeader>
        <div className="pt-4">
          <div className="rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white p-6 text-[#1F2933] shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
            <DialogPanel className="space-y-4">
              {apiError && (
                <p
                  id="create-class-api-error"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
                  role="alert"
                >
                  {apiError}
                </p>
              )}
              <div>
                <Label className="text-gray-900">Class Title *</Label>
                <Input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g., AP Calculus - Limits"
                  disabled={creating}
                  aria-invalid={!!apiError}
                />
              </div>
              <div>
                <Label className="text-gray-900">Subject *</Label>
                <Select value={form.subject} onValueChange={v => setForm({ ...form, subject: v })}>
                  <SelectTrigger disabled={creating}>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map(s => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-900">Description</Label>
                <Textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="What will you cover in this class?"
                  disabled={creating}
                />
              </div>
              <div>
                <Label className="text-gray-900">Date & Time *</Label>
                <Input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={e => setForm({ ...form, scheduledAt: e.target.value })}
                  disabled={creating}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-900">Duration (minutes)</Label>
                  <Select
                    value={form.durationMinutes.toString()}
                    onValueChange={v => setForm({ ...form, durationMinutes: parseInt(v) })}
                  >
                    <SelectTrigger disabled={creating}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="90">1.5 hours</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-900">Max Students</Label>
                  <Select
                    value={form.maxStudents.toString()}
                    onValueChange={v => setForm({ ...form, maxStudents: parseInt(v) })}
                  >
                    <SelectTrigger disabled={creating}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 students</SelectItem>
                      <SelectItem value="25">25 students</SelectItem>
                      <SelectItem value="50">50 students</SelectItem>
                      <SelectItem value="100">100 students</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </DialogPanel>
          </div>
        </div>
        <DialogFooter className="gap-3">
          <Button
            variant="modal-secondary"
            onClick={() => handleOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            variant="modal-primary"
            onClick={handleSubmit}
            disabled={creating}
            aria-busy={creating}
          >
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Class
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
