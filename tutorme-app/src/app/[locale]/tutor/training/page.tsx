'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Play, CalendarPlus, Loader2, GraduationCap } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

export default function TutorTrainingPage() {
  const router = useRouter()
  const [starting, setStarting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Training fields
  const [token, setToken] = useState('')
  const [targetAudience, setTargetAudience] = useState('all')
  const [category, setCategory] = useState('orientation')

  const handleCreateTraining = async () => {
    if (!token) return
    setStarting(true)
    try {
      const res = await fetch('/api/tutor/classes/start-ad-hoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'training',
          trainingToken: token,
          targetAudience,
          trainingCategory: category,
          title: 'Training Session',
        }),
      })

      if (!res.ok) {
        if (res.status === 403) throw new Error('Invalid token')
        throw new Error('Failed to start training session')
      }

      const resData = await res.json()
      toast.success('Training session started!')
      router.push(`/tutor/classroom?sessionId=${resData.sessionId}`)
    } catch (err) {
      const error = err as Error
      toast.error(error.message || 'Failed to start training session')
    } finally {
      setStarting(false)
      setDialogOpen(false)
    }
  }

  return (
    <div className="min-h-full bg-white px-4 pb-0 pt-8 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <div className="mb-6 min-h-[52px] shrink-0">
          <div className="flex h-full w-full items-center justify-between gap-2 rounded-2xl border border-[#D8E0EA] bg-[linear-gradient(to_bottom,_#F8FAFC,_#F1F5F9)] p-1.5 px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-[#2563EB]" />
              <h1 className="text-sm font-semibold text-[#1F2933]">Training Sessions</h1>
            </div>
            <p className="hidden text-xs text-[#667085] sm:block">
              Run live training sessions for tutors, staff, or cohorts.
            </p>
          </div>
        </div>
        <Card>
          <CardHeader className="hidden">
            <CardTitle className="text-2xl">Training Sessions</CardTitle>
            <CardDescription>
              Run live training sessions for tutors, staff, or cohorts. Schedule a session or jump
              into a live room.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Button
              className="gap-2 bg-indigo-600 hover:bg-indigo-700"
              onClick={() => setDialogOpen(true)}
            >
              <CalendarPlus className="h-4 w-4" />
              Create Training Session
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => router.push('/tutor/classes')}
            >
              <Play className="h-4 w-4" />
              View Existing Sessions
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Create Training Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start a Training Session</DialogTitle>
            <DialogDescription>Host a session for other tutors on the platform.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Special Access Token</Label>
              <Input
                type="password"
                placeholder="Enter the landing page token"
                value={token}
                onChange={e => setToken(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Target Audience</Label>
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
              <Label>Training Category</Label>
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

          <DialogFooter>
            <Button
              variant="modal-secondary-dark"
              onClick={() => setDialogOpen(false)}
              disabled={starting}
            >
              Cancel
            </Button>
            <Button
              variant="modal-primary-dark"
              onClick={handleCreateTraining}
              disabled={starting || !token}
            >
              {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Training
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
