'use client'

/**
 * Dialog for a student to rate a completed 1-on-1 session (1–5 stars + optional
 * comment). Loads any existing review on open so it can be edited. Posts to
 * /api/one-on-one/review.
 */

import { useEffect, useState } from 'react'
import { Star, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface OneOnOneReviewDialogProps {
  requestId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted?: () => void
}

export function OneOnOneReviewDialog({
  requestId,
  open,
  onOpenChange,
  onSubmitted,
}: OneOnOneReviewDialogProps) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/one-on-one/review?requestId=${encodeURIComponent(requestId)}`, {
      credentials: 'include',
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.review) {
          setRating(data.review.rating ?? 0)
          setComment(data.review.comment ?? '')
        } else {
          setRating(0)
          setComment('')
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, requestId])

  const submit = async () => {
    if (rating < 1) {
      toast.error('Pick a star rating first')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/one-on-one/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestId, rating, comment: comment.trim() || undefined }),
      })
      if (res.ok) {
        toast.success('Thanks for your review!')
        onSubmitted?.()
        onOpenChange(false)
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || 'Could not submit your review')
      }
    } catch {
      toast.error('Could not submit your review')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rate your session</DialogTitle>
          <DialogDescription>How was your 1-on-1 session with your tutor?</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(n)}
                  className="p-1"
                >
                  <Star
                    className={cn(
                      'h-8 w-8 transition-colors',
                      (hover || rating) >= n ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
                    )}
                  />
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Share a little about your experience (optional)…"
              maxLength={1000}
              className="min-h-[90px] w-full resize-y rounded-md border border-gray-300 p-2 text-sm text-gray-900"
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
