'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogPanel,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Share2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'

interface ShareCourseModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  courseId: string
  courseName: string
}

type ShareResult = { email: string; status: string; error?: string }

export function ShareCourseModal({
  open,
  onOpenChange,
  courseId,
  courseName,
}: ShareCourseModalProps) {
  const [emails, setEmails] = useState('')
  const [message, setMessage] = useState('')
  const [sharing, setSharing] = useState(false)
  const [results, setResults] = useState<ShareResult[] | null>(null)

  const handleShare = async () => {
    const emailList = emails
      .split(/[\n,;]+/)
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
    if (emailList.length === 0) {
      toast.error('Enter at least one parent email')
      return
    }
    if (!message.trim()) {
      toast.error('Enter a message for the parents')
      return
    }

    setSharing(true)
    setResults(null)
    try {
      const res = await fetchWithCsrf('/api/tutor/courses/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          recipientEmails: emailList,
          message: message.trim(),
        }),
      })
      const data = await res.json()

      if (res.ok) {
        setResults(data.results ?? [])
        const sent = (data.results ?? []).filter((r: ShareResult) => r.status === 'sent').length
        if (sent > 0) {
          toast.success(`Course shared with ${sent} parent(s)`)
        }
        if ((data.results ?? []).some((r: ShareResult) => r.status !== 'sent')) {
          toast.info('Some recipients could not receive the share. Check results below.')
        }
      } else {
        toast.error(data.error ?? 'Failed to share course')
      }
    } catch {
      toast.error('Failed to share course')
    } finally {
      setSharing(false)
    }
  }

  const handleClose = () => {
    setEmails('')
    setMessage('')
    setResults(null)
    onOpenChange(false)
  }

  const emailList = emails
    .split(/[\n,;]+/)
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share with Parents
          </DialogTitle>
          <DialogDescription>
            Share &quot;{courseName}&quot; with parent accounts by email. They will receive a
            notification and can view the course outline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          <DialogPanel className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emails" className="text-gray-900">
                Parent emails (comma or newline separated)
              </Label>
              <Textarea
                id="emails"
                placeholder="parent1@example.com, parent2@example.com"
                value={emails}
                onChange={e => setEmails(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message" className="text-gray-900">
                Message to parents
              </Label>
              <Textarea
                id="message"
                placeholder="e.g. I recommend this course for your child. Please review the outline and let me know if you have questions."
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          </DialogPanel>

          {results && results.length > 0 && (
            <DialogPanel>
              <p className="mb-2 text-sm font-medium text-gray-900">Results</p>
              <div className="max-h-32 space-y-2 overflow-y-auto">
                {results.map(r => (
                  <div key={r.email} className="flex justify-between gap-2 text-xs">
                    <span className="truncate text-gray-900">{r.email}</span>
                    <span
                      className={
                        r.status === 'sent'
                          ? 'text-green-600'
                          : r.status === 'already_shared'
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }
                    >
                      {r.status === 'sent' && 'Sent'}
                      {r.status === 'already_shared' && 'Already shared'}
                      {r.status === 'not_found' && 'Not found'}
                      {r.status === 'not_parent' && 'Not a parent'}
                      {r.status === 'failed' && (r.error ?? 'Failed')}
                    </span>
                  </div>
                ))}
              </div>
            </DialogPanel>
          )}
        </div>

        <DialogFooter className="gap-3">
          <Button variant="modal-secondary" onClick={handleClose} disabled={sharing}>
            Cancel
          </Button>
          <Button
            variant="modal-primary"
            onClick={handleShare}
            disabled={sharing || !emails.trim() || !message.trim()}
          >
            {sharing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sharing…
              </>
            ) : (
              <>
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
