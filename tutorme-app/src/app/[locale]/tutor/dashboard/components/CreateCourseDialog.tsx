'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { Loader2 } from 'lucide-react'

interface CreateCourseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCourseCreated?: () => void
}

const MAX_LENGTH = 25

export function CreateCourseDialog({
  open,
  onOpenChange,
  onCourseCreated,
}: CreateCourseDialogProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [courseName, setCourseName] = useState('')
  const [apiError, setApiError] = useState<string | null>(null)

  const charCount = courseName.length
  const isAtLimit = charCount >= MAX_LENGTH
  const isNearLimit = charCount >= 20

  const handleSubmit = async () => {
    const trimmed = courseName.trim()
    if (!trimmed) {
      toast.error('Please enter a course name')
      return
    }

    setCreating(true)
    setApiError(null)
    try {
      const res = await fetchWithCsrf('/api/tutor/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmed,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(data.message ?? 'Course created successfully')
        onOpenChange(false)
        onCourseCreated?.()
        setCourseName('')
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
    if (!next) {
      setApiError(null)
      setCourseName('')
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md border border-slate-200 shadow-2xl"
        aria-busy={creating}
        aria-describedby={apiError ? 'create-course-api-error' : undefined}
      >
        <DialogHeader className="text-center">
          <DialogTitle className="mx-auto text-center text-white">Create New Course</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          {apiError && (
            <p
              id="create-course-api-error"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
              role="alert"
            >
              {apiError}
            </p>
          )}

          <div className="space-y-2">
            <Input
              value={courseName}
              onChange={e => {
                const value = e.target.value
                if (value.length <= MAX_LENGTH) {
                  setCourseName(value)
                  if (apiError) setApiError(null)
                }
              }}
              placeholder="Course name"
              disabled={creating}
              maxLength={MAX_LENGTH}
              className="h-12 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              onKeyDown={e => {
                if (e.key === 'Enter' && courseName.trim() && !creating) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
            />
            <div className="flex justify-end">
              <span
                className={`text-xs font-medium ${
                  isAtLimit ? 'text-red-500' : isNearLimit ? 'text-orange-500' : 'text-gray-400'
                }`}
              >
                {charCount}/{MAX_LENGTH}
              </span>
            </div>
          </div>
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
            disabled={creating || !courseName.trim()}
            aria-busy={creating}
          >
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
