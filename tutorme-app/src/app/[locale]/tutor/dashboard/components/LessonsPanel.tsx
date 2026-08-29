'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Folder, ChevronDown, ChevronRight, Lock, Trash2, Loader2 } from 'lucide-react'
import type { LiveTask } from '@/lib/socket'
import type { InsightsSessionOption } from './builder-types'

type GroupableTask = LiveTask

function groupTasksByParent(tasks: LiveTask[]) {
  const baseTasks: LiveTask[] = []
  const extMap = new Map<string, LiveTask[]>()
  for (const t of tasks) {
    if (t.parentId && t.isExtension) {
      const arr = extMap.get(t.parentId) || []
      arr.push(t)
      extMap.set(t.parentId, arr)
    } else {
      baseTasks.push(t)
    }
  }
  return { baseTasks, extMap }
}

export interface LessonsPanelProps {
  courseId: string
  sessionId: string | null
  sessions: InsightsSessionOption[]
  schedules?: { scheduleId: string; name: string }[]
  liveTasks: LiveTask[]
  activeTaskId?: string | null
  onSelectTask?: (taskId: string, source: 'task' | 'assessment' | 'homework') => void
  onSessionChange?: (sessionId: string) => void
  isSessionLocked?: boolean
  socket?: {
    emit: (event: string, ...args: unknown[]) => void
    on?: (event: string, handler: (...args: unknown[]) => void) => void
    off?: (event: string, handler: (...args: unknown[]) => void) => void
  }
}

const MANAGEABLE_SESSION_STATUSES = new Set(['scheduled', 'preparing'])

export function LessonsPanel({
  courseId,
  sessionId,
  sessions,
  schedules = [],
  liveTasks,
  activeTaskId,
  onSelectTask,
  onSessionChange,
  isSessionLocked,
  socket,
}: LessonsPanelProps) {
  const [foldersOpen, setFoldersOpen] = useState<Record<string, boolean>>({
    homework: true,
  })
  const [undeployingIds, setUndeployingIds] = useState<Set<string>>(new Set())
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('')

  // Only show sessions that belong to the current course. Always keep the
  // active session in the list even if its courseId hasn't arrived yet.
  const courseSessions = useMemo(
    () => sessions.filter(s => s.courseId === courseId || s.id === sessionId),
    [sessions, courseId, sessionId]
  )

  const filteredSessions = useMemo(() => {
    if (!selectedScheduleId) return courseSessions
    return courseSessions.filter(s => s.scheduleId === selectedScheduleId)
  }, [courseSessions, selectedScheduleId])

  // Default the schedule selector to the active session's schedule, or to the
  // only available schedule. Otherwise leave it empty so the placeholder shows.
  useEffect(() => {
    if (schedules.length === 1) {
      setSelectedScheduleId(schedules[0].scheduleId)
      return
    }
    const active = courseSessions.find(s => s.id === sessionId)
    const activeScheduleId = active?.scheduleId
    if (activeScheduleId && schedules.some(sch => sch.scheduleId === activeScheduleId)) {
      setSelectedScheduleId(activeScheduleId)
    } else {
      setSelectedScheduleId('')
    }
  }, [sessionId, courseSessions, schedules])

  const currentSession = useMemo(
    () => filteredSessions.find(s => s.id === sessionId),
    [filteredSessions, sessionId]
  )

  const canManageTasks = useMemo(() => {
    if (!currentSession) return false
    return MANAGEABLE_SESSION_STATUSES.has(currentSession.status)
  }, [currentSession])

  const { baseTasks, liveHomework } = useMemo(() => {
    const tasks = liveTasks.filter(t => t.source !== 'homework')
    const homework = liveTasks.filter(t => t.source === 'homework')
    return { baseTasks: groupTasksByParent(tasks).baseTasks, liveHomework: homework }
  }, [liveTasks])

  const extMap = useMemo(() => groupTasksByParent(liveTasks).extMap, [liveTasks])

  const handleUndeploy = async (task: LiveTask) => {
    if (!sessionId) return
    if (!canManageTasks) return

    setUndeployingIds(prev => new Set(prev).add(task.id))
    try {
      if (socket) {
        socket.emit('task:undeploy', { roomId: sessionId, taskId: task.id, courseId })
      } else {
        const res = await fetch(`/api/tutor/sessions/${sessionId}/undeploy-task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: task.id, courseId }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Undeploy failed' }))
          throw new Error(data.error || `Undeploy failed (${res.status})`)
        }
      }
    } catch (err) {
      console.error('[LessonsPanel] undeploy failed:', err)
    } finally {
      setUndeployingIds(prev => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }
  }

  const hasSchedules = schedules.length > 0
  const showScheduleSelector = hasSchedules

  const renderScheduleSelector = () => {
    if (!showScheduleSelector) return null

    // Single schedule: display its name as read-only text.
    if (schedules.length === 1) {
      return (
        <div className="flex w-full items-center rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm">
          <span className="truncate font-medium text-gray-900">{schedules[0].name}</span>
        </div>
      )
    }

    return (
      <Select
        value={selectedScheduleId}
        onValueChange={value => {
          if (value) setSelectedScheduleId(value)
        }}
      >
        <SelectTrigger className="w-full rounded-lg border-blue-100 bg-white text-sm focus:ring-0 focus:ring-offset-0">
          <SelectValue placeholder="Select Schedule" />
        </SelectTrigger>
        <SelectContent>
          {schedules.map(sch => (
            <SelectItem key={sch.scheduleId} value={sch.scheduleId}>
              {sch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  const renderSessionHeader = () => {
    if (filteredSessions.length === 0) {
      return (
        <div className="flex items-center rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm text-gray-500">
          No sessions available
        </div>
      )
    }

    // Stable session number = position in this course's sessions ordered by schedule.
    const sessionsByDate = [...courseSessions].sort((a, b) => {
      const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0
      const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0
      return aTime - bTime
    })
    const sessionNumber =
      sessionId && sessionsByDate.length > 0
        ? sessionsByDate.findIndex(s => s.id === sessionId) + 1
        : 0

    return (
      <Select
        value={sessionId ?? ''}
        onValueChange={value => {
          if (value && value !== sessionId) {
            onSessionChange?.(value)
          }
        }}
      >
        <SelectTrigger className="w-full rounded-lg border-blue-100 bg-white text-sm focus:ring-0 focus:ring-offset-0">
          <SelectValue placeholder="Select a session" />
        </SelectTrigger>
        <SelectContent>
          {filteredSessions.map(s => {
            const idx = sessionsByDate.findIndex(item => item.id === s.id)
            const number = idx >= 0 ? idx + 1 : 0
            return (
              <SelectItem key={s.id} value={s.id}>
                <span className="block truncate">
                  {number > 0 ? `Session ${number} — ` : ''}
                  {s.title}
                </span>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
        {renderScheduleSelector()}
        {renderSessionHeader()}
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 pr-2">
            {baseTasks.length === 0 && liveHomework.length === 0 && (
              <p className="text-sm text-gray-500">No tasks deployed yet.</p>
            )}

            {baseTasks.length > 0 && (
              <div className="space-y-2">
                {baseTasks.map((task, idx) => {
                  const isActive = activeTaskId === task.id
                  const extensions = extMap.get(task.id) ?? []
                  return (
                    <div key={task.id} className="space-y-1">
                      <button
                        type="button"
                        onClick={() => onSelectTask?.(task.id, task.source || 'task')}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg border border-blue-500 bg-white px-3 py-2 text-left transition-colors',
                          isActive && 'ring-2 ring-blue-500 ring-offset-1'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                            'bg-blue-100 text-blue-700'
                          )}
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-blue-600">{task.title}</span>
                            <div className="flex items-center gap-1">
                              {!canManageTasks ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Lock className="h-4 w-4 shrink-0 text-gray-400" />
                                  </TooltipTrigger>
                                  <TooltipContent side="left">
                                    <p className="max-w-[200px] text-xs">
                                      Deployed items cannot be edited. This session is active or
                                      completed.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    void handleUndeploy(task)
                                  }}
                                  disabled={undeployingIds.has(task.id)}
                                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500"
                                  aria-label={`Remove ${task.title}`}
                                >
                                  {undeployingIds.has(task.id) ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                          <span className="text-xs text-gray-500">
                            Deployed {new Date(task.deployedAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </button>

                      {extensions.length > 0 && (
                        <div className="relative ml-6 space-y-1 border-l-2 border-blue-100 pl-3">
                          {extensions.map(ext => {
                            const extActive = activeTaskId === ext.id
                            return (
                              <button
                                key={ext.id}
                                type="button"
                                onClick={() => onSelectTask?.(ext.id, ext.source || 'task')}
                                className={cn(
                                  'flex w-full items-center gap-2 rounded-lg border border-blue-500 bg-white px-3 py-2 text-left transition-colors',
                                  extActive && 'ring-2 ring-blue-500 ring-offset-1'
                                )}
                              >
                                <span className="min-w-0 flex-1 text-sm font-medium text-blue-600">
                                  {ext.title}
                                </span>
                                <div className="flex items-center gap-1">
                                  {!canManageTasks ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Lock className="ml-auto h-4 w-4 shrink-0 text-gray-400" />
                                      </TooltipTrigger>
                                      <TooltipContent side="left">
                                        <p className="max-w-[200px] text-xs">
                                          Deployed items cannot be edited. This session is active or
                                          completed.
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation()
                                        void handleUndeploy(ext as LiveTask)
                                      }}
                                      disabled={undeployingIds.has(ext.id)}
                                      className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500"
                                      aria-label={`Remove ${ext.title}`}
                                    >
                                      {undeployingIds.has(ext.id) ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {liveHomework.length > 0 && (
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFoldersOpen(prev => ({ ...prev, homework: !prev.homework }))}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-gray-700 hover:bg-slate-100"
                >
                  {foldersOpen.homework ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                  )}
                  <Folder className="h-4 w-4 shrink-0 text-blue-400" fill="currentColor" />
                  Homework
                </button>
                {foldersOpen.homework && (
                  <div className="space-y-1">
                    {liveHomework.map(hw => (
                      <button
                        key={hw.id}
                        type="button"
                        onClick={() => onSelectTask?.(hw.id, 'homework')}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-lg border border-blue-500 bg-white px-3 py-2 text-left transition-colors',
                          activeTaskId === hw.id && 'ring-2 ring-blue-500 ring-offset-1'
                        )}
                      >
                        <span className="text-sm font-medium text-blue-600">{hw.title}</span>
                        <div className="flex items-center gap-1">
                          {!canManageTasks ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Lock className="h-4 w-4 shrink-0 text-gray-400" />
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                <p className="max-w-[200px] text-xs">
                                  Deployed items cannot be edited. This session is active or
                                  completed.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation()
                                void handleUndeploy(hw)
                              }}
                              disabled={undeployingIds.has(hw.id)}
                              className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500"
                              aria-label={`Remove ${hw.title}`}
                            >
                              {undeployingIds.has(hw.id) ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  )
}
