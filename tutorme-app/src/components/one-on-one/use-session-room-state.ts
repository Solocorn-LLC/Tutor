'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Socket } from 'socket.io-client'
import type { StudentDmiItem } from '@/lib/assessment/student-dmi'
import type { AutoGradeQuestionResult } from '@/lib/grading/auto-grade'

/** The auto-grade outcome for one submission. `correctAnswers` is present only
 *  when the tutor's answer-reveal policy permits it and the student has
 *  submitted; it reaches the submitter + tutor only, never peers. */
export interface SessionGradeResult {
  score: number | null
  questionResults: AutoGradeQuestionResult[] | null
  correctAnswers?: Record<string, string> | null
}

export interface SessionSourceDocument {
  fileName: string
  fileUrl: string
  fileKey?: string
  mimeType: string
}

/** A deployed task as the classroom knows it (student-safe — no answer key). */
export interface SessionRoomTask {
  id: string
  title: string
  content?: string
  source?: string
  dmiItems?: StudentDmiItem[]
  sourceDocument?: SessionSourceDocument
  completedBy?: string[]
  /** When the tutor deployed it (epoch ms or ISO). Sent on the deploy payload +
   *  room_state; used to order/label the deployed-items list. */
  deployedAt?: string | number
}

export interface SessionStudentResponse {
  studentId: string
  studentName: string
  completedAt: number
  answers: Record<string, string>
  /** The auto-grade outcome, once it lands (via task:graded). */
  score?: number | null
  questionResults?: AutoGradeQuestionResult[] | null
  correctAnswers?: Record<string, string> | null
}

export interface SessionPollTally {
  pollId: string
  counts: number[]
  total: number
}

/** The active in-session live poll as the client tracks it. */
export interface SessionActivePoll {
  id: string
  question: string
  options: string[]
  tally?: SessionPollTally | null
  /** This user's chosen option (hydrated on join; set locally on vote). */
  myOptionIndex?: number | null
}

/** A room chat message (mirrors the socket server's ChatMessage). */
export interface SessionChatMessage {
  id: string
  userId: string
  name: string
  text: string
  timestamp: number
  isAI?: boolean
}

/** A roster student as the tutor's Monitor sees them — identity plus the live
 *  engagement/understanding/status signals the socket server tracks. */
export interface SessionRosterStudent {
  userId: string
  name: string
  engagement?: number
  understanding?: number | null
  status?: string
  currentActivity?: string
  lastActivity?: number
  joinedAt?: number
}

interface StudentStateUpdate {
  userId: string
  state?: {
    engagement?: number
    understanding?: number | null
    status?: string
    currentActivity?: string
    lastActivity?: number
  }
}

interface RoomStatePayload {
  students?: Array<Partial<SessionRosterStudent> & { userId: string }>
  tasks?: Array<SessionRoomTask & { responses?: Record<string, Record<string, string>> }>
  chatHistory?: SessionChatMessage[]
  activePoll?: SessionActivePoll | null
}

interface TaskCompletedEvent {
  taskId: string
  studentId: string
  studentName?: string
  completedAt?: number
  answers?: Record<string, string>
}

interface TaskGradedEvent {
  taskId: string
  studentId: string
  score?: number | null
  questionResults?: AutoGradeQuestionResult[] | null
  correctAnswers?: Record<string, string> | null
}

/**
 * The single source of truth for a session classroom's deployed tasks and their
 * submissions — held here in the always-mounted classroom, not in the panels.
 *
 * The panels (Materials, Responses) mount only when the user opens them, so if
 * they subscribed to socket events themselves they'd miss everything that
 * happened before they opened (a task deployed earlier, an answer already
 * submitted) and everything after a rejoin. This hook subscribes from the
 * classroom, which is mounted from join, so it captures the join-time
 * `room_state` replay as well as the live `task:*` events — and the panels just
 * render its output.
 */
export function useSessionRoomState(socket: Socket | null, myUserId: string | undefined) {
  const [tasks, setTasks] = useState<SessionRoomTask[]>([])
  // taskId -> studentId -> response
  const [responsesByTask, setResponsesByTask] = useState<
    Record<string, Record<string, SessionStudentResponse>>
  >({})
  // The student roster (for the tutor's board viewer + Monitor), from room_state +
  // joins, enriched by live `student_state_update` events.
  const [students, setStudents] = useState<SessionRosterStudent[]>([])
  // Room chat — hydrated from room_state on join, appended live. Held here (in the
  // always-mounted classroom) so the chat panel shows history even when opened late.
  const [chatMessages, setChatMessages] = useState<SessionChatMessage[]>([])
  // The active in-session live poll (null when none). Hydrated on join, updated by
  // poll:started / poll:tally / poll:closed.
  const [activePoll, setActivePoll] = useState<SessionActivePoll | null>(null)

  useEffect(() => {
    if (!socket) return

    const mergeStudents = (incoming: Array<Partial<SessionRosterStudent> & { userId: string }>) =>
      setStudents(prev => {
        const byId = new Map(prev.map(s => [s.userId, s]))
        for (const s of incoming) {
          if (!s?.userId) continue
          const existing = byId.get(s.userId)
          byId.set(s.userId, {
            ...existing,
            ...s,
            userId: s.userId,
            name: s.name || existing?.name || 'Student',
          })
        }
        return Array.from(byId.values())
      })

    // Live engagement/understanding/status changes (the tutor's Monitor).
    const onStudentState = (u: StudentStateUpdate) => {
      if (!u?.userId || !u.state) return
      mergeStudents([{ userId: u.userId, ...u.state }])
    }

    const upsertTask = (t: SessionRoomTask) => {
      if (!t?.id) return
      setTasks(prev =>
        prev.some(x => x.id === t.id)
          ? prev.map(x => (x.id === t.id ? { ...x, ...t } : x))
          : [...prev, t]
      )
    }

    // Join-time replay: hydrate both the deployed tasks and any submissions that
    // already happened (task.responses), naming students from the roster.
    const mergeChat = (incoming: SessionChatMessage[]) =>
      setChatMessages(prev => {
        const byId = new Map(prev.map(m => [m.id, m]))
        for (const m of incoming) if (m?.id) byId.set(m.id, m)
        return Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp)
      })

    const onRoomState = (state: RoomStatePayload) => {
      if (Array.isArray(state?.students)) mergeStudents(state.students)
      if (Array.isArray(state?.chatHistory)) mergeChat(state.chatHistory)
      if (state?.activePoll !== undefined) setActivePoll(state.activePoll)
      if (!Array.isArray(state?.tasks)) return
      const nameById = new Map((state.students ?? []).map(s => [s.userId, s.name || 'Student']))
      setTasks(prev => {
        const byId = new Map(prev.map(t => [t.id, t]))
        for (const t of state.tasks!) {
          if (t?.id) byId.set(t.id, { ...byId.get(t.id), ...t })
        }
        return Array.from(byId.values())
      })
      setResponsesByTask(prev => {
        const next = { ...prev }
        for (const t of state.tasks!) {
          if (!t?.id || !t.responses || typeof t.responses !== 'object') continue
          const perStudent = { ...(next[t.id] ?? {}) }
          for (const [sid, answers] of Object.entries(t.responses)) {
            // Don't clobber a richer live entry that already arrived.
            if (perStudent[sid]) continue
            perStudent[sid] = {
              studentId: sid,
              studentName: nameById.get(sid) || 'Student',
              completedAt: 0,
              answers: (answers as Record<string, string>) ?? {},
            }
          }
          next[t.id] = perStudent
        }
        return next
      })
    }

    const onDeployed = (t: SessionRoomTask) => upsertTask(t)
    const onUpdated = (payload: { task: SessionRoomTask }) => {
      if (payload?.task?.id) upsertTask(payload.task)
    }
    const onCompleted = (evt: TaskCompletedEvent) => {
      if (!evt?.taskId || !evt?.studentId) return
      setResponsesByTask(prev => ({
        ...prev,
        [evt.taskId]: {
          ...(prev[evt.taskId] ?? {}),
          [evt.studentId]: {
            studentId: evt.studentId,
            studentName: evt.studentName || 'Student',
            completedAt: evt.completedAt || 0,
            answers: evt.answers ?? {},
          },
        },
      }))
      // Reflect the completion on the task so the student's own submitted state
      // survives a panel close/reopen.
      setTasks(prev =>
        prev.map(t =>
          t.id === evt.taskId
            ? { ...t, completedBy: Array.from(new Set([...(t.completedBy ?? []), evt.studentId])) }
            : t
        )
      )
    }

    // The (student-safe) auto-grade result — merged onto the matching response,
    // creating a bare entry if the grade somehow beats the completion event.
    const onGraded = (evt: TaskGradedEvent) => {
      if (!evt?.taskId || !evt?.studentId) return
      setResponsesByTask(prev => {
        const perTask = prev[evt.taskId] ?? {}
        const existing = perTask[evt.studentId]
        return {
          ...prev,
          [evt.taskId]: {
            ...perTask,
            [evt.studentId]: {
              studentId: evt.studentId,
              studentName: existing?.studentName || 'Student',
              completedAt: existing?.completedAt ?? 0,
              answers: existing?.answers ?? {},
              score: evt.score ?? null,
              questionResults: evt.questionResults ?? null,
              correctAnswers: evt.correctAnswers ?? null,
            },
          },
        }
      })
    }

    const onStudentJoined = (data: {
      userId: string
      name?: string
      state?: Partial<SessionRosterStudent>
    }) => {
      // The server nests the live signals under `state` on join — flatten them so
      // the Monitor shows engagement/status straight away, not only after the next
      // student_state_update.
      if (data?.userId) mergeStudents([{ userId: data.userId, name: data.name, ...data.state }])
    }

    const onChatMessage = (msg: SessionChatMessage) => {
      if (msg?.id && typeof msg.text === 'string') mergeChat([msg])
    }

    const onPollStarted = (p: { id: string; question: string; options: string[] }) => {
      if (!p?.id) return
      setActivePoll({
        id: p.id,
        question: p.question,
        options: p.options ?? [],
        tally: { pollId: p.id, counts: (p.options ?? []).map(() => 0), total: 0 },
        myOptionIndex: null,
      })
    }
    const onPollTally = (t: SessionPollTally) =>
      setActivePoll(cur => (cur && cur.id === t?.pollId ? { ...cur, tally: t } : cur))
    const onPollClosed = (t: SessionPollTally) =>
      setActivePoll(cur => (cur && cur.id === t?.pollId ? null : cur))

    socket.on('room_state', onRoomState)
    socket.on('task:deployed', onDeployed)
    socket.on('task:updated', onUpdated)
    socket.on('task:completed', onCompleted)
    socket.on('task:graded', onGraded)
    socket.on('student_joined', onStudentJoined)
    socket.on('chat_message', onChatMessage)
    socket.on('student_state_update', onStudentState)
    socket.on('poll:started', onPollStarted)
    socket.on('poll:tally', onPollTally)
    socket.on('poll:closed', onPollClosed)
    return () => {
      socket.off('room_state', onRoomState)
      socket.off('task:deployed', onDeployed)
      socket.off('task:updated', onUpdated)
      socket.off('task:completed', onCompleted)
      socket.off('task:graded', onGraded)
      socket.off('student_joined', onStudentJoined)
      socket.off('chat_message', onChatMessage)
      socket.off('student_state_update', onStudentState)
      socket.off('poll:started', onPollStarted)
      socket.off('poll:tally', onPollTally)
      socket.off('poll:closed', onPollClosed)
    }
  }, [socket])

  const myCompletedTaskIds = useMemo(
    () =>
      new Set(
        tasks.filter(t => myUserId && (t.completedBy ?? []).includes(myUserId)).map(t => t.id)
      ),
    [tasks, myUserId]
  )

  // The current user's own grade per task (for the student's post-submit view).
  const myResultByTask = useMemo(() => {
    const out: Record<string, SessionGradeResult> = {}
    if (!myUserId) return out
    for (const [taskId, byStudent] of Object.entries(responsesByTask)) {
      const mine = byStudent[myUserId]
      if (mine && (mine.score != null || mine.questionResults != null)) {
        out[taskId] = {
          score: mine.score ?? null,
          questionResults: mine.questionResults ?? null,
          correctAnswers: mine.correctAnswers ?? null,
        }
      }
    }
    return out
  }, [responsesByTask, myUserId])

  return {
    tasks,
    responsesByTask,
    myCompletedTaskIds,
    myResultByTask,
    students,
    chatMessages,
    activePoll,
  }
}
