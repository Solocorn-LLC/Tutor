'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BookOpen, BarChart3, SignalLow, Signal, SignalHigh, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lesson, DifficultyLevel, DifficultyVariant, DifficultyMode } from './builder-types'
import { DEFAULT_LESSON } from './builder-utils'

interface LessonBuilderModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: any) => void
  initialData?: any
  allLessons?: Lesson[]
}

export function LessonBuilderModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  allLessons = [],
}: LessonBuilderModalProps) {
  const [data, setData] = useState<Lesson>(initialData || DEFAULT_LESSON(0))
  const [activeVariant, setActiveVariant] = useState<DifficultyLevel>('beginner')

  const updateVariant = (level: DifficultyLevel, updates: Partial<DifficultyVariant>) => {
    setData({
      ...data,
      variants: {
        ...data.variants,
        [level]: { ...data.variants?.[level], ...updates },
      },
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-green-500" />
            Lesson Builder
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Difficulty Mode Section */}
          <div className="space-y-3 rounded-lg border border-blue-400 bg-blue-50 p-4">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              Difficulty Settings
            </Label>

            <Select
              value={data.difficultyMode}
              onValueChange={(v: DifficultyMode) => setData({ ...data, difficultyMode: v })}
            >
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">📋 All Levels (Same content for everyone)</SelectItem>
                <SelectItem value="fixed">🎯 Fixed Level (Only for specific level)</SelectItem>
                <SelectItem value="adaptive">🔄 Adaptive (Different content per level)</SelectItem>
              </SelectContent>
            </Select>

            {/* Fixed Difficulty Selector */}
            {data.difficultyMode === 'fixed' && (
              <div className="space-y-2">
                <Label className="text-xs">Select Fixed Level</Label>
                <div className="flex gap-2">
                  {(['beginner', 'intermediate', 'advanced'] as const).map(level => (
                    <button
                      key={level}
                      onClick={() => setData({ ...data, fixedDifficulty: level })}
                      className={cn(
                        'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all',
                        data.fixedDifficulty === level
                          ? level === 'beginner'
                            ? 'border-green-500 bg-green-500 text-white'
                            : level === 'intermediate'
                              ? 'border-blue-500 bg-blue-500 text-white'
                              : 'border-purple-500 bg-purple-500 text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                      )}
                    >
                      {level === 'beginner' && <SignalLow className="mr-1 inline h-4 w-4" />}
                      {level === 'intermediate' && <Signal className="mr-1 inline h-4 w-4" />}
                      {level === 'advanced' && <SignalHigh className="mr-1 inline h-4 w-4" />}
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Variants Editor (Adaptive Mode) */}
            {data.difficultyMode === 'adaptive' && (
              <div className="space-y-3 pt-2">
                <Label className="text-xs">Customize for each level:</Label>
                <div className="flex gap-2">
                  {(['beginner', 'intermediate', 'advanced'] as const).map(level => (
                    <button
                      key={level}
                      onClick={() => setActiveVariant(level)}
                      className={cn(
                        'flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-all',
                        activeVariant === level
                          ? level === 'beginner'
                            ? 'border-green-300 bg-green-100 text-green-700'
                            : level === 'intermediate'
                              ? 'border-blue-300 bg-blue-100 text-blue-700'
                              : 'border-purple-300 bg-purple-100 text-purple-700'
                          : 'border-gray-400 bg-white text-gray-600'
                      )}
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                      {data.variants?.[level]?.enabled && <Check className="ml-1 inline h-3 w-3" />}
                    </button>
                  ))}
                </div>

                {/* Variant Editor for Active Level */}
                <div className="space-y-3 rounded-lg border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'text-sm font-medium capitalize',
                        activeVariant === 'beginner'
                          ? 'text-green-700'
                          : activeVariant === 'intermediate'
                            ? 'text-blue-700'
                            : 'text-purple-700'
                      )}
                    >
                      {activeVariant} Version
                    </span>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={data.variants?.[activeVariant]?.enabled ?? false}
                        onCheckedChange={checked =>
                          updateVariant(activeVariant, { enabled: checked })
                        }
                      />
                      <Label className="text-xs">Enable variant</Label>
                    </div>
                  </div>

                  {data.variants?.[activeVariant]?.enabled && (
                    <div className="space-y-2">
                      <Input
                        placeholder={`${activeVariant} title (optional)`}
                        value={data.variants?.[activeVariant]?.title || ''}
                        onChange={(e: any) =>
                          updateVariant(activeVariant, { title: e.target.value })
                        }
                      />
                      <AutoTextarea
                        placeholder={`${activeVariant} description (optional)`}
                        value={data.variants?.[activeVariant]?.description || ''}
                        onChange={(e: any) =>
                          updateVariant(activeVariant, { description: e.target.value })
                        }
                        rows={2}
                      />
                      <Input
                        type="number"
                        placeholder={`${activeVariant} duration in minutes`}
                        value={data.variants?.[activeVariant]?.duration || ''}
                        onChange={(e: any) =>
                          updateVariant(activeVariant, {
                            duration: parseInt(e.target.value) || undefined,
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Lesson Title *</Label>
            <Input
              value={data.title}
              onChange={(e: any) => setData({ ...data, title: e.target.value })}
              placeholder="Enter lesson title (base version)"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <AutoTextarea
              value={data.description}
              onChange={(e: any) => setData({ ...data, description: e.target.value })}
              placeholder="Brief overview of this lesson (base version)"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 rounded-xl bg-white/30 p-4 shadow-sm backdrop-blur-sm">
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                value={data.duration}
                onChange={(e: any) =>
                  setData({ ...data, duration: parseInt(e.target.value) || 45 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex items-center gap-2 pt-2">
                <Switch
                  checked={data.isPublished}
                  onCheckedChange={checked => setData({ ...data, isPublished: checked })}
                />
                <Label className="text-sm">Published</Label>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(data)}>Save Lesson</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
