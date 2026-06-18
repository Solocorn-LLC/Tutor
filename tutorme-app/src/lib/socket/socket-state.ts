/**
 * Shared in-memory state and getters for the socket server.
 * Feature modules import from here to avoid circular dependencies.
 */

import * as Y from 'yjs'
import { eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { conversation } from '@/lib/db/schema'
import type {
  ClassRoom,
  DirectMessageRoom,
  PdfCollabRoomState,
  LiveDocumentShare,
  WhiteboardStroke,
  WhiteboardStrokeOp,
  WhiteboardState,
  WhiteboardOpMetricsState,
  WhiteboardOpObservabilitySnapshot,
  LiveClassModerationState,
  LiveClassSnapshot,
  MathWhiteboardRoomState,
  MathSyncMetricsState,
  MathSyncObservabilitySnapshot,
  PollState,
} from './socket-types'
import {
  CHAT_HISTORY_SLICE_TO_STUDENT,
  LIVE_CLASS_SNAPSHOTS_MAX,
  LIVE_CLASS_EXPORTS_MAX,
  PDF_EVENTS_MAX,
  WHITEBOARD_OP_SEEN_MAX,
  WHITEBOARD_OP_SEEN_TRIM,
  WHITEBOARD_DEAD_LETTER_MAX,
  WHITEBOARD_OP_LOG_MAX,
  MATH_WB_EMPTY_ROOM_CLEANUP_MS,
} from './socket-constants'

// Re-export types used by state helpers
export type { WhiteboardStroke, WhiteboardStrokeOp, WhiteboardOpMetricsState }

// ============ Class rooms ============
export const activeRooms = new Map<string, ClassRoom>()

// ============ Direct messaging ============
export const directMessageRooms = new Map<string, DirectMessageRoom>()
export const userSocketMap = new Map<string, string>()

export async function getConversationParticipantIds(
  conversationId: string
): Promise<{ participant1Id: string; participant2Id: string } | null> {
  try {
    const [conv] = await drizzleDb
      .select({
        participant1Id: conversation.participant1Id,
        participant2Id: conversation.participant2Id,
      })
      .from(conversation)
      .where(eq(conversation.conversationId, conversationId))
      .limit(1)
    return conv
      ? { participant1Id: conv.participant1Id, participant2Id: conv.participant2Id }
      : null
  } catch {
    return null
  }
}

// ============ PDF / live doc ============
export const pdfCollabRooms = new Map<string, PdfCollabRoomState>()
export const liveDocumentShares = new Map<string, Map<string, LiveDocumentShare>>()

export function getPdfCollabRoom(roomId: string): PdfCollabRoomState {
  const key = `pdf:${roomId}`
  let room = pdfCollabRooms.get(key)
  if (!room) {
    room = {
      roomId: key,
      locked: false,
      ownerId: undefined,
      lastActivity: Date.now(),
      participants: new Map(),
      events: [],
    }
    pdfCollabRooms.set(key, room)
  }
  return room
}

export function getLiveDocumentShareMap(classRoomId: string): Map<string, LiveDocumentShare> {
  let shareMap = liveDocumentShares.get(classRoomId)
  if (!shareMap) {
    shareMap = new Map<string, LiveDocumentShare>()
    liveDocumentShares.set(classRoomId, shareMap)
  }
  return shareMap
}

export function expandLiveShareForStudents(
  classRoomId: string,
  template: LiveDocumentShare
): LiveDocumentShare[] {
  const room = activeRooms.get(classRoomId)
  if (!room) return []
  const now = Date.now()
  const clones: LiveDocumentShare[] = []
  room.students.forEach((studentState, studentId) => {
    clones.push({
      ...template,
      shareId: `${template.shareId}::${studentId}`,
      ownerId: studentId,
      ownerName: studentState.name,
      assignedStudentId: studentId,
      templateShareId: template.shareId,
      visibleToAll: false,
      active: true,
      pdfRoomId: `${template.pdfRoomId}:student:${studentId}`,
      updatedAt: now,
    })
  })
  return clones
}

// ============ Whiteboard (generic + LCWB) ============
export const activeWhiteboards = new Map<string, WhiteboardState>()
export const whiteboardOpMetrics = new Map<string, WhiteboardOpMetricsState>()
export const whiteboardSelectionPresence = new Map<
  string,
  Map<string, import('./socket-types').WhiteboardSelectionPresence>
>()
export const lcwbAiRegionRateLimit = new Map<string, { count: number; resetAt: number }>()
export const whiteboardOpSeenIds = new Map<string, Set<string>>()
export const whiteboardDeadLetters = new Map<
  string,
  Array<{ at: number; reason: 'malformed' | 'duplicate' | 'causal'; op: WhiteboardStrokeOp }>
>()
export const whiteboardOpLog = new Map<
  string,
  Array<{ seq: number; at: number; op: WhiteboardStrokeOp }>
>()
export const whiteboardOpSeq = new Map<string, number>()
export const whiteboardBranches = new Map<string, Map<string, WhiteboardStroke[]>>()

export const liveClassModeration = new Map<string, LiveClassModerationState>()
export const liveClassSnapshots = new Map<string, LiveClassSnapshot[]>()
export const liveClassExports = new Map<
  string,
  Array<{
    id: string
    roomId: string
    sessionId?: string
    studentId?: string
    format: 'png' | 'pdf'
    fileName: string
    dataUrl: string
    createdAt: number
    createdBy: string
  }>
>()

function parseWhiteboardMetricKey(key: string): {
  roomId: string
  boardScope: 'tutor' | 'student'
  studentId?: string
} {
  if (key.startsWith('lcwb:tutor:')) {
    return { roomId: key.replace('lcwb:tutor:', ''), boardScope: 'tutor' }
  }
  if (key.startsWith('lcwb:')) {
    const parts = key.split(':')
    return { roomId: parts[1] || 'unknown', boardScope: 'student', studentId: parts[2] }
  }
  return { roomId: key, boardScope: 'student' }
}

export function getWhiteboardOpMetric(key: string): WhiteboardOpMetricsState {
  let metric = whiteboardOpMetrics.get(key)
  if (!metric) {
    const parsed = parseWhiteboardMetricKey(key)
    metric = {
      key,
      roomId: parsed.roomId,
      boardScope: parsed.boardScope,
      studentId: parsed.studentId,
      lastActivity: Date.now(),
      receivedOps: 0,
      appliedOps: 0,
      conflictDrops: 0,
      duplicateDrops: 0,
      malformedDrops: 0,
      queueDepth: 0,
      maxQueueDepth: 0,
      replayRequests: 0,
      recentAppliedTimestamps: [],
    }
    whiteboardOpMetrics.set(key, metric)
  }
  return metric
}

export function trimWhiteboardOpTimestamps(metric: WhiteboardOpMetricsState) {
  const cutoff = Date.now() - 60_000
  metric.recentAppliedTimestamps = metric.recentAppliedTimestamps.filter(ts => ts >= cutoff)
}

export function applyStrokeOps(
  current: WhiteboardStroke[],
  ops: WhiteboardStrokeOp[]
): {
  next: WhiteboardStroke[]
  appliedCount: number
  conflictDrops: number
  causalDrops: WhiteboardStrokeOp[]
} {
  if (!ops.length) {
    return { next: current, appliedCount: 0, conflictDrops: 0, causalDrops: [] }
  }
  const byId = new Map(current.map(s => [s.id, s]))
  let appliedCount = 0
  let conflictDrops = 0
  const causalDrops: WhiteboardStrokeOp[] = []
  ops.forEach(op => {
    if (op.kind === 'delete') {
      if (op.strokeId && byId.has(op.strokeId)) {
        byId.delete(op.strokeId)
        appliedCount += 1
      }
      return
    }
    if (op.stroke) {
      const existing = byId.get(op.stroke.id)
      const incomingVersion = op.stroke.updatedAt ?? op.stroke.createdAt ?? 0
      const currentVersion = existing?.updatedAt ?? existing?.createdAt ?? 0
      if (!existing || incomingVersion >= currentVersion) {
        byId.set(op.stroke.id, op.stroke)
        appliedCount += 1
      } else {
        conflictDrops += 1
        causalDrops.push(op)
      }
    }
  })
  return { next: Array.from(byId.values()), appliedCount, conflictDrops, causalDrops }
}

export function isValidStrokePoint(p: unknown): p is { x: number; y: number; pressure?: number } {
  if (!p || typeof p !== 'object') return false
  const item = p as { x?: unknown; y?: unknown }
  return (
    typeof item.x === 'number' &&
    Number.isFinite(item.x) &&
    typeof item.y === 'number' &&
    Number.isFinite(item.y)
  )
}

export function isValidStroke(stroke: WhiteboardStroke | undefined): stroke is WhiteboardStroke {
  if (!stroke || typeof stroke !== 'object') return false
  if (!stroke.id || typeof stroke.id !== 'string') return false
  if (!Array.isArray(stroke.points) || stroke.points.some(p => !isValidStrokePoint(p))) return false
  return true
}

export function sanitizeWhiteboardOps(
  wbKey: string,
  ops: WhiteboardStrokeOp[]
): {
  valid: WhiteboardStrokeOp[]
  malformed: WhiteboardStrokeOp[]
  duplicates: WhiteboardStrokeOp[]
} {
  const valid: WhiteboardStrokeOp[] = []
  const malformed: WhiteboardStrokeOp[] = []
  const duplicates: WhiteboardStrokeOp[] = []
  const seen = whiteboardOpSeenIds.get(wbKey) ?? new Set<string>()
  ops.forEach(op => {
    if (!op || typeof op !== 'object' || (op.kind !== 'upsert' && op.kind !== 'delete')) {
      malformed.push(op)
      return
    }
    if (op.opId) {
      if (seen.has(op.opId)) {
        duplicates.push(op)
        return
      }
      seen.add(op.opId)
      if (seen.size > WHITEBOARD_OP_SEEN_MAX) {
        const items = Array.from(seen)
        seen.clear()
        items.slice(-WHITEBOARD_OP_SEEN_TRIM).forEach(id => seen.add(id))
      }
    }
    if (op.kind === 'upsert') {
      if (!isValidStroke(op.stroke)) {
        malformed.push(op)
        return
      }
    } else if (!op.strokeId || typeof op.strokeId !== 'string') {
      malformed.push(op)
      return
    }
    valid.push(op)
  })
  whiteboardOpSeenIds.set(wbKey, seen)
  return { valid, malformed, duplicates }
}

export function pushWhiteboardDeadLetters(
  wbKey: string,
  reason: 'malformed' | 'duplicate' | 'causal',
  ops: WhiteboardStrokeOp[]
) {
  if (!ops.length) return
  const queue = whiteboardDeadLetters.get(wbKey) ?? []
  ops.forEach(op => queue.push({ at: Date.now(), reason, op }))
  whiteboardDeadLetters.set(wbKey, queue.slice(-WHITEBOARD_DEAD_LETTER_MAX))
}

export function appendWhiteboardOpLog(wbKey: string, ops: WhiteboardStrokeOp[]) {
  if (!ops.length) return
  const queue = whiteboardOpLog.get(wbKey) ?? []
  let seq = whiteboardOpSeq.get(wbKey) ?? 0
  ops.forEach(op => {
    seq += 1
    queue.push({ seq, at: Date.now(), op })
  })
  whiteboardOpSeq.set(wbKey, seq)
  whiteboardOpLog.set(wbKey, queue.slice(-WHITEBOARD_OP_LOG_MAX))
}

export function getLiveClassModerationState(roomId: string): LiveClassModerationState {
  let state = liveClassModeration.get(roomId)
  if (!state) {
    state = {
      mutedStudents: new Set(),
      studentStrokeWindowLimit: 80,
      strokeWindowMs: 5000,
      strokeCounters: new Map(),
      lockedLayers: new Set(),
      assignmentOverlay: 'none',
      spotlight: { enabled: false, x: 160, y: 120, width: 420, height: 220, mode: 'rectangle' },
    }
    liveClassModeration.set(roomId, state)
  }
  return state
}

export function appendLiveClassSnapshot(roomId: string, snapshot: LiveClassSnapshot) {
  const existing = liveClassSnapshots.get(roomId) ?? []
  existing.push(snapshot)
  liveClassSnapshots.set(roomId, existing.slice(-LIVE_CLASS_SNAPSHOTS_MAX))
}

export function getWhiteboardOpObservability(roomId?: string): WhiteboardOpObservabilitySnapshot[] {
  const rows: WhiteboardOpObservabilitySnapshot[] = []
  whiteboardOpMetrics.forEach(metric => {
    if (roomId && metric.roomId !== roomId) return
    trimWhiteboardOpTimestamps(metric)
    const recent10s = metric.recentAppliedTimestamps.filter(ts => ts >= Date.now() - 10_000).length
    rows.push({
      key: metric.key,
      roomId: metric.roomId,
      boardScope: metric.boardScope,
      studentId: metric.studentId,
      lastActivity: metric.lastActivity,
      receivedOps: metric.receivedOps,
      appliedOps: metric.appliedOps,
      conflictDrops: metric.conflictDrops,
      duplicateDrops: metric.duplicateDrops,
      malformedDrops: metric.malformedDrops,
      queueDepth: metric.queueDepth,
      maxQueueDepth: metric.maxQueueDepth,
      replayRequests: metric.replayRequests,
      opsPerSecond: Number((recent10s / 10).toFixed(2)),
      activeStrokeCount: activeWhiteboards.get(metric.key)?.strokes.length ?? 0,
      deadLetterDepth: (whiteboardDeadLetters.get(metric.key) ?? []).length,
    })
  })
  return rows.sort((a, b) => b.lastActivity - a.lastActivity)
}

// ============ Math whiteboard ============
export const mathWhiteboardRooms = new Map<string, MathWhiteboardRoomState>()
export const mathSyncMetrics = new Map<string, MathSyncMetricsState>()

export function getMathSyncMetric(sessionId: string): MathSyncMetricsState {
  const key = `math:${sessionId}`
  let metric = mathSyncMetrics.get(key)
  if (!metric) {
    metric = {
      sessionId,
      roomId: key,
      lastActivity: Date.now(),
      joins: 0,
      leaves: 0,
      syncRequests: 0,
      yjsUpdates: 0,
      yjsBytes: 0,
      snapshotBroadcasts: 0,
      lockToggles: 0,
      recentUpdateTimestamps: [],
    }
    mathSyncMetrics.set(key, metric)
  }
  return metric
}

export function trimRecentUpdates(metric: MathSyncMetricsState) {
  const cutoff = Date.now() - 60_000
  metric.recentUpdateTimestamps = metric.recentUpdateTimestamps.filter(ts => ts >= cutoff)
}

export function getMathWhiteboardRoom(sessionId: string): MathWhiteboardRoomState {
  const key = `math:${sessionId}`
  let room = mathWhiteboardRooms.get(key)
  if (!room) {
    room = {
      roomId: key,
      sessionId,
      locked: false,
      ownerId: undefined,
      lastActivity: Date.now(),
      currentPage: 0,
      participants: new Map(),
      elements: new Map(),
      pages: [{ index: 0, backgroundType: 'grid', elementIds: [] }],
      tldrawSnapshot: null,
      yDoc: new Y.Doc() as MathWhiteboardRoomState['yDoc'],
    }
    mathWhiteboardRooms.set(key, room)
  }
  getMathSyncMetric(sessionId)
  return room as MathWhiteboardRoomState
}

export function getMathSyncObservability(sessionId?: string): MathSyncObservabilitySnapshot[] {
  const snapshots: MathSyncObservabilitySnapshot[] = []
  const rooms = sessionId
    ? [[`math:${sessionId}`, mathWhiteboardRooms.get(`math:${sessionId}`)] as const]
    : Array.from(mathWhiteboardRooms.entries())
  for (const [key, room] of rooms) {
    if (!room) continue
    const metric = mathSyncMetrics.get(key) ?? getMathSyncMetric(room.sessionId)
    trimRecentUpdates(metric)
    snapshots.push({
      sessionId: room.sessionId,
      roomId: room.roomId,
      lastActivity: Math.max(room.lastActivity, metric.lastActivity),
      locked: room.locked,
      participants: room.participants.size,
      joins: metric.joins,
      leaves: metric.leaves,
      syncRequests: metric.syncRequests,
      yjsUpdates: metric.yjsUpdates,
      yjsBytes: metric.yjsBytes,
      snapshotBroadcasts: metric.snapshotBroadcasts,
      lockToggles: metric.lockToggles,
      updatesPerMinute: metric.recentUpdateTimestamps.length,
      averageYjsUpdateBytes:
        metric.yjsUpdates > 0 ? Math.round(metric.yjsBytes / metric.yjsUpdates) : 0,
    })
  }
  return snapshots.sort((a, b) => b.lastActivity - a.lastActivity)
}

// ============ Feedback & Insights ============
export const deployedTasks = new Map<
  string,
  {
    id: string
    taskId: string
    title: string
    content: string
    type: 'task' | 'assessment'
    deployedAt: string
    tutorId: string
    tutorName: string
    students: Set<string>
  }
>()

export const feedbackPolls = new Map<
  string,
  {
    id: string
    taskId: string
    question: string
    options: number[]
    responses: Map<string, number>
    isActive: boolean
    sentAt: string
    tutorId: string
  }
>()

export const feedbackQuestions = new Map<
  string,
  {
    id: string
    taskId: string
    question: string
    answers: Map<string, { answer: string; answeredAt: string }>
    sentAt: string
    tutorId: string
  }
>()

// ============ Polls ============
export const activePolls = new Map<string, PollState>()
export const sessionPolls = new Map<string, Set<string>>()

export function getPollState(pollId: string): PollState | undefined {
  return activePolls.get(pollId)
}

export function getSessionPolls(sessionId: string): PollState[] {
  const pollIds = sessionPolls.get(sessionId)
  if (!pollIds) return []
  return Array.from(pollIds)
    .map(id => activePolls.get(id))
    .filter((p): p is PollState => p !== undefined)
}

// PDF events cap helper (used by pdf handlers)
export function trimPdfEvents(room: PdfCollabRoomState) {
  if (room.events.length > PDF_EVENTS_MAX) {
    room.events = room.events.slice(-PDF_EVENTS_MAX)
  }
}

// ============ Public API getters ============
export function getRoomState(roomId: string): ClassRoom | undefined {
  return activeRooms.get(roomId)
}

export function getDMRoomState(conversationId: string): DirectMessageRoom | undefined {
  return directMessageRooms.get(conversationId)
}

export function getUserSocketId(userId: string): string | undefined {
  return userSocketMap.get(userId)
}

export function isUserOnline(userId: string): boolean {
  return userSocketMap.has(userId)
}

export function broadcastToUser(
  io: import('socket.io').Server,
  userId: string,
  event: string,
  data: unknown
) {
  const socketId = userSocketMap.get(userId)
  if (socketId) io.to(socketId).emit(event, data)
}

export function getWhiteboardState(whiteboardId: string): WhiteboardState | undefined {
  return activeWhiteboards.get(whiteboardId)
}

export function clearWhiteboard(whiteboardId: string): boolean {
  const wb = activeWhiteboards.get(whiteboardId)
  if (wb) {
    wb.strokes = []
    wb.shapes = []
    wb.texts = []
    return true
  }
  return false
}

export function exportWhiteboard(whiteboardId: string): {
  whiteboardId: string
  roomId: string
  strokes: WhiteboardStroke[]
  shapes: import('./socket-types').WhiteboardShape[]
  texts: import('./socket-types').WhiteboardText[]
  backgroundColor: string
  backgroundStyle: string
  exportedAt: string
} | null {
  const wb = activeWhiteboards.get(whiteboardId)
  if (!wb) return null
  return {
    whiteboardId: wb.whiteboardId,
    roomId: wb.roomId,
    strokes: wb.strokes,
    shapes: wb.shapes,
    texts: wb.texts,
    backgroundColor: wb.backgroundColor,
    backgroundStyle: wb.backgroundStyle,
    exportedAt: new Date().toISOString(),
  }
}

const STALE_STATE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function cleanupStaleSocketState() {
  const now = Date.now()

  // 1. whiteboardOpMetrics - clear entries older than 24h
  for (const [key, metric] of whiteboardOpMetrics.entries()) {
    if (now - metric.lastActivity > STALE_STATE_TTL_MS) {
      whiteboardOpMetrics.delete(key)
    }
  }

  // 2. lcwbAiRegionRateLimit - clear expired entries
  for (const [key, state] of lcwbAiRegionRateLimit.entries()) {
    if (now >= state.resetAt) {
      lcwbAiRegionRateLimit.delete(key)
    }
  }

  // 3. whiteboardOpSeenIds - clear per-room entries when whiteboard is cleaned up
  for (const key of whiteboardOpSeenIds.keys()) {
    if (!activeWhiteboards.has(key)) {
      whiteboardOpSeenIds.delete(key)
    }
  }

  // 4. whiteboardOpSeq - clear per-room entries when whiteboard is cleaned up
  for (const key of whiteboardOpSeq.keys()) {
    if (!activeWhiteboards.has(key)) {
      whiteboardOpSeq.delete(key)
    }
  }

  // 5. whiteboardBranches - clear when parent whiteboard deleted
  for (const key of whiteboardBranches.keys()) {
    if (!activeWhiteboards.has(key)) {
      whiteboardBranches.delete(key)
    }
  }

  // 6. liveClassModeration - clear when room cleaned up
  for (const roomId of liveClassModeration.keys()) {
    if (!activeRooms.has(roomId)) {
      liveClassModeration.delete(roomId)
    }
  }

  // 7. mathWhiteboardRooms - remove stale rooms
  for (const [key, room] of mathWhiteboardRooms.entries()) {
    if (
      now - room.lastActivity > STALE_STATE_TTL_MS ||
      (room.participants.size === 0 && now - room.lastActivity > MATH_WB_EMPTY_ROOM_CLEANUP_MS)
    ) {
      mathWhiteboardRooms.delete(key)
    }
  }

  // 8. mathSyncMetrics - clear entries older than 24h
  for (const [key, metric] of mathSyncMetrics.entries()) {
    if (now - metric.lastActivity > STALE_STATE_TTL_MS) {
      mathSyncMetrics.delete(key)
    }
  }

  // activePolls - delete closed polls older than 24h
  for (const [pollId, poll] of activePolls.entries()) {
    if (poll.status === 'closed' && poll.endedAt && now - poll.endedAt > STALE_STATE_TTL_MS) {
      activePolls.delete(pollId)
    }
  }

  // 11. sessionPolls - delete when session has no active polls
  for (const [sessionId, pollIds] of sessionPolls.entries()) {
    for (const pollId of Array.from(pollIds)) {
      if (!activePolls.has(pollId)) {
        pollIds.delete(pollId)
      }
    }
    if (pollIds.size === 0) {
      sessionPolls.delete(sessionId)
    }
  }

  // 12. deployedTasks - delete after 24h TTL
  for (const [id, task] of deployedTasks.entries()) {
    const deployedAt = new Date(task.deployedAt).getTime()
    if (now - deployedAt > STALE_STATE_TTL_MS) {
      deployedTasks.delete(id)
    }
  }

  // 13. feedbackPolls - delete inactive or old polls
  for (const [id, poll] of feedbackPolls.entries()) {
    if (!poll.isActive || now - new Date(poll.sentAt).getTime() > STALE_STATE_TTL_MS) {
      feedbackPolls.delete(id)
    }
  }

  // 14. feedbackQuestions - delete when older than 24h
  for (const [id, question] of feedbackQuestions.entries()) {
    if (now - new Date(question.sentAt).getTime() > STALE_STATE_TTL_MS) {
      feedbackQuestions.delete(id)
    }
  }
}
