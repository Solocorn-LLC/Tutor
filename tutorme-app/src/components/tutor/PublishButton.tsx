'use client'

import { useState } from 'react'
import { Globe, EyeOff, Loader2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { PublishValidationChecklist, usePublishValidation } from './PublishValidationChecklist'
import { cn } from '@/lib/utils'

interface CourseModule {
  id: string
  lessons: { id: string }[]
}

interface Course {
  id: string
  name: string | null
  description: string | null
  categories?: string[] | null
  price: number | null
  currency: string | null
  isPublished: boolean
  modules: CourseModule[]
}

interface PublishButtonProps {
  course: Course
  onPublishChange?: (isPublished: boolean) => void
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
  showLabel?: boolean
}

export function PublishButton({
  course,
  onPublishChange,
  variant = 'default',
  size = 'default',
  className,
  showLabel = true,
}: PublishButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const { canPublish, missingRequirements } = usePublishValidation(course)
  const [resultDialogOpen, setResultDialogOpen] = useState(false)
  const [publishResult, setPublishResult] = useState<{
    kind: 'success' | 'error'
    title: string
    description: string
  } | null>(null)

  const handlePublishToggle = async () => {
    // If trying to publish and can't, show dialog with requirements
    if (!course.isPublished && !canPublish) {
      setIsDialogOpen(true)
      return
    }

    // If trying to unpublish, show confirmation
    if (course.isPublished) {
      setIsDialogOpen(true)
      return
    }

    // Proceed with publishing
    await togglePublish()
  }

  const togglePublish = async () => {
    setIsLoading(true)
    try {
      // Get CSRF token
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const newStatus = !course.isPublished
      const res = await fetch(`/api/tutor/courses/${course.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ isPublished: newStatus }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `Failed to ${newStatus ? 'publish' : 'unpublish'} course`)
      }

      toast.success(
        newStatus
          ? 'Course published! Students can now discover and enroll.'
          : 'Course unpublished. It will no longer be visible to students.'
      )

      onPublishChange?.(newStatus)
      setIsDialogOpen(false)
      setPublishResult({
        kind: 'success',
        title: newStatus ? 'Course published' : 'Course unpublished',
        description: newStatus
          ? 'Your course is now visible to students.'
          : 'Your course is now hidden from students.',
      })
      setResultDialogOpen(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred'
      toast.error(message)
      setPublishResult({
        kind: 'error',
        title: 'Could not update course status',
        description: message,
      })
      setIsDialogOpen(false)
      setResultDialogOpen(true)
    } finally {
      setIsLoading(false)
    }
  }

  const actionButton = course.isPublished ? (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size={size}
          className={cn('gap-2', className)}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
          {showLabel && 'Unpublish'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Unpublish Course?
          </DialogTitle>
          <DialogDescription>
            This will hide your course from students. Existing enrollments will remain active, but
            new students won&apos;t be able to find or enroll in this course.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="modal-secondary" onClick={() => setIsDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={togglePublish} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Unpublish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={cn('gap-2', className)}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
          {showLabel && 'Publish'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Publish Course</DialogTitle>
          <DialogDescription>
            Review the requirements before publishing your course.
          </DialogDescription>
        </DialogHeader>

        <PublishValidationChecklist
          course={{
            id: course.id,
            name: course.name,
            description: course.description,
            categories: course.categories,
            price: course.price,
            currency: course.currency,
            modules: course.modules,
          }}
          className="py-4"
        />

        {!canPublish && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">
              <strong>Cannot publish yet.</strong> Please complete all requirements marked with *
              above.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="modal-secondary" onClick={() => setIsDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="modal-primary" onClick={togglePublish} disabled={isLoading || !canPublish}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Publish Course
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return (
    <>
      {actionButton}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {publishResult?.kind === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              {publishResult?.title ?? 'Updated'}
            </DialogTitle>
            <DialogDescription>{publishResult?.description ?? ''}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="modal-secondary" onClick={() => setResultDialogOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function PublishStatusBadge({ isPublished }: { isPublished: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        isPublished ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', isPublished ? 'bg-green-500' : 'bg-slate-400')}
      />
      {isPublished ? 'Published' : 'Draft'}
    </span>
  )
}
