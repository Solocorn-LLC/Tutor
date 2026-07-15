'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { Loader2, Video } from 'lucide-react'

interface CreateClassDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onClassCreated?: (classData?: { id: string; [key: string]: unknown }) => void
  redirectToClass?: boolean
  initialDate?: Date | null
  /** When set, the one-time session is linked to this course (still scheduleId-null). */
  courseId?: string
  courseName?: string
}

/** Build 30-minute time-slot options from 00:00 to 23:30. */
function useTimeOptions() {
  return useMemo(() => {
    const opts: { value: string; label: string }[] = []
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
        const ampm = h < 12 ? 'AM' : 'PM'
        const minute = m.toString().padStart(2, '0')
        const label = `${hour12}:${minute} ${ampm}`
        const value = `${h.toString().padStart(2, '0')}:${minute}`
        opts.push({ value, label })
      }
    }
    return opts
  }, [])
}

export function CreateClassDialog({
  open,
  onOpenChange,
  onClassCreated,
  redirectToClass = true,
  initialDate,
  courseId,
  courseName,
}: CreateClassDialogProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string
    date?: string
    time?: string
  }>({})
  const timeOptions = useTimeOptions()

  const [form, setForm] = useState({
    title: '',
    description: '',
    maxStudents: 50,
    durationMinutes: 60,
    date: '',
    time: '09:00',
  })

  // When launched from a course's sessions modal, prefill title from the
  // course so the form is valid and the one-time session is clearly associated.
  useEffect(() => {
    if (!open || !courseName) return
    setForm(prev => ({
      ...prev,
      title: prev.title || `${courseName} — one-time session`,
    }))
  }, [open, courseName])

  useEffect(() => {
    if (!open || !initialDate) return
    const nextDate = new Date(initialDate)
    nextDate.setHours(9, 0, 0, 0)
    const datePart = format(nextDate, 'yyyy-MM-dd')
    const timePart = format(nextDate, 'HH:mm')
    setForm(prev => {
      if (!prev.date || prev.date !== datePart) {
        return { ...prev, date: datePart, time: timePart }
      }
      return prev
    })
  }, [open, initialDate])

  const handleSubmit = async () => {
    // Highlight every empty required field at once (red + inline) instead of a
    // one-at-a-time toast.
    const errs: { title?: string; date?: string; time?: string } = {}
    if (!form.title.trim()) errs.title = 'Please enter a session title'
    if (!form.date) errs.date = 'Please select a date'
    if (!form.time) errs.time = 'Please select a time'
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})

    setCreating(true)
    setApiError(null)
    try {
      const scheduledDate = new Date(`${form.date}T${form.time}`)
      if (Number.isNaN(scheduledDate.getTime())) {
        const message = 'Please provide a valid date and time.'
        setApiError(message)
        toast.error(message)
        return
      }

      // Use courseName as subject when available; otherwise fall back to title.
      const subject = courseName?.trim() || form.title.trim()

      const res = await fetchWithCsrf('/api/class/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          subject,
          description: form.description,
          maxStudents: form.maxStudents,
          durationMinutes: form.durationMinutes,
          scheduledAt: scheduledDate.toISOString(),
          ...(courseId ? { courseId } : {}),
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
        toast.success('Session created successfully!')
        onOpenChange(false)
        onClassCreated?.(data.session)
        if (redirectToClass && data.session?.id) {
          router.push(`/tutor/classroom?sessionId=${data.session.id}`)
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
        theme="metallic"
        size="lg"
        className="max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl"
        aria-busy={creating}
        aria-describedby={apiError ? 'create-class-api-error' : undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Video className="text-primary h-5 w-5" />
            Create New Session
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Schedule a new live session for your students.
          </DialogDescription>
        </DialogHeader>

        <div className="pt-4">
          <DialogPanel variant="default" className="space-y-4 p-6">
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
                onChange={e => {
                  setForm({ ...form, title: e.target.value })
                  if (fieldErrors.title) setFieldErrors(prev => ({ ...prev, title: undefined }))
                }}
                placeholder="e.g., AP Calculus - Limits"
                disabled={creating}
                errorMessage={fieldErrors.title}
              />
            </div>

            <div>
              <Label className="text-gray-900">Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="What will you cover in this session?"
                disabled={creating}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-900">Date *</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={e => {
                    setForm({ ...form, date: e.target.value })
                    if (fieldErrors.date) setFieldErrors(prev => ({ ...prev, date: undefined }))
                  }}
                  disabled={creating}
                  errorMessage={fieldErrors.date}
                />
              </div>
              <div>
                <Label className="text-gray-900">Time *</Label>
                <Select
                  value={form.time}
                  onValueChange={v => {
                    setForm({ ...form, time: v })
                    if (fieldErrors.time) setFieldErrors(prev => ({ ...prev, time: undefined }))
                  }}
                  disabled={creating}
                >
                  <SelectTrigger
                    aria-invalid={!!fieldErrors.time}
                    className={fieldErrors.time ? 'border-destructive' : undefined}
                  >
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.time && (
                  <p className="text-destructive mt-1 text-xs" role="alert">
                    {fieldErrors.time}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-900">Duration</Label>
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

        <DialogFooter className="gap-3">
          <Button
            variant="modal-secondary-dark"
            onClick={() => handleOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            variant="modal-primary-dark"
            onClick={handleSubmit}
            disabled={creating}
            aria-busy={creating}
          >
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
