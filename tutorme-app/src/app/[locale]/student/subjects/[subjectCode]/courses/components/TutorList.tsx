'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Search, AlertCircle } from 'lucide-react'
import { TutorCard } from './TutorCard'

interface Tutor {
  id: string
  username?: string
  name: string
  avatar: string | null
  bio: string
  rating: number
  reviewCount: number
  hourlyRate: number | null
  currency: string
  nextAvailableSlot: string | null
  totalStudents: number
  totalClasses: number
  specialties?: string[]
  countries?: string[]
}

interface TutorListProps {
  subjectCode: string
}

export function TutorList({ subjectCode }: TutorListProps) {
  const [tutors, setTutors] = useState<Tutor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchTutors() {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(
          `/api/tutors/by-subject?subject=${encodeURIComponent(subjectCode)}`,
          { credentials: 'include' }
        )

        if (!response.ok) {
          throw new Error('Failed to fetch tutors')
        }

        const data = await response.json()

        if (!cancelled) {
          setTutors(data.tutors || [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load tutors')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchTutors()

    return () => {
      cancelled = true
    }
  }, [subjectCode])

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex gap-4">
                <Skeleton className="h-16 w-16 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6 text-center">
          <AlertCircle className="text-destructive mx-auto mb-4 h-12 w-12" />
          <p className="text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Empty state
  if (tutors.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="pb-12 pt-12 text-center">
          <Users className="text-muted mx-auto mb-4 h-16 w-16" />
          <h3 className="text-foreground mb-2 text-lg font-medium">No tutors available yet</h3>
          <p className="text-muted-foreground mx-auto mb-6 max-w-md">
            We&apos;re working on adding tutors for this subject. Check back soon or try the AI
            tutor option!
          </p>
          <Button asChild variant="outline" className="border-border">
            <a href={`/student/subjects/${subjectCode}/chat`}>
              <Search className="mr-2 h-4 w-4" />
              Try AI Tutor
            </a>
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Tutors list
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground mb-4 text-sm">
        {tutors.length} tutor{tutors.length !== 1 ? 's' : ''} available for this subject
      </p>
      {tutors.map(tutor => (
        <TutorCard key={tutor.id} tutor={tutor} subjectCode={subjectCode} />
      ))}
    </div>
  )
}
