'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { Loader2, BookOpen, Plus, X } from 'lucide-react'

interface CreateCourseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCourseCreated?: () => void
}

export function CreateCourseDialog({
  open,
  onOpenChange,
  onCourseCreated,
}: CreateCourseDialogProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [categoryInput, setCategoryInput] = useState('')
  const [subjects, setSubjects] = useState<string[]>([])
  const [subjectInput, setSubjectInput] = useState('')
  const [form, setForm] = useState({
    subject: '',
    description: '',
    isLiveOnline: false,
  })
  const [generatingDescription, setGeneratingDescription] = useState(false)

  const subjectLabel = form.subject || subjects[0] || 'Course'

  const derivedSubjects = useMemo(() => {
    const subjectSet = new Set<string>()
    const subjectMap: Array<{ key: string; label: string }> = [
      { key: 'math', label: 'Mathematics' },
      { key: 'calculus', label: 'Mathematics' },
      { key: 'algebra', label: 'Mathematics' },
      { key: 'statistics', label: 'Mathematics' },
      { key: 'english', label: 'English' },
      { key: 'ielts', label: 'English' },
      { key: 'toefl', label: 'English' },
      { key: 'cambridge', label: 'English' },
      { key: 'duolingo', label: 'English' },
      { key: 'physics', label: 'Physics' },
      { key: 'chemistry', label: 'Chemistry' },
      { key: 'biology', label: 'Biology' },
      { key: 'history', label: 'History' },
      { key: 'computer', label: 'Computer Science' },
      { key: 'coding', label: 'Computer Science' },
      { key: 'economics', label: 'Economics' },
      { key: 'business', label: 'Business' },
      { key: 'finance', label: 'Business' },
    ]

    categories.forEach(category => {
      const normalized = category.toLowerCase()
      subjectMap.forEach(entry => {
        if (normalized.includes(entry.key)) subjectSet.add(entry.label)
      })
    })

    subjects.forEach(subject => subjectSet.add(subject))
    return Array.from(subjectSet)
  }, [categories, subjects])

  const selectedCategories = categories.filter(Boolean)
  const allSubjects = derivedSubjects.length ? derivedSubjects : subjects

  const handleAddCategory = () => {
    const trimmed = categoryInput.trim()
    if (!trimmed) return
    setCategories(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]))
    setCategoryInput('')
  }

  const handleAddSubject = () => {
    const trimmed = subjectInput.trim()
    if (!trimmed) return
    setSubjects(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]))
    setForm(prev => ({ ...prev, subject: trimmed }))
    setSubjectInput('')
  }

  useEffect(() => {
    if (!open) return
    let isMounted = true
    const loadCategories = async () => {
      try {
        const res = await fetch('/api/user/profile', { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        const next = Array.isArray(data?.profile?.specialties) ? data.profile.specialties : []
        if (isMounted && next.length) {
          setCategories(next)
        }
      } catch {
        // ignore, user can add manually
      }
    }
    void loadCategories()
    return () => {
      isMounted = false
    }
  }, [open])

  const handleSubmit = async () => {
    if (!form.subject) {
      toast.error('Please select a subject')
      return
    }

    const titleBase = subjectLabel || 'Course'
    const categoryLabel = selectedCategories.length ? selectedCategories.join(', ') : ''
    const title = [titleBase, categoryLabel].filter(Boolean).join(' - ').slice(0, 200)
    setCreating(true)
    setApiError(null)
    try {
      const res = await fetchWithCsrf('/api/tutor/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: form.description.trim() || undefined,
          subject: form.subject,

          isLiveOnline: form.isLiveOnline,
          categories: selectedCategories,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(data.message ?? 'Course created successfully')
        onOpenChange(false)
        onCourseCreated?.()
        setForm({ subject: '', description: '', isLiveOnline: false })
        setCategories([])
        setSubjects([])
        setCategoryInput('')
        setSubjectInput('')
        const createdCourse = data.courses?.[0]
        if (createdCourse?.id) {
          router.push(`/tutor/insights?tab=builder&courseId=${createdCourse.id}`)
        }
      } else {
        const message = data.error || 'Failed to create course. Please try again.'
        setApiError(message)
        toast.error(message)
      }
    } catch {
      const message = 'An error occurred. Please check your connection and try again.'
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
        className="border border-slate-200 shadow-2xl sm:max-w-[500px]"
        aria-busy={creating}
        aria-describedby={apiError ? 'create-course-api-error' : undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <BookOpen className="text-primary h-5 w-5" />
            New session
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Create a whole course (course) with modules and lessons. You can add more modules and
            lessons after creation.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4">
          <DialogPanel className="space-y-4">
            {apiError && (
              <p
                id="create-course-api-error"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
                role="alert"
              >
                {apiError}
              </p>
            )}

            <div className="space-y-3">
              <Label className="text-gray-900">Categories (from your tutor registration)</Label>
              <div className="flex flex-wrap gap-2">
                {selectedCategories.length === 0 && (
                  <p className="text-sm text-gray-600">No categories selected yet.</p>
                )}
                {selectedCategories.map(category => (
                  <span
                    key={category}
                    className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700"
                  >
                    {category}
                    <button
                      type="button"
                      onClick={() => setCategories(prev => prev.filter(c => c !== category))}
                      className="text-blue-400 hover:text-blue-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={categoryInput}
                  onChange={e => setCategoryInput(e.target.value)}
                  placeholder="Add a category"
                  disabled={creating}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCategory}
                  disabled={creating}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-900">Subject *</Label>
              <Select value={form.subject} onValueChange={v => setForm({ ...form, subject: v })}>
                <SelectTrigger disabled={creating}>
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {allSubjects.map(subject => (
                    <SelectItem key={subject} value={subject}>
                      {subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  value={subjectInput}
                  onChange={e => setSubjectInput(e.target.value)}
                  placeholder="Add a subject"
                  disabled={creating}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddSubject}
                  disabled={creating}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              </div>
              <p className="text-xs text-gray-600">
                Subjects are suggested from your categories. You can add more.
              </p>
            </div>

            <div>
              <Label className="text-gray-900">Description</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={creating || generatingDescription || !form.subject}
                  onClick={async () => {
                    setGeneratingDescription(true)
                    try {
                      const res = await fetch('/api/courses/generate-description', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                          subject: form.subject,
                        }),
                      })
                      const data = await res.json()
                      if (res.ok && data.description) {
                        setForm(f => ({ ...f, description: data.description }))
                        toast.success('Description generated')
                      } else {
                        toast.error(data.error ?? 'Failed to generate description')
                      }
                    } catch {
                      toast.error('Failed to generate description')
                    } finally {
                      setGeneratingDescription(false)
                    }
                  }}
                >
                  {generatingDescription && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Generate description
                </Button>
              </div>
              <Textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="AI-generated or write your own. What will students learn?"
                disabled={creating}
                rows={3}
                className="mt-2"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isLiveOnline"
                checked={form.isLiveOnline}
                onChange={e => setForm({ ...form, isLiveOnline: e.target.checked })}
                disabled={creating}
                className="rounded"
              />
              <Label htmlFor="isLiveOnline" className="text-gray-900">
                Make course live/online so students can join now (uncheck to keep offline for later)
              </Label>
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
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
