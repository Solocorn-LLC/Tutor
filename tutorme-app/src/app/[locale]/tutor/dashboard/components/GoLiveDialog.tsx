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
import { Textarea } from '@/components/ui/textarea'
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
}: GoLiveDialogProps) {
  const [loading, setLoading] = useState(false)

  // Teaching fields (only used when a dashboard caller provides unpublished courses)
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [description, setDescription] = useState('')

  const handleConfirm = async () => {
    setLoading(true)
    try {
      if (unpublishedCourses && unpublishedCourses.length > 0) {
        await onConfirmTeachingUnpublished?.(selectedCourseId, description)
      } else {
        await onConfirmTeaching?.()
      }
      onOpenChange(false)
    } catch (_err) {
      // Error is handled by parent (e.g. toast)
    } finally {
      setLoading(false)
    }
  }

  const confirmDisabled =
    loading || Boolean(unpublishedCourses && unpublishedCourses.length > 0 && !selectedCourseId)

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
          <div className="space-y-2">
            <div className="text-base font-semibold text-white">Create a demo class</div>
            <div className="text-sm font-normal text-white/80">
              Create a demo lesson for your course.
            </div>
          </div>

          {unpublishedCourses && unpublishedCourses.length > 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-white">Select an unpublished course</Label>
                <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                  <SelectTrigger className="border-white/20 bg-white/10 text-white data-[placeholder]:text-white/60 [&>span]:text-white">
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
              </div>

              <div className="space-y-2">
                <Label className="text-white">Description</Label>
                <Textarea
                  value={description}
                  onChange={e => {
                    const val = e.target.value
                    if (val.length <= 200) setDescription(val)
                  }}
                  placeholder="Describe what this demo will cover"
                  rows={2}
                  maxLength={200}
                  className="resize-none border-white/20 bg-white/10 text-white placeholder:text-white/60"
                />
                <p className="text-right text-xs text-white/70">{description.length}/200</p>
              </div>
            </div>
          )}

          {unpublishedCourses && unpublishedCourses.length === 0 && (
            <div className="text-sm text-white/80">No unpublished courses available.</div>
          )}
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
