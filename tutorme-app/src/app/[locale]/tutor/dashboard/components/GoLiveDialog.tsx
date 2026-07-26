import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogPanel,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

type GoLiveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmTeaching?: () => Promise<void>
  onConfirmTeachingUnpublished?: (courseId: string, description: string) => Promise<void>
  unpublishedCourses?: { id: string; name: string }[]
  onConfirmTraining: (data: {
    token: string
    targetAudience: string
    category: string
  }) => Promise<void>
}

export function GoLiveDialog({
  open,
  onOpenChange,
  onConfirmTeaching,
  onConfirmTeachingUnpublished,
  unpublishedCourses,
  onConfirmTraining,
}: GoLiveDialogProps) {
  const [sessionType, setSessionType] = useState<'teaching' | 'training'>('teaching')
  const [loading, setLoading] = useState(false)

  // Teaching fields (only used when a dashboard caller provides unpublished courses)
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [description, setDescription] = useState('')

  // Training fields
  const [token, setToken] = useState('')
  const [targetAudience, setTargetAudience] = useState('all')
  const [category, setCategory] = useState('orientation')

  const handleConfirm = async () => {
    setLoading(true)
    try {
      if (sessionType === 'teaching') {
        if (unpublishedCourses && unpublishedCourses.length > 0) {
          await onConfirmTeachingUnpublished?.(selectedCourseId, description)
        } else {
          await onConfirmTeaching?.()
        }
      } else {
        await onConfirmTraining({ token, targetAudience, category })
      }
      onOpenChange(false)
    } catch (_err) {
      // Error is handled by parent (e.g. toast)
    } finally {
      setLoading(false)
    }
  }

  const confirmDisabled =
    loading ||
    (sessionType === 'training' && !token) ||
    (sessionType === 'teaching' &&
      Boolean(unpublishedCourses && unpublishedCourses.length > 0 && !selectedCourseId))

  return (
    <Dialog
      open={open}
      onOpenChange={isOpen => {
        onOpenChange(isOpen)
      }}
    >
      <DialogContent className="max-w-md border border-slate-200 shadow-2xl">
        <DialogHeader className="text-center">
          <DialogTitle className="mx-auto text-center text-white">Create a Class</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          <RadioGroup
            value={sessionType}
            onValueChange={v => setSessionType(v as 'teaching' | 'training')}
            className="flex flex-col space-y-4"
          >
            <DialogPanel
              className="flex cursor-pointer flex-col space-y-2 hover:bg-gray-50"
              onClick={() => setSessionType('teaching')}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="teaching" id="teaching" />
                <Label htmlFor="teaching" className="flex-1 cursor-pointer">
                  <div className="text-base font-semibold text-gray-900">Create a demo class</div>
                  <div className="mt-1 text-sm font-normal text-gray-600">
                    Create a demo lesson for your course.
                  </div>
                </Label>
              </div>
              {sessionType === 'teaching' &&
                unpublishedCourses &&
                unpublishedCourses.length > 0 && (
                  <div className="ml-6 space-y-2 pt-2">
                    <Label className="text-gray-900">Select an unpublished course</Label>
                    <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a course" />
                      </SelectTrigger>
                      <SelectContent>
                        {unpublishedCourses.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="space-y-2 pt-2">
                      <Label className="text-gray-900">Description</Label>
                      <Textarea
                        value={description}
                        onChange={e => {
                          const val = e.target.value
                          if (val.length <= 200) setDescription(val)
                        }}
                        placeholder="Describe what this demo will cover"
                        rows={2}
                        maxLength={200}
                        className="resize-none"
                      />
                      <p className="text-right text-xs text-gray-500">{description.length}/200</p>
                    </div>
                  </div>
                )}
              {sessionType === 'teaching' &&
                unpublishedCourses &&
                unpublishedCourses.length === 0 && (
                  <div className="ml-6 pt-2 text-sm text-gray-500">
                    No unpublished courses available.
                  </div>
                )}
            </DialogPanel>
            <DialogPanel
              className="flex cursor-pointer flex-col space-y-2 hover:bg-gray-50"
              onClick={() => setSessionType('training')}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="training" id="training" />
                <Label htmlFor="training" className="flex-1 cursor-pointer">
                  <div className="text-base font-semibold text-gray-900">
                    Create a Scheduled Class
                  </div>
                  <div className="mt-1 text-sm font-normal text-gray-600">
                    Schedule a single session for single topic classes, practice papers, and other
                    specialized lessons.
                  </div>
                </Label>
              </div>
              {sessionType === 'training' && (
                <div className="ml-6 space-y-3 pt-2">
                  <div className="space-y-2">
                    <Label className="text-gray-900">Special Access Token</Label>
                    <Input
                      type="password"
                      placeholder="Enter the landing page token"
                      value={token}
                      onChange={e => setToken(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-900">Target Audience</Label>
                    <Select value={targetAudience} onValueChange={setTargetAudience}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Tutors</SelectItem>
                        <SelectItem value="new">New (Never attended training)</SelectItem>
                        <SelectItem value="math">Math Tutors</SelectItem>
                        <SelectItem value="science">Science Tutors</SelectItem>
                        <SelectItem value="language">Language Tutors</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-900">Training Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="orientation">Orientation</SelectItem>
                        <SelectItem value="features">Features Explanation</SelectItem>
                        <SelectItem value="subject_specific">Subject Specific</SelectItem>
                        <SelectItem value="emergency">Emergency Update</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </DialogPanel>
          </RadioGroup>
        </div>

        <DialogFooter className="gap-3">
          <Button variant="modal-secondary-dark" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="modal-primary-dark" onClick={handleConfirm} disabled={confirmDisabled}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Class
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
