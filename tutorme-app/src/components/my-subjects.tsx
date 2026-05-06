'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  BookOpen,
  Loader2,
  ChevronRight,
  Languages,
  Calculator,
  Atom,
  Microscope,
  Monitor,
  Music,
  Palette,
  Globe,
  GraduationCap,
  MessageCircle,
  X,
  AlertCircle,
  Users,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

interface Subject {
  id: string
  name: string
  code?: string
  subject?: string
  category: string
  description?: string
  progress: number
  skills: {
    name: string
    score: number
  }[]
  confidence: number
  lastStudied?: string
  totalLessons: number
  completedLessons: number
}

const subjectIcons: Record<string, React.ReactNode> = {
  english: <Languages className="h-6 w-6" />,
  math: <Calculator className="h-6 w-6" />,
  precalculus: <Calculator className="h-6 w-6" />,
  'ap-calculus-ab': <Calculator className="h-6 w-6" />,
  'ap-calculus-bc': <Calculator className="h-6 w-6" />,
  'ap-statistics': <Calculator className="h-6 w-6" />,
  physics: <Atom className="h-6 w-6" />,
  chemistry: <Microscope className="h-6 w-6" />,
  biology: <Microscope className="h-6 w-6" />,
  ielts: <GraduationCap className="h-6 w-6" />,
  toefl: <GraduationCap className="h-6 w-6" />,
  'computer science': <Monitor className="h-6 w-6" />,
  cs: <Monitor className="h-6 w-6" />,
  music: <Music className="h-6 w-6" />,
  art: <Palette className="h-6 w-6" />,
  geography: <Globe className="h-6 w-6" />,
}

const subjectColors: Record<string, string> = {
  english: 'bg-blue-500',
  math: 'bg-purple-500',
  precalculus: 'bg-indigo-500',
  'ap-calculus-ab': 'bg-violet-500',
  'ap-calculus-bc': 'bg-fuchsia-500',
  'ap-statistics': 'bg-pink-500',
  physics: 'bg-indigo-500',
  chemistry: 'bg-green-500',
  biology: 'bg-emerald-500',
  ielts: 'bg-red-600',
  toefl: 'bg-blue-700',
  'computer science': 'bg-gray-700',
  cs: 'bg-gray-700',
  music: 'bg-pink-500',
  art: 'bg-orange-500',
  geography: 'bg-blue-600',
}

interface MySubjectsProps {
  onSubjectsChange?: () => void
}

export function MySubjects({ onSubjectsChange }: MySubjectsProps) {
  const router = useRouter()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [removingSubject, setRemovingSubject] = useState<string | null>(null)
  const [subjectToRemove, setSubjectToRemove] = useState<Subject | null>(null)

  useEffect(() => {
    loadSubjects()
  }, [])

  const loadSubjects = () => {
    setLoading(true)
    // Fetch enrolled subjects
    fetch('/api/student/subjects')
      .then(res => res.json())
      .then(data => {
        setSubjects(data.subjects || [])
        setLoading(false)
      })
      .catch(() => {
        // Use mock data if API doesn't exist yet
        setSubjects([
          {
            id: '1',
            name: 'English',
            code: 'english',
            category: 'language',
            description: 'Language arts, writing, and literature',
            progress: 65,
            skills: [
              { name: 'Grammar', score: 75 },
              { name: 'Vocabulary', score: 80 },
              { name: 'Writing', score: 70 },
              { name: 'Reading', score: 85 },
            ],
            confidence: 72,
            totalLessons: 20,
            completedLessons: 13,
            lastStudied: '2 hours ago',
          },
          {
            id: '2',
            name: 'Mathematics',
            code: 'math',
            category: 'stem',
            description: 'Algebra, geometry, and calculus',
            progress: 45,
            skills: [
              { name: 'Algebra', score: 60 },
              { name: 'Geometry', score: 55 },
              { name: 'Calculus', score: 40 },
              { name: 'Statistics', score: 50 },
            ],
            confidence: 52,
            totalLessons: 25,
            completedLessons: 11,
            lastStudied: '1 day ago',
          },
          {
            id: '3',
            name: 'Physics',
            code: 'physics',
            category: 'stem',
            description: 'Mechanics, thermodynamics, and electricity',
            progress: 30,
            skills: [
              { name: 'Mechanics', score: 45 },
              { name: 'Thermodynamics', score: 35 },
              { name: 'Electricity', score: 30 },
              { name: 'Waves', score: 25 },
            ],
            confidence: 38,
            totalLessons: 18,
            completedLessons: 5,
            lastStudied: '3 days ago',
          },
        ])
        setLoading(false)
      })
  }

  const handleRemoveSubject = async () => {
    if (!subjectToRemove) return

    setRemovingSubject(getSubjectIdentifier(subjectToRemove))
    try {
      const res = await fetch('/api/student/subjects/unenroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectCode: getSubjectIdentifier(subjectToRemove) }),
      })

      const data = await res.json()

      if (data.success) {
        toast.success(`Removed ${subjectToRemove.name}`, {
          description: 'You have been unenrolled from this subject',
        })
        // Refresh subjects list
        loadSubjects()
        onSubjectsChange?.()
      } else {
        toast.error('Failed to remove subject', {
          description: data.error || 'Please try again',
        })
      }
    } catch (error) {
      toast.error('Error', {
        description: 'Failed to remove subject. Please try again.',
      })
    } finally {
      setRemovingSubject(null)
      setSubjectToRemove(null)
    }
  }

  const getSubjectIdentifier = (subject: Subject) => {
    return subject.code || subject.subject || subject.id
  }

  const getSubjectIcon = (code: string | undefined) => {
    if (!code) return <BookOpen className="h-6 w-6" />
    return subjectIcons[code.toLowerCase()] || <BookOpen className="h-6 w-6" />
  }

  const getSubjectColor = (code: string | undefined) => {
    if (!code) return 'bg-blue-500'
    return subjectColors[code.toLowerCase()] || 'bg-blue-500'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    )
  }

  if (subjects.length === 0) {
    return (
      <div className="py-8 text-center">
        <BookOpen className="mx-auto mb-3 h-12 w-12 text-gray-300" />
        <p className="text-gray-600">No subjects yet</p>
        <p className="mb-4 text-sm text-gray-400">Add subjects to start learning</p>
        <Button onClick={() => router.push('/student/subjects/browse')}>Browse Subjects</Button>
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {subjects.map(subject => (
          <Card
            key={subject.id}
            className="group transition-all hover:border-blue-300 hover:shadow-md"
          >
            <CardContent className="pt-4">
              {/* Main card area - navigates to subject detail */}
              <div
                className="cursor-pointer"
                onClick={() => router.push(`/student/subjects/${getSubjectIdentifier(subject)}`)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`rounded-lg p-2 text-white ${getSubjectColor(getSubjectIdentifier(subject))}`}
                  >
                    {getSubjectIcon(getSubjectIdentifier(subject))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="truncate font-semibold">{subject.name}</h3>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                    <p className="line-clamp-1 text-xs text-gray-500">{subject.description}</p>

                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-gray-500">Progress</span>
                        <span className="font-medium">{subject.progress}%</span>
                      </div>
                      <Progress value={subject.progress} className="h-1.5" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom row with lessons badge and AI Tutor button */}
              <div className="mt-3 flex items-center justify-between border-t pt-3">
                <Badge variant="secondary" className="text-xs">
                  {subject.completedLessons}/{subject.totalLessons} lessons
                </Badge>

                <div className="flex items-center gap-2">
                  {subject.lastStudied && (
                    <span className="text-xs text-gray-400">{subject.lastStudied}</span>
                  )}

                  {/* Remove button - visible on hover */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    onClick={e => {
                      e.stopPropagation()
                      setSubjectToRemove(subject)
                    }}
                    title="Remove subject"
                  >
                    <X className="h-4 w-4" />
                  </Button>

                  {/* Human Tutors Button */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-purple-200 text-xs hover:bg-purple-50 hover:text-purple-700"
                    onClick={e => {
                      e.stopPropagation()
                      router.push(`/student/classes?subject=${getSubjectIdentifier(subject)}`)
                    }}
                  >
                    <Users className="mr-1 h-3 w-3" />
                    Human Tutors
                  </Button>

                  {/* AI Tutor Button */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={e => {
                      e.stopPropagation()
                      router.push(`/student/subjects/${getSubjectIdentifier(subject)}/chat`)
                    }}
                  >
                    <MessageCircle className="mr-1 h-3 w-3" />
                    AI Tutor
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={!!subjectToRemove} onOpenChange={() => setSubjectToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Remove Subject
            </DialogTitle>
            <DialogDescription asChild>
              <div>
                Are you sure you want to remove <strong>{subjectToRemove?.name}</strong> from your
                subjects?
                <br />
                <br />
                This will:
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                  <li>Remove your enrollment</li>
                  <li>Delete your progress tracking</li>
                  <li>Remove access to AI Tutor for this subject</li>
                </ul>
                <p className="mt-3 text-sm text-gray-500">
                  You can always re-enroll later, but your progress will be reset.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubjectToRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveSubject}
              disabled={removingSubject === subjectToRemove?.code}
            >
              {removingSubject === subjectToRemove?.code ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Remove Subject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
