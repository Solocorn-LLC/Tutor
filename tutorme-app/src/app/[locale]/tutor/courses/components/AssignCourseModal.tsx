'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogPanel,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  BookOpen,
  Users,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  BarChart3,
  ArrowRight,
  Loader2,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CourseWithAssignments } from '@/types/course-assignment'
import type { BatchItem } from './course-builder-types'
import { useAssignmentPreview } from '@/hooks/use-course-assignments'
import { getDifficultyMismatchWarning } from '@/lib/difficulty-resolver'
import { CountryFlag } from '@/components/country-flag'

interface AssignCourseModalProps {
  isOpen: boolean
  onClose: () => void
  onAssign: (courseId: string, batchId: string) => Promise<void>
  courses: CourseWithAssignments[]
  batches: BatchItem[]
  preselectedCourseId?: string
  preselectedBatchId?: string
}

const DIFFICULTY_COLORS = {
  beginner: 'bg-green-100 text-green-700 border-green-200',
  intermediate: 'bg-blue-100 text-blue-700 border-blue-200',
  advanced: 'bg-purple-100 text-purple-700 border-purple-200',
}

const DIFFICULTY_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

export function AssignCourseModal({
  isOpen,
  onClose,
  onAssign,
  courses,
  batches,
  preselectedCourseId,
  preselectedBatchId,
}: AssignCourseModalProps) {
  const [selectedCourseId, setSelectedCourseId] = useState(preselectedCourseId || '')
  const [selectedBatchId, setSelectedBatchId] = useState(preselectedBatchId || '')
  const [assigning, setAssigning] = useState(false)
  const [step, setStep] = useState<'select' | 'preview'>('select')

  const { preview, loading: previewLoading, generatePreview, clearPreview } = useAssignmentPreview()

  const selectedCourse = courses.find(c => c.id === selectedCourseId)
  const selectedBatch = batches.find(b => b.id === selectedBatchId)

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedCourseId(preselectedCourseId || '')
      setSelectedBatchId(preselectedBatchId || '')
      setStep('select')
      clearPreview()
    }
  }, [isOpen, preselectedCourseId, preselectedBatchId, clearPreview])

  // Generate preview when both selections are made
  useEffect(() => {
    if (selectedCourseId && selectedBatchId && step === 'preview') {
      generatePreview(selectedCourseId, selectedBatchId)
    }
  }, [selectedCourseId, selectedBatchId, step, generatePreview])

  const mismatchWarning =
    selectedCourse && selectedBatch
      ? getDifficultyMismatchWarning(undefined, selectedBatch.difficulty)
      : null

  const handleAssign = async () => {
    if (!selectedCourseId || !selectedBatchId) return

    setAssigning(true)
    try {
      await onAssign(selectedCourseId, selectedBatchId)
      onClose()
    } finally {
      setAssigning(false)
    }
  }

  const canProceed = selectedCourseId && selectedBatchId

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-500" />
            {step === 'select' ? 'Assign Course to Group' : 'Preview Assignment'}
          </DialogTitle>
        </DialogHeader>

        {step === 'select' ? (
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {/* Course Selection */}
            <DialogPanel className="space-y-2">
              <Label className="text-gray-900">Select Course</Label>
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a course..." />
                </SelectTrigger>
                <SelectContent>
                  {courses.map(course => (
                    <SelectItem key={course.id} value={course.id}>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                          {course.nationality && course.nationality !== 'Global' ? (
                            <>
                              {course.name} —{' '}
                              {course.variantCategory || (course.categories || [])[0] || 'General'}{' '}
                              — <CountryFlag countryName={course.nationality} size="xs" showLabel />
                            </>
                          ) : (
                            course.name
                          )}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {course.stats.moduleCount} modules
                        </Badge>
                        {course.assignments.total > 0 && (
                          <Badge variant="outline" className="text-xs">
                            Assigned to {course.assignments.total} groups
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedCourse && (
                <div className="rounded-lg bg-gray-50 p-3 text-sm">
                  <p className="text-gray-600">{selectedCourse.description}</p>
                  <div className="mt-2 flex gap-4 text-xs text-gray-600">
                    <span>{selectedCourse.stats.moduleCount} modules</span>
                    <span>{selectedCourse.stats.lessonCount} lessons</span>
                    <span>{selectedCourse.stats.quizCount} quizzes</span>
                  </div>
                </div>
              )}
            </DialogPanel>

            {/* Group Selection */}
            <DialogPanel className="space-y-2">
              <Label className="text-gray-900">Select Group</Label>
              <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a group..." />
                </SelectTrigger>
                <SelectContent>
                  {batches.map(batch => (
                    <SelectItem key={batch.id} value={batch.id}>
                      <div className="flex items-center gap-2">
                        <span>{batch.name}</span>
                        <Badge className={cn('text-xs', DIFFICULTY_COLORS[batch.difficulty])}>
                          {DIFFICULTY_LABELS[batch.difficulty]}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {batch.enrollmentCount} students
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedBatch && (
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-600" />
                    <span className="text-sm text-gray-900">
                      {selectedBatch.enrollmentCount} students enrolled
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-gray-600" />
                    <span className="text-sm text-gray-900">Difficulty: </span>
                    <Badge className={cn('text-xs', DIFFICULTY_COLORS[selectedBatch.difficulty])}>
                      {DIFFICULTY_LABELS[selectedBatch.difficulty]}
                    </Badge>
                  </div>
                </div>
              )}
            </DialogPanel>

            {/* Mismatch Warning */}
            {mismatchWarning && (
              <DialogPanel>
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-sm text-amber-700">
                    {mismatchWarning}
                  </AlertDescription>
                </Alert>
              </DialogPanel>
            )}
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {/* Assignment Summary */}
            <DialogPanel>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {selectedCourse?.nationality && selectedCourse.nationality !== 'Global' ? (
                        <span className="inline-flex items-center gap-1">
                          {selectedCourse.name} —{' '}
                          {selectedCourse.variantCategory ||
                            (selectedCourse.categories || [])[0] ||
                            'General'}{' '}
                          —{' '}
                          <CountryFlag
                            countryName={selectedCourse.nationality}
                            size="xs"
                            showLabel
                          />
                        </span>
                      ) : (
                        selectedCourse?.name
                      )}
                    </p>
                    <p className="text-xs text-gray-600">Course</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{selectedBatch?.name}</p>
                    <p className="text-xs text-gray-600">
                      {DIFFICULTY_LABELS[selectedBatch?.difficulty || 'beginner']} Group
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep('select')}>
                  Change
                </Button>
              </div>
            </DialogPanel>

            {/* Preview Content */}
            {previewLoading ? (
              <DialogPanel>
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <span className="ml-2 text-gray-600">Generating preview...</span>
                </div>
              </DialogPanel>
            ) : preview ? (
              <>
                {/* Resolution Stats */}
                <DialogPanel>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="rounded-lg bg-gray-50 p-3 text-center">
                      <p className="text-2xl font-bold text-gray-900">
                        {preview.resolution.totalModules}
                      </p>
                      <p className="text-xs text-gray-600">Total Modules</p>
                    </div>
                    <div className="rounded-lg bg-green-50 p-3 text-center">
                      <p className="text-2xl font-bold text-green-600">
                        {preview.resolution.visibleModules}
                      </p>
                      <p className="text-xs text-gray-600">Visible</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-3 text-center">
                      <p className="text-2xl font-bold text-amber-600">
                        {preview.resolution.adaptedContent}
                      </p>
                      <p className="text-xs text-gray-600">Adapted</p>
                    </div>
                    <div className="rounded-lg bg-red-50 p-3 text-center">
                      <p className="text-2xl font-bold text-red-600">
                        {preview.resolution.hiddenModules}
                      </p>
                      <p className="text-xs text-gray-600">Hidden</p>
                    </div>
                  </div>
                </DialogPanel>

                {/* Hidden Items Warning */}
                {preview.hiddenItems.length > 0 && (
                  <DialogPanel>
                    <Alert variant="destructive" className="border-red-200 bg-red-50">
                      <EyeOff className="h-4 w-4 text-red-600" />
                      <AlertDescription>
                        <p className="mb-1 font-medium text-red-700">
                          {preview.hiddenItems.length} items will be hidden
                        </p>
                        <p className="text-sm text-red-600">
                          These items are fixed to difficulty levels that don&apos;t match this
                          group.
                        </p>
                      </AlertDescription>
                    </Alert>
                  </DialogPanel>
                )}

                {/* Adapted Items */}
                {preview.adaptedItems.length > 0 && (
                  <DialogPanel className="space-y-2">
                    <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <Info className="h-4 w-4" />
                      Content Adaptations
                    </h4>
                    <ScrollArea className="h-40 rounded-lg border p-3">
                      <div className="space-y-2">
                        {preview.adaptedItems.map((item, idx) => (
                          <div key={idx} className="rounded bg-gray-50 p-2 text-sm">
                            <p className="font-medium text-gray-900">{item.title}</p>
                            <p className="text-xs text-gray-600">
                              {item.field}: {item.originalValue} → {item.adaptedValue}
                            </p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </DialogPanel>
                )}

                {/* Success Note */}
                <DialogPanel>
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-sm text-green-700">
                      Course content will automatically adapt to match the group&apos;s
                      <strong> {selectedBatch?.difficulty}</strong> difficulty level.
                    </AlertDescription>
                  </Alert>
                </DialogPanel>
              </>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-3">
          {step === 'select' ? (
            <>
              <Button variant="modal-secondary-dark" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="modal-primary-dark"
                onClick={() => setStep('preview')}
                disabled={!canProceed}
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                Preview Assignment
              </Button>
            </>
          ) : (
            <>
              <Button variant="modal-secondary-dark" onClick={() => setStep('select')}>
                Back
              </Button>
              <Button
                variant="modal-primary-dark"
                onClick={handleAssign}
                disabled={assigning}
                className="gap-2"
              >
                {assigning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirm Assignment
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
