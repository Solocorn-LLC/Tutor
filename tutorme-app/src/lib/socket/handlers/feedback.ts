/**
 * Socket.io handler module — extracted from socket-server.ts for maintainability.
 */

import { Server as SocketIOServer, Socket } from 'socket.io'
import * as Y from 'yjs'
import { generateWithFallback } from '@/lib/agents'
import { z } from 'zod'
import { safeJsonParseWithSchema } from '@/lib/ai/json'
import { eq, and } from 'drizzle-orm'
import { drizzleDb as db } from '@/lib/db/drizzle'
import {
  poll as dbPoll,
  pollOption as dbPollOption,
  pollResponse as dbPollResponse,
} from '@/lib/db/schema'
import {
  CHAT_HISTORY_MAX,
  CHAT_HISTORY_SLICE_TO_STUDENT,
  LIVE_CLASS_EXPORTS_MAX,
  LIVE_CLASS_SNAPSHOTS_MAX,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_DM_MESSAGE_LENGTH,
  NAME_MAX_LENGTH,
  PDF_EVENTS_MAX,
  ROOM_CLEANUP_INTERVAL_MS,
  DM_CLEANUP_INTERVAL_MS,
  DM_ROOM_IDLE_CLEANUP_MS,
  LIVE_DOC_CLEANUP_INTERVAL_MS,
  PDF_CLEANUP_INTERVAL_MS,
  ROOM_IDLE_CLEANUP_MS,
  ROOM_ID_MAX_LENGTH,
  USER_ID_MAX_LENGTH,
  LCWB_AI_REGION_RATE_LIMIT_PER_MIN,
  LCWB_AI_REGION_RATE_WINDOW_MS,
  WHITEBOARD_OP_SEEN_MAX,
  WHITEBOARD_OP_SEEN_TRIM,
  WHITEBOARD_DEAD_LETTER_MAX,
  WHITEBOARD_OP_LOG_MAX,
  MAX_STROKES,
  activeRooms,
  directMessageRooms,
  userSocketMap,
  getConversationParticipantIds,
  getPdfCollabRoom,
  getLiveDocumentShareMap,
  expandLiveShareForStudents,
  activeWhiteboards,
  whiteboardOpMetrics,
  whiteboardSelectionPresence,
  lcwbAiRegionRateLimit,
  whiteboardOpSeenIds,
  whiteboardDeadLetters,
  whiteboardOpLog,
  whiteboardOpSeq,
  whiteboardBranches,
  liveClassModeration,
  liveClassSnapshots,
  liveClassExports,
  mathWhiteboardRooms,
  mathSyncMetrics,
  breakoutRooms,
  mainRoomBreakouts,
  getWhiteboardOpMetric,
  trimWhiteboardOpTimestamps,
  applyStrokeOps,
  isValidStroke,
  sanitizeWhiteboardOps,
  pushWhiteboardDeadLetters,
  appendWhiteboardOpLog,
  getLiveClassModerationState,
  appendLiveClassSnapshot,
  getMathSyncMetric,
  trimRecentUpdates,
  getMathWhiteboardRoom,
  trimPdfEvents,
  pdfCollabRooms,
  liveDocumentShares,
  activePolls,
  sessionPolls,
  deployedTasks,
  feedbackPolls,
  feedbackQuestions,
} from '@/lib/socket'
import type {
  StudentState,
  ChatMessage,
  ClassRoom,
  DirectMessageRoom,
  WhiteboardStroke,
  WhiteboardStrokeOp,
  WhiteboardShape,
  WhiteboardText,
  WhiteboardState,
  WhiteboardSelectionPresence,
  LiveClassModerationState,
  LiveClassSnapshot,
  MathWhiteboardRoomState,
  BreakoutRoom,
  PollState,
  PdfCollabRoomState,
  LiveDocumentShare,
} from '@/lib/socket'

export function initFeedbackHandlers(io: SocketIOServer, socket: Socket) {
  // Student joins feedback room
  socket.on('student_feedback_join', (data: { studentId: string }) => {
    socket.join(`feedback:student:${data.studentId}`)
    socket.data.feedbackStudentId = data.studentId
  })

  // Tutor joins insights room
  socket.on('tutor_insights_join', (data: { tutorId: string }) => {
    socket.join(`insights:tutor:${data.tutorId}`)
    socket.data.insightsTutorId = data.tutorId
  })

  // Tutor deploys a task
  socket.on(
    'deploy_task',
    (data: {
      taskId: string
      title: string
      content: string
      type: 'task' | 'assessment'
      tutorId: string
      tutorName: string
      studentIds: string[]
    }) => {
      if (socket.data.role !== 'tutor') return

      const deploymentId = `deploy-${Date.now()}`
      const deployedTask = {
        id: deploymentId,
        taskId: data.taskId,
        title: data.title,
        content: data.content,
        type: data.type,
        deployedAt: new Date().toISOString(),
        tutorId: data.tutorId,
        tutorName: data.tutorName,
        students: new Set(data.studentIds),
      }

      deployedTasks.set(deploymentId, deployedTask)

      // Notify all targeted students
      data.studentIds.forEach(studentId => {
        io.to(`feedback:student:${studentId}`).emit('task_deployed', {
          id: deploymentId,
          taskId: data.taskId,
          title: data.title,
          content: data.content,
          type: data.type,
          deployedAt: deployedTask.deployedAt,
          tutorId: data.tutorId,
          tutorName: data.tutorName,
        })
      })
    }
  )

  // Tutor sends a poll
  socket.on(
    'send_poll',
    (data: {
      id: string
      question: string
      options: number[]
      sentAt: string
      tutorId: string
      tutorName: string
    }) => {
      if (socket.data.role !== 'tutor') return

      const poll = {
        id: data.id,
        taskId: '', // Will be set when linked to a task
        question: data.question,
        options: data.options,
        responses: new Map<string, number>(),
        isActive: true,
        sentAt: data.sentAt,
        tutorId: data.tutorId,
      }

      feedbackPolls.set(data.id, poll)

      // Broadcast to room if available
      const roomId = socket.data.roomId
      if (roomId) {
        io.to(roomId).emit('poll_received', {
          id: data.id,
          taskId: '',
          question: data.question,
          options: data.options,
          responses: {},
          isActive: true,
          sentAt: data.sentAt,
        })

        // Additive persistence: mirror this in-memory poll into the
        // poll/pollOption tables so reporting/insights can see it too.
        Promise.resolve()
          .then(async () => {
            await db.insert(dbPoll).values({
              pollId: data.id,
              sessionId: roomId,
              tutorId: data.tutorId,
              question: data.question,
              type: 'RATING',
              isAnonymous: false,
              allowMultiple: false,
              showResults: true,
              status: 'ACTIVE',
              startedAt: new Date(data.sentAt),
            })
            await db.insert(dbPollOption).values(
              data.options.map((opt, index) => ({
                optionId: `${data.id}-opt-${opt}`,
                pollId: data.id,
                label: String.fromCharCode(65 + index),
                text: String(opt),
              }))
            )
          })
          .catch(err => {
            console.error('[send_poll] Failed to persist poll:', err)
          })
      }

      // Notify tutor of success
      socket.emit('poll_sent', { pollId: data.id, success: true })
    }
  )

  // Tutor sends a question
  socket.on(
    'send_question',
    (data: {
      id: string
      question: string
      sentAt: string
      tutorId: string
      tutorName: string
    }) => {
      if (socket.data.role !== 'tutor') return

      const question = {
        id: data.id,
        taskId: '', // Will be set when linked to a task
        question: data.question,
        answers: new Map<string, { answer: string; answeredAt: string }>(),
        sentAt: data.sentAt,
        tutorId: data.tutorId,
      }

      feedbackQuestions.set(data.id, question)

      // Broadcast to room if available
      const roomId = socket.data.roomId
      if (roomId) {
        io.to(roomId).emit('question_received', {
          id: data.id,
          taskId: '',
          question: data.question,
          sentAt: data.sentAt,
        })
      }

      // Notify tutor of success
      socket.emit('question_sent', { questionId: data.id, success: true })
    }
  )

  // Student responds to a poll
  socket.on(
    'poll_response',
    (data: { pollId: string; studentId: string; option: number; taskId?: string }) => {
      if (socket.data.role !== 'student') return

      const poll = feedbackPolls.get(data.pollId)
      if (!poll || !poll.isActive) return

      // Store response
      poll.responses.set(data.studentId, data.option)

      // Notify tutor
      io.to(`insights:tutor:${poll.tutorId}`).emit('poll_response_received', {
        pollId: data.pollId,
        response: {
          studentId: data.studentId,
          option: data.option,
          respondedAt: new Date().toISOString(),
        },
      })

      // Update all students with new poll data
      io.emit('poll_updated', {
        id: poll.id,
        taskId: poll.taskId,
        question: poll.question,
        options: poll.options,
        responses: Object.fromEntries(poll.responses),
        isActive: poll.isActive,
        sentAt: poll.sentAt,
      })

      // Additive persistence: mirror this response into pollResponse so
      // reporting/insights queries pick up feedback-poll activity too.
      Promise.resolve()
        .then(async () => {
          await db
            .delete(dbPollResponse)
            .where(
              and(
                eq(dbPollResponse.pollId, data.pollId),
                eq(dbPollResponse.studentId, data.studentId)
              )
            )
          await db.insert(dbPollResponse).values({
            responseId: crypto.randomUUID(),
            pollId: data.pollId,
            studentId: data.studentId,
            optionIds: [],
            rating: data.option,
          })
        })
        .catch(err => {
          console.error('[poll_response] Failed to persist poll response:', err)
        })
    }
  )

  // Student answers a question
  socket.on(
    'question_answer',
    (data: { questionId: string; studentId: string; answer: string; taskId?: string }) => {
      if (socket.data.role !== 'student') return

      const question = feedbackQuestions.get(data.questionId)
      if (!question) return

      // Store answer
      question.answers.set(data.studentId, {
        answer: data.answer,
        answeredAt: new Date().toISOString(),
      })

      // Notify tutor
      io.to(`insights:tutor:${question.tutorId}`).emit('question_answer_received', {
        questionId: data.questionId,
        studentId: data.studentId,
        answer: data.answer,
        answeredAt: new Date().toISOString(),
      })
    }
  )

  // Student sends chat message
  socket.on(
    'feedback_chat_message',
    (data: { studentId: string; message: string; taskId?: string; timestamp: string }) => {
      // Broadcast to tutor
      io.emit('feedback_chat_received', {
        studentId: data.studentId,
        message: data.message,
        taskId: data.taskId,
        timestamp: data.timestamp,
      })
    }
  )

  // Tutor closes a poll
  socket.on('close_poll', (data: { pollId: string }) => {
    if (socket.data.role !== 'tutor') return

    const poll = feedbackPolls.get(data.pollId)
    if (poll) {
      poll.isActive = false
      io.emit('poll_updated', {
        id: poll.id,
        taskId: poll.taskId,
        question: poll.question,
        options: poll.options,
        responses: Object.fromEntries(poll.responses),
        isActive: false,
        sentAt: poll.sentAt,
      })

      // Additive persistence: mark the mirrored poll row as closed.
      db.update(dbPoll)
        .set({ status: 'CLOSED', endedAt: new Date(), totalResponses: poll.responses.size })
        .where(eq(dbPoll.pollId, data.pollId))
        .catch(err => {
          console.error('[close_poll] Failed to persist poll close:', err)
        })
    }
  })

  // Get analytics data
  socket.on(
    'get_analytics',
    (
      data: { tutorId: string },
      callback: (data: {
        activeStudents: number
        taskCompletionRate: number
        averageScore: number
        activePolls: number
        pendingQuestions: number
        pollResults: {
          pollId: string
          question: string
          responses: { option: number; count: number }[]
          totalResponses: number
        }[]
      }) => void
    ) => {
      if (socket.data.role !== 'tutor') return

      // Calculate analytics
      const activePolls = Array.from(feedbackPolls.values()).filter(p => p.isActive).length
      const pendingQuestions = Array.from(feedbackQuestions.values()).filter(
        q => q.answers.size === 0
      ).length

      const pollResults = Array.from(feedbackPolls.values()).map(poll => ({
        pollId: poll.id,
        question: poll.question,
        responses: poll.options.map(option => ({
          option,
          count: Array.from(poll.responses.values()).filter(r => r === option).length,
        })),
        totalResponses: poll.responses.size,
      }))

      callback({
        activeStudents: io.engine.clientsCount,
        taskCompletionRate: 0, // Would calculate from actual data
        averageScore: 0, // Would calculate from actual data
        activePolls,
        pendingQuestions,
        pollResults,
      })
    }
  )
}
