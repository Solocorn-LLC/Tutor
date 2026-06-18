/**
 * Socket.io handler module — extracted from socket-server.ts for maintainability.
 */

import { Server as SocketIOServer, Socket } from 'socket.io'
import * as Y from 'yjs'
import { generateWithFallback } from '@/lib/agents'
import { z } from 'zod'
import { safeJsonParseWithSchema } from '@/lib/ai/json'
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
  PollState,
  PdfCollabRoomState,
  LiveDocumentShare,
} from '@/lib/socket'

type PollListCallback = (result: {
  success: boolean
  polls: Array<{
    id: string
    sessionId: string
    tutorId: string
    question: string
    type: PollState['type']
    options: PollState['options']
    isAnonymous: boolean
    allowMultiple: boolean
    showResults: boolean
    timeLimit?: number
    status: PollState['status']
    startedAt?: string
    endedAt?: string
    responses: Array<{
      id: string
      optionIds?: string[]
      rating?: number
      textAnswer?: string
      studentId?: string
      createdAt: string
    }>
    totalResponses: number
    createdAt: string
  }>
}) => void

export function initPollHandlers(io: SocketIOServer, socket: Socket) {
  // Join poll room for a session
  socket.on('poll:join', (data: { sessionId: string }) => {
    socket.join(`poll:${data.sessionId}`)
    socket.data.pollSessionId = data.sessionId
  })

  // Leave poll room
  socket.on('poll:leave', (data: { sessionId: string }) => {
    socket.leave(`poll:${data.sessionId}`)
    delete socket.data.pollSessionId
  })

  // Get list of polls for session
  socket.on('poll:list', (data: { sessionId: string }, callback: PollListCallback) => {
    const pollIds = sessionPolls.get(data.sessionId) || new Set()
    const polls = Array.from(pollIds)
      .map(id => activePolls.get(id))
      .filter((p): p is PollState => p !== undefined)
      .map(p => ({
        id: p.id,
        sessionId: p.sessionId,
        tutorId: p.tutorId,
        question: p.question,
        type: p.type,
        options: p.options,
        isAnonymous: p.isAnonymous,
        allowMultiple: p.allowMultiple,
        showResults: p.showResults,
        timeLimit: p.timeLimit,
        status: p.status,
        startedAt: p.startedAt ? new Date(p.startedAt).toISOString() : undefined,
        endedAt: p.endedAt ? new Date(p.endedAt).toISOString() : undefined,
        responses: p.responses.map(r => ({
          id: r.id,
          optionIds: r.optionIds,
          rating: r.rating,
          textAnswer: r.textAnswer,
          studentId: p.isAnonymous ? undefined : r.studentId,
          createdAt: new Date(r.createdAt).toISOString(),
        })),
        totalResponses: p.responses.length,
        createdAt: new Date().toISOString(),
      }))

    callback({ success: true, polls })
  })

  // Create new poll
  socket.on(
    'poll:create',
    (data: {
      sessionId: string
      question: string
      type: string
      options: { label: string; text: string }[]
      isAnonymous: boolean
      allowMultiple: boolean
      showResults: boolean
      timeLimit?: number
    }) => {
      if (socket.data.role !== 'tutor') return

      const pollId = `poll-${data.sessionId}-${Date.now()}`
      const poll: PollState = {
        id: pollId,
        sessionId: data.sessionId,
        tutorId: socket.data.userId,
        question: data.question,
        type: data.type as PollState['type'],
        options: data.options.map((opt, i) => ({
          id: `opt-${pollId}-${i}`,
          label: opt.label || String.fromCharCode(65 + i),
          text: opt.text,
          color: getPollOptionColor(i),
        })),
        isAnonymous: data.isAnonymous,
        allowMultiple: data.allowMultiple,
        showResults: data.showResults,
        timeLimit: data.timeLimit,
        status: 'draft',
        responses: [],
      }

      activePolls.set(pollId, poll)

      // Add to session polls
      if (!sessionPolls.has(data.sessionId)) {
        sessionPolls.set(data.sessionId, new Set())
      }
      sessionPolls.get(data.sessionId)!.add(pollId)

      // Broadcast to session
      io.to(`poll:${data.sessionId}`).emit('poll:created', formatPollForBroadcast(poll))
    }
  )

  // Start poll
  socket.on('poll:start', (data: { pollId: string; sessionId: string }) => {
    if (socket.data.role !== 'tutor') return

    const poll = activePolls.get(data.pollId)
    if (!poll || poll.sessionId !== data.sessionId) return

    poll.status = 'active'
    poll.startedAt = Date.now()

    // Set timer if time limit specified
    if (poll.timeLimit) {
      poll.timer = setTimeout(() => {
        endPoll(io, data.pollId)
      }, poll.timeLimit * 1000)
    }

    // Broadcast to session
    io.to(`poll:${data.sessionId}`).emit('poll:started', formatPollForBroadcast(poll))
  })

  // End poll
  socket.on('poll:end', (data: { pollId: string; sessionId: string }) => {
    if (socket.data.role !== 'tutor') return
    endPoll(io, data.pollId)
  })

  // Delete poll
  socket.on('poll:delete', (data: { pollId: string; sessionId: string }) => {
    if (socket.data.role !== 'tutor') return

    const poll = activePolls.get(data.pollId)
    if (!poll || poll.sessionId !== data.sessionId) return

    // Clear timer if exists
    if (poll.timer) {
      clearTimeout(poll.timer)
    }

    activePolls.delete(data.pollId)
    sessionPolls.get(data.sessionId)?.delete(data.pollId)

    io.to(`poll:${data.sessionId}`).emit('poll:deleted', data.pollId)
  })

  // Submit vote
  socket.on(
    'poll:vote',
    async (data: {
      pollId: string
      sessionId: string
      optionIds?: string[]
      rating?: number
      textAnswer?: string
    }) => {
      const poll = activePolls.get(data.pollId)
      if (!poll || poll.sessionId !== data.sessionId) return
      if (poll.status !== 'active') return

      const userId = socket.data.userId

      // Check for duplicate vote (for non-anonymous polls, check by userId)
      if (!poll.isAnonymous) {
        const existingVote = poll.responses.find(r => r.studentId === userId)
        if (existingVote) return
      } else {
        // For anonymous polls, use a hash of userId + pollId
        const respondentHash = await hashString(`${userId}:${data.pollId}`)
        const existingVote = poll.responses.find(r => r.respondentHash === respondentHash)
        if (existingVote) return
      }

      const response = {
        id: `resp-${data.pollId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        respondentHash: poll.isAnonymous ? await hashString(`${userId}:${data.pollId}`) : undefined,
        optionIds: data.optionIds,
        rating: data.rating,
        textAnswer: data.textAnswer,
        studentId: poll.isAnonymous ? undefined : userId,
        createdAt: Date.now(),
      }

      poll.responses.push(response)

      // Broadcast updated poll
      io.to(`poll:${data.sessionId}`).emit('poll:updated', formatPollForBroadcast(poll))

      // Confirm vote to sender
      socket.emit('poll:vote:confirmed', { pollId: data.pollId })
    }
  )
}

function endPoll(io: SocketIOServer, pollId: string) {
  const poll = activePolls.get(pollId)
  if (!poll || poll.status === 'closed') return

  poll.status = 'closed'
  poll.endedAt = Date.now()

  // Clear timer
  if (poll.timer) {
    clearTimeout(poll.timer)
    poll.timer = undefined
  }

  // Broadcast to session
  io.to(`poll:${poll.sessionId}`).emit('poll:ended', formatPollForBroadcast(poll))
}

function formatPollForBroadcast(poll: PollState) {
  return {
    id: poll.id,
    sessionId: poll.sessionId,
    tutorId: poll.tutorId,
    question: poll.question,
    type: poll.type,
    options: poll.options,
    isAnonymous: poll.isAnonymous,
    allowMultiple: poll.allowMultiple,
    showResults: poll.showResults,
    timeLimit: poll.timeLimit,
    status: poll.status,
    startedAt: poll.startedAt ? new Date(poll.startedAt).toISOString() : undefined,
    endedAt: poll.endedAt ? new Date(poll.endedAt).toISOString() : undefined,
    responses: poll.responses.map(r => ({
      id: r.id,
      optionIds: r.optionIds,
      rating: r.rating,
      textAnswer: r.textAnswer,
      studentId: poll.isAnonymous ? undefined : r.studentId,
      createdAt: new Date(r.createdAt).toISOString(),
    })),
    totalResponses: poll.responses.length,
    createdAt: new Date().toISOString(),
  }
}

function getPollOptionColor(index: number): string {
  const colors = [
    '#3b82f6', // blue-500
    '#10b981', // emerald-500
    '#f59e0b', // amber-500
    '#ef4444', // red-500
    '#8b5cf6', // violet-500
    '#ec4899', // pink-500
  ]
  return colors[index % colors.length]
}

async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
