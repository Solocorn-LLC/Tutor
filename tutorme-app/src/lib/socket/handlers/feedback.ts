/**
 * Socket.io handler module — extracted from socket-server.ts for maintainability.
 */

import { Server as SocketIOServer, Socket } from 'socket.io'
import { eq, and } from 'drizzle-orm'
import { drizzleDb as db } from '@/lib/db/drizzle'
import {
  poll as dbPoll,
  pollOption as dbPollOption,
  pollResponse as dbPollResponse,
} from '@/lib/db/schema'
import { deployedTasks, feedbackPolls, feedbackQuestions } from '@/lib/socket'

export function initFeedbackHandlers(io: SocketIOServer, socket: Socket) {
  // Student joins their OWN feedback room. The room id is derived from the
  // authenticated socket, never a client-supplied studentId — otherwise any user
  // could subscribe to another student's private feedback stream.
  socket.on('student_feedback_join', () => {
    const studentId = socket.data.userId
    if (!studentId) return
    socket.join(`feedback:student:${studentId}`)
    socket.data.feedbackStudentId = studentId
  })

  // Tutor joins their OWN insights room (tutors only, id from the session).
  socket.on('tutor_insights_join', () => {
    if (socket.data.role !== 'tutor' || !socket.data.userId) return
    const tutorId = socket.data.userId
    socket.join(`insights:tutor:${tutorId}`)
    socket.data.insightsTutorId = tutorId
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
      if (socket.data.role !== 'tutor' || !socket.data.userId) return
      // Attribute the poll to the authenticated tutor, not a client-supplied id
      // (which was previously written straight into the DB poll row).
      const tutorId = socket.data.userId

      const poll = {
        id: data.id,
        taskId: '', // Will be set when linked to a task
        question: data.question,
        options: data.options,
        responses: new Map<string, number>(),
        isActive: true,
        sentAt: data.sentAt,
        tutorId,
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
              tutorId,
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
      if (socket.data.role !== 'student' || !socket.data.userId) return
      // Identity comes from the authenticated socket, not the client payload,
      // which could otherwise submit or overwrite another student's response.
      const studentId = socket.data.userId

      const poll = feedbackPolls.get(data.pollId)
      if (!poll || !poll.isActive) return

      // Store response
      poll.responses.set(studentId, data.option)

      // Notify tutor
      io.to(`insights:tutor:${poll.tutorId}`).emit('poll_response_received', {
        pollId: data.pollId,
        response: {
          studentId,
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
                eq(dbPollResponse.studentId, studentId)
              )
            )
          await db.insert(dbPollResponse).values({
            responseId: crypto.randomUUID(),
            pollId: data.pollId,
            studentId,
            optionIds: [],
            rating: data.option,
          })
          await db
            .update(dbPoll)
            .set({ totalResponses: poll.responses.size })
            .where(eq(dbPoll.pollId, data.pollId))
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
