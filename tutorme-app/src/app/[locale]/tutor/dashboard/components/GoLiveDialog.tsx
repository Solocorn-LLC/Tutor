import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  const [step, setStep] = useState<1 | 2>(1)
  const [sessionType, setSessionType] = useState<'teaching' | 'training'>('teaching')
  const [loading, setLoading] = useState(false)

  // Training fields
  const [token, setToken] = useState('')
  const [targetAudience, setTargetAudience] = useState('all')
  const [category, setCategory] = useState('orientation')

  const handleNext = () => {
    setStep(2)
  }

  const handleBack = () => {
    setStep(1)
  }

  const handleConfirm = async () => {
    setLoading(true)
    try {
      if (sessionType === 'teaching') {
        await onConfirmTeaching()
      } else {
        await onConfirmTraining({ token, targetAudience, category })
      }
      onOpenChange(false)
      setTimeout(() => setStep(1), 300) // reset step after closing
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
        if (!isOpen) setTimeout(() => setStep(1), 300)
      }}
    >
      <DialogContent className="max-w-md" theme="metallic">
        <DialogHeader>
          <DialogTitle>
            {step === 1
              ? 'Start a Session'
              : sessionType === 'teaching'
                ? 'Session Recording'
                : 'Training Details'}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Choose the type of session you want to start.'
              : sessionType === 'teaching'
                ? 'Important information about your teaching session.'
                : 'Configure your training session access.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          {step === 1 && (
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
                  <div className="text-base font-semibold text-gray-900">
                    Start a Teaching Session
                  </div>
                  <div className="mt-1 text-sm font-normal text-gray-600">
                    Deliver lessons to your enrolled students. Only enrolled students will be
                    notified.
                  </div>
                </Label>
              </DialogPanel>
              <DialogPanel
                className="flex cursor-pointer items-center space-x-2 hover:bg-gray-50"
                onClick={() => setSessionType('training')}
              >
                <RadioGroupItem value="training" id="training" />
                <Label htmlFor="training" className="flex-1 cursor-pointer">
                  <div className="text-base font-semibold text-gray-900">
                    Start a Training Session
                  </div>
                  <div className="mt-1 text-sm font-normal text-gray-600">
                    Host a session for other tutors on the platform. Share your screen and
                    interface.
                  </div>
                </Label>
              </DialogPanel>
            </RadioGroup>
          )}

          {step === 2 && sessionType === 'teaching' && (
            <div className="animate-in fade-in slide-in-from-right-2 space-y-4">
              <DialogPanel className="space-y-3">
                <h4 className="flex items-center gap-2 font-semibold text-gray-900">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  Auto-Recording Enabled
                </h4>
                <p className="text-sm leading-relaxed text-gray-600">
                  Your teaching session will be recorded automatically from the beginning. This
                  ensures high-quality replays are available immediately after the session ends.
                </p>
                <p className="text-sm font-medium leading-relaxed text-gray-600">
                  💡 Monetization Opportunity: Future students who enroll in this course later will
                  still be able to access and learn from this recorded session, helping you generate
                  passive value over time!
                </p>
              </DialogPanel>
            </div>
          )}

          {step === 2 && sessionType === 'training' && (
            <div className="animate-in fade-in slide-in-from-right-2 space-y-4">
              <DialogPanel className="space-y-4">
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
              </DialogPanel>
            </div>
          )}
        </div>

        <DialogFooter className="gap-3">
          {step === 1 ? (
            <>
              <Button variant="modal-secondary-dark" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="modal-primary-dark" onClick={handleNext}>
                Next
              </Button>
            </>
          ) : (
            <>
              <Button variant="modal-secondary-dark" onClick={handleBack} disabled={loading}>
                Back
              </Button>
              <Button
                variant="modal-primary-dark"
                onClick={handleConfirm}
                disabled={loading || (sessionType === 'training' && !token)}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {sessionType === 'teaching' ? 'Got it, Start Teaching' : 'Start Training'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
