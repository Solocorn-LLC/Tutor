import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Clock,
  BookOpen,
  Plus,
  Users,
  Loader2,
  User as UserIcon,
  ExternalLink,
  Share2,
  Copy,
  Video,
  Sparkles,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { formatClassTime } from '@/lib/format-class-time'
import { cn } from '@/lib/utils'

export interface UpcomingClass {
  id: string
  courseId?: string
  title: string
  subject: string
  scheduledAt: string
  duration: number
  maxStudents: number
  enrolledStudents: number
  status: string
  sessionNo?: number
  totalSessions?: number
}

interface UpcomingClassesCardProps {
  classes: UpcomingClass[]
  formatDate: (dateString: string) => string
  loading?: boolean
  onCreateClassClick?: () => void
  onRemoveClass?: (classId: string) => void
}

function copyJoinLink(classId: string) {
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/student/feedback?sessionId=${classId}`
      : ''
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => toast.success('Join link copied to clipboard'))
  }
}

interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  classId: string
  classTitle: string
}

function ShareDialog({ open, onOpenChange, classId, classTitle }: ShareDialogProps) {
  const [students, setStudents] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [studentsRes, coursesRes] = await Promise.all([
        fetch('/api/tutor/students'),
        fetch('/api/tutor/courses'),
      ])

      if (studentsRes.ok) {
        const data = await studentsRes.json()
        setStudents(data.students || [])
      }

      if (coursesRes.ok) {
        const data = await coursesRes.json()
        const allGroups: any[] = []
        data.courses?.forEach((course: any) => {
          course.variants?.forEach((v: any) => {
            allGroups.push({
              id: v.batchId,
              name: `${course.name} - ${v.name}`,
            })
          })
        })
        setGroups(allGroups)
      }
    } catch (err) {
      console.error('Failed to fetch share data:', err)
      toast.error('Failed to load students and groups')
    } finally {
      setTimeout(() => setLoading(false), 100)
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchData()
      setSelectedStudents([])
      setSelectedGroups([])
    }
  }, [open, fetchData])

  const handleShare = async () => {
    if (selectedStudents.length === 0 && selectedGroups.length === 0) {
      toast.error('Please select at least one student or group')
      return
    }

    setSharing(true)
    try {
      const res = await fetch('/api/tutor/classes/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId,
          studentIds: selectedStudents,
          groupIds: selectedGroups,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        toast.success(data.message || 'Shared successfully')
        onOpenChange(false)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to share session')
      }
    } catch (err) {
      toast.error('Failed to share session')
    } finally {
      setSharing(false)
    }
  }

  const filteredStudents = students.filter(
    s =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[600px] flex-col overflow-hidden border border-slate-200 p-0 sm:max-w-[500px]">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-blue-500" />
            Share Session
          </DialogTitle>
          <DialogDescription>
            Select students and groups to receive the join link for <strong>{classTitle}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-4">
          <div className="relative">
            <Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search students or groups..."
              className="w-full rounded-lg border py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchQuery}
              onChange={(e: any) => setSearchQuery(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm text-gray-500">Loading recipients...</p>
            </div>
          ) : (
            <ScrollArea className="-mx-2 flex-1 px-2">
              <div className="space-y-6 pb-4">
                {filteredGroups.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Groups
                    </h4>
                    <div className="grid gap-1">
                      {filteredGroups.map(group => (
                        <div
                          key={group.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-gray-50"
                          onClick={() => {
                            setSelectedGroups(prev =>
                              prev.includes(group.id)
                                ? prev.filter(id => id !== group.id)
                                : [...prev, group.id]
                            )
                          }}
                        >
                          <Checkbox
                            id={`group-${group.id}`}
                            checked={selectedGroups.includes(group.id)}
                            onCheckedChange={() => {}}
                          />
                          <div className="flex-1">
                            <Label className="cursor-pointer text-sm font-medium">
                              {group.name}
                            </Label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filteredStudents.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Students
                    </h4>
                    <div className="grid gap-1">
                      {filteredStudents.map(student => (
                        <div
                          key={student.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-gray-50"
                          onClick={() => {
                            setSelectedStudents(prev =>
                              prev.includes(student.id)
                                ? prev.filter(id => id !== student.id)
                                : [...prev, student.id]
                            )
                          }}
                        >
                          <Checkbox
                            id={`student-${student.id}`}
                            checked={selectedStudents.includes(student.id)}
                            onCheckedChange={() => {}}
                          />
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
                            <UserIcon className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <Label className="block cursor-pointer truncate text-sm font-medium">
                              {student.name}
                            </Label>
                            <p className="truncate text-xs text-gray-500">{student.email}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!loading && filteredStudents.length === 0 && filteredGroups.length === 0 && (
                  <div className="py-12 text-center">
                    <Users className="mx-auto mb-3 h-12 w-12 text-gray-200" />
                    <p className="text-sm text-gray-500">No students or groups found</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="flex items-center justify-between border-t bg-gray-50/50 p-6">
          <p className="text-xs text-gray-500">
            {selectedStudents.length + selectedGroups.length} selected
          </p>
          <div className="flex gap-2">
            <Button variant="modal-secondary" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="modal-primary"
              size="sm"
              onClick={handleShare}
              disabled={sharing || (selectedStudents.length === 0 && selectedGroups.length === 0)}
            >
              {sharing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="mr-2 h-4 w-4" />
              )}
              Share Link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function UpcomingClassesCard({
  classes,
  formatDate,
  loading,
  onCreateClassClick,
  onRemoveClass,
}: UpcomingClassesCardProps) {
  const [selectedClass, setSelectedClass] = useState<UpcomingClass | null>(null)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  const classesWithSessions = classes

  return (
    <Card className="overflow-hidden border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2" title="Scheduled and active classes">
          <Clock className="h-5 w-5 text-blue-500" />
          My Sessions
        </CardTitle>
        <Link href="/tutor/classes">
          <Button variant="ghost" size="sm">
            View All
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4" aria-busy="true">
            {[1, 2].map(i => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 animate-pulse rounded-lg bg-gray-200" />
                  <div className="space-y-2">
                    <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
                    <div className="h-3 w-36 animate-pulse rounded bg-gray-200" />
                    <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
                  </div>
                </div>
                <div className="h-9 w-24 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : classes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 px-4 py-8 text-center">
            <p className="mb-3 text-gray-600">No upcoming classes</p>
            {onCreateClassClick && (
              <Button onClick={onCreateClassClick}>
                <Plus className="mr-2 h-4 w-4" /> Schedule a class
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Time
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Session No.
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Total
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {classesWithSessions.map(cls => {
                  const time = formatClassTime(cls.scheduledAt, cls.duration)
                  return (
                    <tr
                      key={cls.id}
                      className="border-b border-gray-100 transition-colors hover:bg-gray-50/80"
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-100">
                            <BookOpen className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{cls.title}</p>
                            <p className="text-xs text-gray-500">{cls.subject}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {formatDate(cls.scheduledAt)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">{time.timeRange}</td>
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-medium text-indigo-700">
                          {cls.sessionNo}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center text-sm text-gray-700">
                        {cls.totalSessions}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-200 text-blue-600 hover:bg-blue-50"
                          onClick={() => setSelectedClass(cls)}
                        >
                          Open
                          <ExternalLink className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Class Detail Modal */}
        <Dialog open={!!selectedClass} onOpenChange={() => setSelectedClass(null)}>
          <DialogContent className="border border-slate-200 sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{selectedClass?.title}</DialogTitle>
              <DialogDescription>{selectedClass?.subject}</DialogDescription>
            </DialogHeader>

            {selectedClass && (
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                  <Clock className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="font-medium text-gray-900">
                      {formatDate(selectedClass.scheduledAt)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatClassTime(selectedClass.scheduledAt).formatted} •{' '}
                      {selectedClass.duration} min
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                  <Users className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="font-medium text-gray-900">
                      {selectedClass.enrolledStudents}/{selectedClass.maxStudents} students
                    </p>
                    <p className="text-sm text-gray-500">
                      {selectedClass.maxStudents - selectedClass.enrolledStudents} spots remaining
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                  <BookOpen className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="font-medium text-gray-900">
                      Session {selectedClass.sessionNo || 1} of {selectedClass.totalSessions || 12}
                    </p>
                    <p className="text-sm text-gray-500">
                      Total Sessions: {selectedClass.totalSessions || 12}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <Link href={`/tutor/classroom?sessionId=${selectedClass.id}`}>
                    <Button variant="modal-primary" className="w-full">
                      <Video className="mr-2 h-4 w-4" />
                      Enter Live Room
                    </Button>
                  </Link>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => copyJoinLink(selectedClass.id)}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Link
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setIsShareModalOpen(true)}
                    >
                      <Share2 className="mr-2 h-4 w-4" />
                      Share
                    </Button>
                  </div>

                  {selectedClass.courseId ? (
                    <Link href={`/tutor/courses/${selectedClass.courseId}`}>
                      <Button variant="outline" className="w-full">
                        <Sparkles className="mr-2 h-4 w-4" />
                        View Course Details
                      </Button>
                    </Link>
                  ) : (
                    <Link href="/tutor/classes">
                      <Button variant="outline" className="w-full">
                        <Sparkles className="mr-2 h-4 w-4" />
                        View Session Details
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Share Dialog */}
        {selectedClass && (
          <ShareDialog
            open={isShareModalOpen}
            onOpenChange={setIsShareModalOpen}
            classId={selectedClass.id}
            classTitle={selectedClass.title}
          />
        )}
      </CardContent>
    </Card>
  )
}
