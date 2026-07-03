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
  onConfirmTeaching: () => Promise<void>
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
  onConfirmTraining,
}: GoLiveDialogProps) {
  const [sessionType, setSessionType] = useState<'teaching' | 'training'>('teaching')
  const [loading, setLoading] = useState(false)

  // Training fields
  const [token, setToken] = useState('')
  const [targetAudience, setTargetAudience] = useState('all')
  const [category, setCategory] = useState('orientation')

  const handleConfirm = async () => {
    setLoading(true)
    try {
      if (sessionType === 'teaching') {
        await onConfirmTeaching()
      } else {
        await onConfirmTraining({ token, targetAudience, category })
      }
      onOpenChange(false)
    } catch (err) {
      // Error is handled by parent (e.g. toast)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={isOpen => {
        onOpenChange(isOpen)
      }}
    >
      <DialogContent className="max-w-md" theme="metallic">
        <DialogHeader className="text-center">
          <DialogTitle className="mx-auto text-center">Go Live</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          <RadioGroup
            value={sessionType}
            onValueChange={v => setSessionType(v as 'teaching' | 'training')}
            className="flex flex-col space-y-4"
          >
            <DialogPanel
              className="flex cursor-pointer items-center space-x-2 hover:bg-gray-50"
              onClick={() => setSessionType('teaching')}
            >
              <RadioGroupItem value="teaching" id="teaching" />
              <Label htmlFor="teaching" className="flex-1 cursor-pointer">
                <div className="text-base font-semibold text-gray-900">Start a live session</div>
                <div className="mt-1 text-sm font-normal text-gray-600">
                  Start a live session to meet new students, conduct a demo lesson, provide a
                  diagnostic test…
                </div>
              </Label>
            </DialogPanel>
            <DialogPanel
              className="flex cursor-pointer flex-col space-y-2 hover:bg-gray-50"
              onClick={() => setSessionType('training')}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="training" id="training" />
                <Label htmlFor="training" className="flex-1 cursor-pointer">
                  <div className="text-base font-semibold text-gray-900">
                    Start a training session
                  </div>
                  <div className="mt-1 text-sm font-normal text-gray-600">
                    Training sessions for new tutors
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
          <Button
            variant="modal-primary-dark"
            onClick={handleConfirm}
            disabled={loading || (sessionType === 'training' && !token)}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Go Live
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
