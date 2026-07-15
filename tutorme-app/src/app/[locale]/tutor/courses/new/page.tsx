'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { BookOpen, Loader2 } from 'lucide-react'
import { BackButton } from '@/components/navigation'
import { CourseCategoryPicker } from '../components/CourseCategoryPicker'

const DESCRIPTION_LIMIT = 500

export default function CreateCoursePage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [creating, setCreating] = useState(false)
  const [courseName, setCourseName] = useState('')
  const [description, setDescription] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [nameError, setNameError] = useState<string | null>(null)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const descriptionCount = useMemo(() => description.length, [description])

  const validateDetailsStep = () => {
    // Highlight empty required fields inline in red instead of a toast.
    const nErr = !courseName.trim() ? 'Course name is required' : null
    const cErr = categories.length === 0 ? 'Please select a category' : null
    setNameError(nErr)
    setCategoryError(cErr)
    if (nErr || cErr) return false
    if (descriptionCount > DESCRIPTION_LIMIT) {
      toast.error('Description exceeds 500 characters')
      return false
    }
    return true
  }

  const handleConfirm = async () => {
    if (!validateDetailsStep()) return
    setCreating(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch('/api/tutor/courses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
        },
        credentials: 'include',
        body: JSON.stringify({
          title: courseName.trim(),
          description: description.trim() || undefined,
          categories,
          isLiveOnline: false,
        }),
      })

      const data = await res.json().catch(() => ({}))
      const createdCourse = data.courses?.[0]
      if (res.ok && createdCourse?.id) {
        toast.success('Course created! Opening builder...')
        router.push(`/tutor/insights?tab=builder&courseId=${createdCourse.id}`)
      } else {
        const message = data.error || 'Failed to create course. Please try again.'
        toast.error(message)
      }
    } catch {
      toast.error('An error occurred. Please check your connection and try again.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="w-full">
        <BackButton href="/tutor/my-page" className="mb-4" />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-500" />
              Create New Course
            </CardTitle>
            <CardDescription>
              Set your course details and continue to the Course Builder to design your course.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="courseName" className="text-sm font-semibold text-gray-700">
                    Course Name *
                  </Label>
                  <Input
                    id="courseName"
                    value={courseName}
                    onChange={e => {
                      setCourseName(e.target.value)
                      if (nameError) setNameError(null)
                    }}
                    placeholder="e.g. AP Calculus Mastery"
                    disabled={creating}
                    aria-invalid={!!nameError}
                    className={`h-11 focus:ring-blue-500 ${
                      nameError
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-gray-200 focus:border-blue-500'
                    }`}
                  />
                  {nameError && (
                    <p className="text-xs font-medium text-red-600" role="alert">
                      {nameError}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Category *</Label>
                  <div
                    className={`rounded-lg border p-4 ${
                      categoryError ? 'border-red-500' : 'border-gray-200'
                    }`}
                  >
                    <CourseCategoryPicker
                      value={categories}
                      onChange={next => {
                        setCategories(next)
                        if (categoryError) setCategoryError(null)
                      }}
                      storageUserId={session?.user?.id}
                    />
                  </div>
                  {categoryError && (
                    <p className="text-xs font-medium text-red-600" role="alert">
                      {categoryError}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="description" className="text-sm font-semibold text-gray-700">
                      Course Description
                    </Label>
                    <span
                      className={`text-[10px] font-medium uppercase tracking-wider ${descriptionCount > DESCRIPTION_LIMIT ? 'text-red-600' : 'text-gray-400'}`}
                    >
                      {descriptionCount}/{DESCRIPTION_LIMIT}
                    </span>
                  </div>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={e => setDescription(e.target.value.slice(0, DESCRIPTION_LIMIT))}
                    placeholder="Describe the course focus, expected outcomes, and who it is for."
                    rows={6}
                    disabled={creating}
                    className="resize-none border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  variant="outline"
                  className="h-11 flex-1 border-gray-200 text-gray-600 hover:bg-gray-50"
                  asChild
                  disabled={creating}
                >
                  <Link href="/tutor/my-page">Cancel</Link>
                </Button>
                <Button
                  className="h-11 flex-1 bg-blue-600 font-semibold shadow-lg shadow-blue-200 hover:bg-blue-700"
                  onClick={handleConfirm}
                  disabled={creating || !courseName.trim() || categories.length === 0}
                >
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Course & Continue'
                  )}
                </Button>
              </div>
            </>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
