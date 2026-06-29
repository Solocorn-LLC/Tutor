'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Layers, Plus } from 'lucide-react'
import type { Lesson, CourseBuilderNode } from './builder-types'

/** Sentinel passed to `onConfirm` (as both ids) when the tutor chooses to load
 *  into a brand-new lesson rather than an existing one. */
export const NEW_LESSON_VALUE = '__new_lesson__'

export interface LessonSelectorDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (moduleId: string, lessonId: string) => void
  nodes: CourseBuilderNode[]
  itemType?: string
  /** When true, offers a "New lesson" option; choosing it calls onConfirm with
   *  NEW_LESSON_VALUE for both ids so the caller can create the lesson. */
  allowNewLesson?: boolean
}

export function LessonSelectorDialog({
  isOpen,
  onClose,
  onConfirm,
  nodes,
  itemType = 'item',
  allowNewLesson = false,
}: LessonSelectorDialogProps) {
  const [selectedCourseBuilderNodeId, setSelectedCourseBuilderNodeId] = useState<string>('')
  const [selectedLessonId, setSelectedLessonId] = useState<string>('')

  const selectedCourseBuilderNode = nodes.find(m => m.id === selectedCourseBuilderNodeId)
  const lessons = selectedCourseBuilderNode?.lessons || []

  useEffect(() => {
    if (isOpen) {
      // Auto-select first module and lesson if available
      if (nodes.length > 0 && !selectedCourseBuilderNodeId) {
        setSelectedCourseBuilderNodeId(nodes[0].id)
        if (nodes[0].lessons.length > 0) {
          setSelectedLessonId(nodes[0].lessons[0].id)
        }
      }
    }
  }, [isOpen, nodes, selectedCourseBuilderNodeId])

  const isNewLesson = selectedCourseBuilderNodeId === NEW_LESSON_VALUE

  const handleConfirm = () => {
    if (isNewLesson) {
      onConfirm(NEW_LESSON_VALUE, NEW_LESSON_VALUE)
      onClose()
      return
    }
    if (selectedCourseBuilderNodeId && selectedLessonId) {
      onConfirm(selectedCourseBuilderNodeId, selectedLessonId)
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-500" />
            Select Target Lesson
          </DialogTitle>
        </DialogHeader>
        <div className="pt-4">
          <div className="space-y-4 rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white p-6 text-[#1F2933] shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
            <p className="text-sm font-medium text-slate-700">
              Choose which lesson to save this {itemType} to:
            </p>

            <div className="space-y-2">
              <Label>Lesson</Label>
              <Select
                value={selectedCourseBuilderNodeId}
                onValueChange={value => {
                  setSelectedCourseBuilderNodeId(value)
                  const selectedMod = nodes.find(m => m.id === value)
                  if (selectedMod && selectedMod.lessons.length > 0) {
                    setSelectedLessonId(selectedMod.lessons[0].id)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a lesson" />
                </SelectTrigger>
                <SelectContent>
                  {allowNewLesson && (
                    <SelectItem value={NEW_LESSON_VALUE}>
                      <span className="flex items-center gap-1.5 font-medium text-blue-600">
                        <Plus className="h-3.5 w-3.5" />
                        New lesson
                      </span>
                    </SelectItem>
                  )}
                  {nodes.map(module => (
                    <SelectItem key={module.id} value={module.id}>
                      {module.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isNewLesson && lessons.length > 0 && (
              <div className="space-y-2">
                <Label>Lesson</Label>
                <Select value={selectedLessonId} onValueChange={setSelectedLessonId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a lesson" />
                  </SelectTrigger>
                  <SelectContent>
                    {lessons.map(topic => (
                      <SelectItem key={topic.id} value={topic.id}>
                        {topic.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="modal-secondary-dark" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="modal-primary-dark"
            onClick={handleConfirm}
            disabled={isNewLesson ? false : !selectedCourseBuilderNodeId || !selectedLessonId}
          >
            {isNewLesson ? 'Load to New Lesson' : 'Save to Selected Lesson'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
