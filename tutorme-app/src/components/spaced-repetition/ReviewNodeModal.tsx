'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Brain,
  Clock,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  RotateCcw,
  Calendar,
  Zap,
  Award,
  BarChart3,
  ChevronRight,
  X,
} from 'lucide-react'

interface ReviewNodeModalProps {
  isOpen: boolean
  onClose: () => void
  review: {
    id: string
    contentId: string
    contentTitle: string
    subjectId: string
    subjectName: string
    subjectColor: string
    scheduledFor: string
    isOverdue?: boolean
    daysUntilDue?: number
    daysOverdue?: number
    currentRetention: number
    repetitionCount: number
    priority: 'high' | 'medium' | 'low'
  } | null
  onReviewComplete?: (performance: number) => void
  onSnooze?: () => void
  onMarkKnown?: () => void
}

export function ReviewNodeModal({
  isOpen,
  onClose,
  review,
  onReviewComplete,
  onSnooze,
  onMarkKnown,
}: ReviewNodeModalProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  if (!review) return null

  const isOverdue = review.isOverdue || (review.daysOverdue && review.daysOverdue > 0)
  const daysOverdue = review.daysOverdue || 0
  const daysUntilDue = review.daysUntilDue || 0

  // Get retention status
  const getRetentionStatus = (retention: number) => {
    if (retention >= 80) return { label: 'Strong', color: 'text-green-600', bg: 'bg-green-50' }
    if (retention >= 60) return { label: 'Good', color: 'text-yellow-600', bg: 'bg-yellow-50' }
    if (retention >= 40) return { label: 'Fading', color: 'text-orange-600', bg: 'bg-orange-50' }
    return { label: 'Critical', color: 'text-red-600', bg: 'bg-red-50' }
  }

  const retentionStatus = getRetentionStatus(review.currentRetention)

  // Get priority badge
  const getPriorityBadge = (priority: string, isOverdue: boolean) => {
    if (isOverdue) return <Badge variant="destructive">Overdue</Badge>
    switch (priority) {
      case 'high':
        return (
          <Badge variant="default" className="bg-orange-500">
            High Priority
          </Badge>
        )
      case 'medium':
        return (
          <Badge variant="outline" className="text-yellow-600">
            Medium
          </Badge>
        )
      case 'low':
        return <Badge variant="secondary">Low</Badge>
      default:
        return null
    }
  }

  // Calculate recommended study time based on retention
  const getRecommendedStudyTime = (retention: number) => {
    if (retention < 40) return '20-30 min'
    if (retention < 60) return '15-20 min'
    if (retention < 80) return '10-15 min'
    return '5-10 min'
  }

  // Handle start review
  const handleStartReview = () => {
    router.push(`/student/review/${review.contentId}?reviewId=${review.id}`)
    onClose()
  }

  // Handle snooze
  const handleSnooze = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/student/reviews/snooze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId: review.id, days: 1 }),
      })

      if (res.ok) {
        toast.success('Review postponed until tomorrow')
        onSnooze?.()
        onClose()
      } else {
        throw new Error('Failed to snooze')
      }
    } catch (error) {
      toast.error('Failed to postpone review')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle mark as known
  const handleMarkKnown = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/student/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: review.contentId,
          performance: 95, // High performance since marked as known
        }),
      })

      if (res.ok) {
        toast.success('Marked as known! Next review extended.')
        onMarkKnown?.()
        onClose()
      } else {
        throw new Error('Failed to update')
      }
    } catch (error) {
      toast.error('Failed to update review status')
    } finally {
      setIsLoading(false)
    }
  }

  // Mock data for the example - in real app, fetch this
  const mockStats = {
    lastScore: Math.round(review.currentRetention * 0.9 + Math.random() * 10),
    averageScore: Math.round(review.currentRetention * 0.85 + Math.random() * 15),
    totalReviews: review.repetitionCount,
    streakDays: Math.floor(Math.random() * 7) + 1,
    studyTimeMinutes: Math.floor(Math.random() * 60) + 15,
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[650px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: review.subjectColor }}
              />
              <DialogTitle className="text-lg">{review.contentTitle}</DialogTitle>
            </div>
            {getPriorityBadge(review.priority, !!isOverdue)}
          </div>
          <DialogDescription className="flex items-center gap-2 pt-1">
            <BookOpen className="h-4 w-4" />
            {review.subjectName}
            <span className="mx-1">•</span>
            <Clock className="h-4 w-4" />
            {isOverdue
              ? `${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`
              : daysUntilDue === 0
                ? 'Due today'
                : `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`}
          </DialogDescription>
        </DialogHeader>

        {/* Retention Status */}
        <div className={cn('rounded-lg p-4', retentionStatus.bg)}>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className={cn('h-5 w-5', retentionStatus.color)} />
              <span className="font-medium">Current Retention</span>
            </div>
            <span className={cn('text-2xl font-bold', retentionStatus.color)}>
              {review.currentRetention}%
            </span>
          </div>
          <Progress value={review.currentRetention} className="h-2" />
          <p className="mt-2 text-sm text-gray-600">
            {review.currentRetention >= 80
              ? 'You remember this well! Quick review recommended.'
              : review.currentRetention >= 60
                ? 'Memory is stable. Review to maintain retention.'
                : review.currentRetention >= 40
                  ? 'Content is fading. Review soon to strengthen memory.'
                  : "Urgent! You're at risk of forgetting this content."}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="mb-1 flex items-center gap-2 text-sm text-gray-500">
              <RotateCcw className="h-4 w-4" />
              Times Reviewed
            </div>
            <p className="text-xl font-semibold">{mockStats.totalReviews}</p>
          </div>

          <div className="rounded-lg bg-gray-50 p-3">
            <div className="mb-1 flex items-center gap-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" />
              Study Time
            </div>
            <p className="text-xl font-semibold">{mockStats.studyTimeMinutes}m</p>
          </div>

          <div className="rounded-lg bg-gray-50 p-3">
            <div className="mb-1 flex items-center gap-2 text-sm text-gray-500">
              <Target className="h-4 w-4" />
              Last Score
            </div>
            <p
              className={cn(
                'text-xl font-semibold',
                mockStats.lastScore >= 70 ? 'text-green-600' : 'text-yellow-600'
              )}
            >
              {mockStats.lastScore}%
            </p>
          </div>

          <div className="rounded-lg bg-gray-50 p-3">
            <div className="mb-1 flex items-center gap-2 text-sm text-gray-500">
              <BarChart3 className="h-4 w-4" />
              Average
            </div>
            <p className="text-xl font-semibold">{mockStats.averageScore}%</p>
          </div>
        </div>

        <Separator />

        {/* Recommended Actions */}
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <Zap className="h-4 w-4 text-yellow-500" />
            Recommended Actions
          </h4>

          <div className="space-y-2">
            <div
              className="flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors hover:bg-gray-50"
              onClick={handleStartReview}
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <Brain className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Full Review Session</p>
                  <p className="text-xs text-gray-500">
                    Recommended time: {getRecommendedStudyTime(review.currentRetention)}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </div>

            <div className="flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-2">
                  <BookOpen className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Quick Flashcards</p>
                  <p className="text-xs text-gray-500">5-minute rapid review</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </div>

            <div className="flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2">
                  <Target className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Practice Quiz</p>
                  <p className="text-xs text-gray-500">Test your knowledge</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </div>
          </div>
        </div>

        <Separator />

        {/* Spaced Repetition Info */}
        <div className="rounded-lg bg-blue-50 p-3">
          <div className="flex items-start gap-2">
            <Brain className="mt-0.5 h-4 w-4 text-blue-500" />
            <div className="text-sm">
              <p className="font-medium text-blue-900">Spaced Repetition</p>
              <p className="mt-1 text-blue-700">
                This review is scheduled based on your learning patterns. Reviewing at the optimal
                time strengthens long-term memory.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="modal-secondary"
            onClick={handleSnooze}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            <Clock className="mr-2 h-4 w-4" />
            Snooze 1 Day
          </Button>

          <Button
            variant="modal-secondary"
            onClick={handleMarkKnown}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Mark as Known
          </Button>

          <Button variant="modal-primary" onClick={handleStartReview} disabled={isLoading} className="w-full sm:w-auto">
            <Brain className="mr-2 h-4 w-4" />
            Start Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
