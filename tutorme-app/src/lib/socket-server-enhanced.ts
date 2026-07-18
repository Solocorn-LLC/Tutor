/**
 * Enhanced Socket.io Server with Authentication and Memory Management
 * Critical fixes for production deployment
 */

import { Server as NetServer } from 'http'
import { Server as SocketIOServer, Socket } from 'socket.io'
import Redis from 'ioredis'
import * as Sentry from '@sentry/nextjs'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { expandToCourseFamily } from '@/lib/courses/variant-family'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  liveSession,
  deployedMaterial,
  poll,
  pollOption,
  pollResponse,
  courseEnrollment,
  sessionParticipant,
  courseLesson,
  message,
  builderTask,
  builderTaskDmi,
  taskSubmission,
  course,
} from '@/lib/db/schema'
import { autoGradeDmi } from '@/lib/grading/auto-grade'
import { normalizePciSpec } from '@/lib/assessment/pci-spec'
import { initFeedbackHandlers, initPollHandlers } from './socket-server'
import { activePolls, sessionPolls, cleanupStaleSocketState } from '@/lib/socket'
import type { PollState } from '@/lib/socket'
import { socketAuthMiddleware } from './socket/socket-auth'
import { notifyMany } from '@/lib/notifications/notify'
import { refreshDocumentUrls } from '@/lib/storage/gcs'
import { ensureViewableSourceDocument } from '@/lib/documents/ensure-viewable'
import type {
  StrokeDelta,
  ShapeDelta,
  TextDelta,
  CursorDelta,
  FormulaDelta,
  GraphDelta,
} from './socket/whiteboard-delta'

// Types from original socket-server.ts
export type StudentStatus = 'on_track' | 'needs_help' | 'struggling' | 'idle'

export interface StudentState {
  userId: string
  name: string
  status: StudentStatus
  engagement: number
  understanding: number
  frustration: number
  lastActivity: number
  currentActivity?: string
  joinedAt: number
}

export interface ClassRoom {
  id: string
  tutorId: string
  students: Map<string, StudentState>
  whiteboardData?: Record<string, unknown>
  chatHistory: ChatMessage[]
  tasks: LiveTask[]
  polls?: any[]
  codeEditorContent?: string
  codeLanguage?: string
  createdAt: Date
  lastActivity: number
}

export interface ChatMessage {
  id: string
  userId: string
  name: string
  text: string
  timestamp: number
  isAI?: boolean
}

export interface LiveTaskPollResponse {
  studentId: string
  value: number
  submittedAt: number
}

export interface LiveTaskQuestionResponse {
  studentId: string
  answer: string
  submittedAt: number
}

export interface LiveTaskPoll {
  id: string
  taskId: string
  question: string
  /** Option indices [0..n-1]; a vote's `value` is the chosen index. */
  options: number[]
  /** Display labels per option index (['True','False'], ['Yes','No'], custom).
   *  Absent ⇒ render A/B/C/… by index. */
  optionLabels?: string[]
  status: 'open' | 'closed'
  responses: LiveTaskPollResponse[]
  createdAt: number
}

export interface LiveTaskQuestion {
  id: string
  taskId: string
  prompt: string
  /** Mirrors LiveTaskPoll: a closed question accepts no more answers. Optional
   *  for back-compat with snapshots created before questions had a status. */
  status?: 'open' | 'closed'
  responses: LiveTaskQuestionResponse[]
  createdAt: number
}

export interface LiveTaskDmiItem {
  id: string
  questionNumber: number
  /** The paper's real question reference (e.g. "1(a)"), shown to the student
   *  instead of the re-serialized questionNumber when present. */
  questionLabel?: string
  questionText: string
  /** Points this question is worth (shown to students; the answer key is not). */
  marks?: number
  /** Which answer-input control the student sees (defaults to long answer). */
  questionType?: import('./assessment/question-types').DmiQuestionType
  /** Options for choice types (mcq / true_false / multiple_response). */
  options?: string[]
  /** Image the student clicks for a `hotspot` item. */
  hotspotImageUrl?: string
  /** Prompts (left items / drag items) for matching & drag_drop, in order. */
  matchPrompts?: string[]
  /** Sorted option bank for matching & drag_drop — never the correct pairing. */
  matchBank?: string[]
  /** Paper section heading (delivery-layer — shown to the student). */
  section?: string
}

export interface LiveTaskSourceDocument {
  fileName: string
  fileUrl: string
  fileKey?: string
  mimeType: string
}

export interface LiveTask {
  id: string
  title: string
  content: string
  description?: string
  instructions?: string
  source: 'task' | 'assessment' | 'homework'
  dmiItems?: LiveTaskDmiItem[]
  /** Per-question answer key + marks. Sent tutor→server on deploy ONLY and
   *  persisted server-side for auto-grading; NEVER copied into the student
   *  broadcast (normalizedTask) or stored in deployedMaterial. */
  answerKey?: Array<{
    id: string
    answer?: string
    acceptableVariants?: string[]
    marks?: number
  }>
  /** Tutor's task PCI (free-text marking/instruction content) + finalized
   *  structured spec (TASK-6). Sent tutor→server on deploy ONLY and persisted
   *  server-side so the live tutor and grader can apply them; NEVER copied into
   *  the student broadcast (normalizedTask) — this is the hidden evaluation
   *  layer, same handling as answerKey. */
  pci?: string
  pciSpec?: import('@/lib/assessment/pci-spec').PciSpec
  /** The lesson this task/assessment was deployed from — tags BuilderTask +
   *  DeployedMaterial with the real lesson so submissions group correctly. */
  lessonId?: string
  /** Tutor's answer-reveal policy: 'instant' | 'after_submit' | 'hidden' | 'student_choice'. */
  answerReveal?: 'instant' | 'after_submit' | 'hidden' | 'student_choice'
  deployedAt: number
  polls: LiveTaskPoll[]
  questions: LiveTaskQuestion[]
  sourceDocument?: LiveTaskSourceDocument
  parentId?: string
  isExtension?: boolean
  completedBy?: string[]
  /** studentId -> { dmiItemId -> answer } captured when a student submits. */
  responses?: Record<string, Record<string, string>>
}

/**
 * A room-broadcast-safe view of a task: strips the per-student answer map so
 * peers in a GROUP session never receive each other's submitted answers over the
 * wire. `responses` is the only sensitive field on the room task object — deploy
 * already omits answerKey/pci/pciSpec from it — and the tutor gets answers via
 * the targeted `task:completed` (live) + their own `room_state` (rejoin), so no
 * room-wide consumer needs `responses`.
 */
function toPublicTask(task: LiveTask): LiveTask {
  if (!task.responses) return task
  const { responses: _omit, ...rest } = task
  return rest
}

// Environment validation
function validateEnv() {
  const required = ['NEXTAUTH_SECRET']
  const missing = required.filter(key => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

// Redis configuration
let redisClient: Redis | null = null
let redisPubClient: Redis | null = null
let redisSubClient: Redis | null = null
let ioRef: SocketIOServer | null = null

// Memory management constants
const ROOM_CLEANUP_INTERVAL = 30 * 60 * 1000 // 30 minutes
const DM_CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes
const WHITEBOARD_CLEANUP_INTERVAL = 10 * 60 * 1000 // 10 minutes
const ROOM_MAX_AGE = 4 * 60 * 60 * 1000 // 4 hours
const DM_MAX_AGE = 1 * 60 * 60 * 1000 // 1 hour
const WHITEBOARD_MAX_AGE = 2 * 60 * 60 * 1000 // 2 hours

// Rate limiting
const RATE_LIMITS = {
  // Whiteboard deltas can be bursty; keep this generous to avoid
  // introducing latency/jank when drawing or mirroring.
  maxEventsPerSecond: 60,
  burstSize: 120,
  windowSize: 1000, // 1 second
}

// Whiteboard memory caps (per room)
const WHITEBOARD_MAX_ITEMS_PER_TYPE = 5000

function trimToCap<T>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items
  return items.slice(items.length - cap)
}

// Enhanced interfaces with activity tracking
interface DirectMessageRoom {
  conversationId: string
  participant1Id: string
  participant2Id: string
  typingUsers: Set<string>
  lastActivity: number
  createdAt: number
}

interface WhiteboardState {
  whiteboardId: string
  roomId: string
  strokes: WhiteboardStroke[]
  shapes: WhiteboardShape[]
  texts: WhiteboardText[]
  cursors: Map<string, { x: number; y: number; color: string; name: string }>
  activeUsers: Set<string>
  backgroundColor: string
  backgroundStyle: string
  lastActivity: number
  createdAt: number
}

interface WhiteboardStroke {
  id: string
  points: { x: number; y: number }[]
  color: string
  width: number
  type: 'pen' | 'eraser'
  userId: string
  createdAt: number
}

interface WhiteboardShape {
  id: string
  type: 'rectangle' | 'circle' | 'line' | 'triangle'
  x: number
  y: number
  width: number
  height: number
  color: string
  lineWidth: number
  userId: string
  createdAt: number
}

interface WhiteboardText {
  id: string
  text: string
  x: number
  y: number
  color: string
  fontSize: number
  userId: string
  createdAt: number
}

// Rate limiting per connection
interface RateLimitState {
  tokens: number
  lastRefill: number
}

const connectionRateLimits = new Map<string, RateLimitState>()

// Enhanced memory stores with activity tracking
const activeRooms = new Map<string, ClassRoom>()
const directMessageRooms = new Map<string, DirectMessageRoom>()
const activeWhiteboards = new Map<string, WhiteboardState>()
const userSocketMap = new Map<string, string>()

function setUserSocket(userId: string | undefined, socketId: string) {
  if (!userId) return
  userSocketMap.set(userId, socketId)
}

function clearUserSocketIfCurrent(userId: string | undefined, socketId: string) {
  if (!userId) return
  const mappedSocketId = userSocketMap.get(userId)
  if (mappedSocketId === socketId) {
    userSocketMap.delete(userId)
  }
}

// Rate limiting function
function isRateLimited(connectionId: string): boolean {
  const now = Date.now()
  const state = connectionRateLimits.get(connectionId) || {
    tokens: RATE_LIMITS.maxEventsPerSecond,
    lastRefill: now,
  }

  // Refill tokens based on time elapsed
  const timePassed = now - state.lastRefill
  const tokensToAdd = Math.floor(
    timePassed / (RATE_LIMITS.windowSize / RATE_LIMITS.maxEventsPerSecond)
  )
  state.tokens = Math.min(RATE_LIMITS.maxEventsPerSecond, state.tokens + tokensToAdd)
  state.lastRefill = now

  if (state.tokens > 0) {
    state.tokens--
    connectionRateLimits.set(connectionId, state)
    return false // Not rate limited
  } else {
    connectionRateLimits.set(connectionId, state)
    return true // Rate limited
  }
}

// Memory management functions
function cleanupInactiveClassRooms() {
  const now = Date.now()
  let cleanedCount = 0

  activeRooms.forEach((room, roomId) => {
    const age = now - room.createdAt.getTime()
    const inactiveTime = now - room.lastActivity

    // Remove rooms older than 4 hours or inactive for 15+ minutes
    if (age > ROOM_MAX_AGE || (inactiveTime > ROOM_CLEANUP_INTERVAL && room.students.size === 0)) {
      // Persist room state to Redis if enabled
      if (redisClient) {
        persistRoomToRedis(roomId, room)
      }

      activeRooms.delete(roomId)
      cleanedCount++
      console.log(
        `Cleanup: Removed inactive room ${roomId} (age: ${Math.floor(age / 1000 / 60)}min, lastActivity: ${Math.floor(inactiveTime / 1000 / 60)}min)`
      )
    }
  })

  if (cleanedCount > 0) {
    console.log(`Cleanup: Removed ${cleanedCount} inactive rooms`)
  }
}

function cleanupInactiveDMRooms() {
  const now = Date.now()
  let cleanedCount = 0

  directMessageRooms.forEach((room, roomId) => {
    // Remove inactive rooms
    if (now - room.lastActivity > DM_MAX_AGE) {
      // Persist to Redis if needed (implement later)
      directMessageRooms.delete(roomId)
      cleanedCount++
      console.log(
        `Cleanup: Removed inactive DM room ${roomId} (lastActivity: ${Math.floor((now - room.lastActivity) / 1000 / 60)}min)`
      )
    }
  })

  if (cleanedCount > 0) {
    console.log(`Cleanup: Removed ${cleanedCount} inactive DM rooms`)
  }
}

function cleanupInactiveWhiteboards() {
  const now = Date.now()
  let cleanedCount = 0

  activeWhiteboards.forEach((wb, wbId) => {
    const age = now - wb.createdAt
    const inactiveTime = now - wb.lastActivity

    // Remove whiteboards older than 2 hours or with no active users for 10+ minutes
    if (
      age > WHITEBOARD_MAX_AGE ||
      (inactiveTime > WHITEBOARD_CLEANUP_INTERVAL && wb.activeUsers.size === 0)
    ) {
      // Persist to Redis if needed (implement later)
      activeWhiteboards.delete(wbId)
      cleanedCount++
      console.log(
        `Cleanup: Removed inactive whiteboard ${wbId} (age: ${Math.floor(age / 1000 / 60)}min, lastActivity: ${Math.floor(inactiveTime / 1000 / 60)}min)`
      )
    }
  })

  if (cleanedCount > 0) {
    console.log(`Cleanup: Removed ${cleanedCount} inactive whiteboards`)
  }
}

// Redis persistence helpers (stub implementation - expand later)
async function persistRoomToRedis(roomId: string, room: ClassRoom) {
  if (!redisClient) return

  try {
    const wb = (room.whiteboardData || {}) as Record<string, unknown>
    // Store only compact snapshots in Redis (avoid huge delta arrays).
    const compactWhiteboardData = {
      ...(wb.tutorBoard ? { tutorBoard: wb.tutorBoard } : {}),
      ...(wb.studentBoards ? { studentBoards: wb.studentBoards } : {}),
    }
    await redisClient.setex(
      `room:${roomId}`,
      86400,
      JSON.stringify({
        id: room.id,
        tutorId: room.tutorId,
        students: Array.from(room.students.entries()),
        chatHistory: room.chatHistory,
        tasks: room.tasks,
        ...(Object.keys(compactWhiteboardData).length > 0
          ? { whiteboardData: compactWhiteboardData }
          : {}),
        createdAt: room.createdAt,
        lastActivity: room.lastActivity,
      })
    )
  } catch (error) {
    console.error('Failed to persist room to Redis:', error)
  }
}

async function getRoomFromRedis(roomId: string): Promise<ClassRoom | null> {
  if (!redisClient) return null

  try {
    const data = await redisClient.get(`room:${roomId}`)
    if (!data) return null

    const parsed = JSON.parse(data)
    return {
      ...parsed,
      students: new Map(parsed.students),
      // Intentionally do NOT restore tasks from Redis — each session should be independent.
      // Tasks will be repopulated from DB via the directory API if needed.
      tasks: [],
    }
  } catch (error) {
    console.error('Failed to retrieve room from Redis:', error)
    return null
  }
}

// A live session can legitimately have no courseId — it is nullable, and is
// even nulled out (onDelete: 'set null') when the course is deleted. But
// BuilderTask.courseId and DeployedMaterial.courseId are NOT NULL, so without a
// course we previously couldn't persist a submission at all, and ad-hoc-session
// completions vanished. Anchor those rows to a single hidden system course so
// the submission persists and reaches the tutor. The real ownership/scoping is
// preserved elsewhere: BuilderTask.tutorId (Grading page) and
// DeployedMaterial.sessionId (live Understanding) — so anchored rows never leak
// across tutors or sessions. The anchor is creatorId=null + isPublished=false,
// so it shows up in no tutor "My courses" list and no student/published list.
const ADHOC_ANCHOR_COURSE_ID = '__system_adhoc_course__'
let adhocAnchorEnsured = false
async function ensureAdhocAnchorCourseId(): Promise<string> {
  if (adhocAnchorEnsured) return ADHOC_ANCHOR_COURSE_ID
  const now = new Date()
  // Explicit createdAt/updatedAt: those columns are notNull().defaultNow() in
  // the schema, but the prod DB has drifted and lacks the column DEFAULT, so
  // relying on the default inserts NULL and violates the constraint.
  await drizzleDb
    .insert(course)
    .values({
      courseId: ADHOC_ANCHOR_COURSE_ID,
      name: 'Ad-hoc Sessions (system)',
      isPublished: false,
      creatorId: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: course.courseId })
  adhocAnchorEnsured = true
  return ADHOC_ANCHOR_COURSE_ID
}

// Per-event rate limiting middleware
function rateLimitMiddleware(socket: Socket, next: (err?: Error) => void) {
  const connectionId = socket.data.userId || socket.id

  try {
    if (isRateLimited(connectionId)) {
      return next(new Error('Rate limit exceeded'))
    }
    next()
  } catch (error) {
    console.error('Rate limiting error:', error)
    next(new Error('Rate limiting failed'))
  }
}

// Initialize Redis clients
/**
 * Initialize Redis clients with a timeout to prevent hanging the entire server startup.
 */
async function initRedis() {
  try {
    if (!process.env.REDIS_URL) {
      console.warn('⚠️ [Redis] REDIS_URL not set - proceeding with in-memory mode')
      return
    }

    const url = process.env.REDIS_URL
    const redisOptions: any = {
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
      maxRetriesPerRequest: 3,
      lazyConnect: true, // Don't connect immediately
      connectTimeout: 5000, // 5 seconds timeout for connection attempts
    }

    console.log('[Redis] Initializing clients...')
    redisClient = new Redis(url, redisOptions)
    redisPubClient = new Redis(url, redisOptions)
    redisSubClient = new Redis(url, redisOptions)

    // Handle errors globally to prevent process crash
    const errorHandler = (name: string) => (err: Error) => {
      console.error(`❌ [Redis] ${name} error:`, err.message)
      if (process.env.NODE_ENV === 'production') {
        Sentry.captureException(err, {
          tags: { service: 'redis', client: name },
          level: 'fatal',
          extra: {
            message: 'Redis connection failed in production, multi-node socket sync will be broken',
          },
        })
      }
    }
    redisClient.on('error', errorHandler('Client'))
    redisPubClient.on('error', errorHandler('Pub'))
    redisSubClient.on('error', errorHandler('Sub'))

    // Attempt to connect in the background, don't wait for it to block startup
    console.log('[Redis] Connecting in background...')
    Promise.all([
      redisClient.connect().catch(err => console.error('[Redis] Client connection failed:', err)),
      redisPubClient
        .connect()
        .catch(err => console.error('[Redis] Pub client connection failed:', err)),
      redisSubClient
        .connect()
        .catch(err => console.error('[Redis] Sub client connection failed:', err)),
    ]).then(() => {
      if (redisClient?.status === 'ready') {
        console.log('✅ [Redis] Connection successful')
      }
    })
  } catch (error) {
    console.error('❌ [Redis] Failed to initialize Redis config:', error)
    redisClient = null
    redisPubClient = null
    redisSubClient = null
  }
}

// Enhanced socket server initialization
export async function initEnhancedSocketServer(server: NetServer) {
  console.log('[Socket] Initializing enhanced server...')
  validateEnv()
  // Await Redis initialization so adapter attaches before server creation
  await initRedis()
  const intervalHandles: Array<ReturnType<typeof setInterval>> = []

  const io = new SocketIOServer(server, {
    path: '/api/socket',
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN?.split(',') || [
        'http://localhost:3003',
        'http://localhost:3000',
      ],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Keep connections alive through proxies and cloud load balancers.
    // The old 10s/15s was too aggressive for Cloud Run: when an instance is idle
    // its CPU is throttled, so the engine.io ping timers stall and a pong can
    // arrive "late" even though the client is perfectly online — the server then
    // wrongly declares the socket dead and nothing transmits afterward. A longer
    // pingTimeout tolerates those throttle stalls (and brief network blips)
    // without dropping an otherwise-healthy live session.
    pingInterval: 25000,
    pingTimeout: 60000,
    // Recover a briefly-dropped session transparently: on reconnect within the
    // window the socket keeps its rooms and receives the events it missed during
    // the gap, instead of coming back as a fresh, empty connection.
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
    transports: ['websocket', 'polling'],
    // Default is 1MB. Student answers can now carry drawing/handwriting images
    // (base64 PNGs), so a task:complete payload can exceed 1MB — beyond which
    // Socket.io silently drops the message and the submission never reaches the
    // tutor. Raise the limit so submissions with drawings get through.
    maxHttpBufferSize: 25 * 1024 * 1024,
  })

  ioRef = io

  // Apply middleware
  io.use(socketAuthMiddleware)

  // Apply Redis adapter if available
  if (redisClient && redisPubClient && redisSubClient) {
    try {
      const { createAdapter } = await import('@socket.io/redis-adapter')
      io.adapter(createAdapter(redisPubClient as any, redisSubClient as any))
      console.log('Redis adapter configured for Socket.io')
    } catch (error) {
      console.error('Failed to configure Redis adapter - using in-memory:', error)
    }
  }

  // Cross-instance dedup for one-shot session alerts (end warning + start
  // reminders): with >1 app instance each runs these sweeps, so guard each key
  // with a Redis NX claim — only one instance sends. Falls back to a per-process
  // Set when Redis is unavailable.
  const alertClaimFallback = new Set<string>()
  const claimAlertOnce = async (key: string): Promise<boolean> => {
    if (redisClient && redisClient.status === 'ready') {
      try {
        const res = await redisClient.set(`notif:alert:${key}`, '1', 'EX', 3600, 'NX')
        return res === 'OK'
      } catch {
        // fall through to local dedup
      }
    }
    if (alertClaimFallback.has(key)) return false
    alertClaimFallback.add(key)
    return true
  }

  // Session end alert: warn tutors when 5 minutes remain
  intervalHandles.push(
    setInterval(async () => {
      const now = Date.now()
      try {
        const activeSessions = await drizzleDb
          .select({
            sessionId: liveSession.sessionId,
            scheduledAt: liveSession.scheduledAt,
            startedAt: liveSession.startedAt,
            durationMinutes: liveSession.durationMinutes,
          })
          .from(liveSession)
          .where(inArray(liveSession.status, ['active', 'live', 'preparing', 'paused']))

        for (const s of activeSessions) {
          const startTime = s.startedAt
            ? new Date(s.startedAt).getTime()
            : s.scheduledAt
              ? new Date(s.scheduledAt).getTime()
              : null
          if (!startTime) continue

          const durationMs = (s.durationMinutes || 120) * 60 * 1000
          const endTime = startTime + durationMs
          const remaining = endTime - now

          // Alert when between 5 min and 4 min 30 sec remaining (deduped across
          // instances so only one sends the warning).
          if (remaining <= 5 * 60 * 1000 && remaining > 4.5 * 60 * 1000) {
            if (await claimAlertOnce(`ending:${s.sessionId}`)) {
              io.to(s.sessionId).emit('session:ending-soon', {
                sessionId: s.sessionId,
                minutesRemaining: 5,
              })
            }
          }

          // Auto-end sessions that have exceeded their duration by > 10 minutes
          if (remaining < -10 * 60 * 1000) {
            await drizzleDb
              .update(liveSession)
              .set({ status: 'ended', endedAt: new Date() })
              .where(eq(liveSession.sessionId, s.sessionId))
            io.to(s.sessionId).emit('session:ended', { sessionId: s.sessionId, reason: 'timeout' })
          }
        }
      } catch (err) {
        console.error('[Session Alert] Error:', err)
      }
    }, 30 * 1000) // Check every 30 seconds
  )

  // Session START reminders: notify the tutor + enrolled students at 20/10/5/1
  // minutes before scheduledAt (in-app + web-push via notify()). Fires once per
  // (session, threshold), deduped across instances via claimAlertOnce. Auto-start
  // is NOT done here — a class only goes live when the tutor takes it live.
  const START_THRESHOLDS = [20, 10, 5, 1] // minutes
  intervalHandles.push(
    setInterval(async () => {
      const now = Date.now()
      try {
        const upcoming = await drizzleDb
          .select({
            sessionId: liveSession.sessionId,
            title: liveSession.title,
            scheduledAt: liveSession.scheduledAt,
            courseId: liveSession.courseId,
            tutorId: liveSession.tutorId,
          })
          .from(liveSession)
          .where(eq(liveSession.status, 'scheduled'))

        for (const s of upcoming) {
          if (!s.scheduledAt) continue
          const remaining = new Date(s.scheduledAt).getTime() - now
          if (remaining <= 0) continue

          for (const t of START_THRESHOLDS) {
            const key = `${s.sessionId}:${t}`
            // 30s window aligned to the interval; one send per (session, threshold)
            // across all instances via the Redis-backed claim.
            if (remaining <= t * 60_000 && remaining > t * 60_000 - 30_000) {
              if (!(await claimAlertOnce(`start:${key}`))) continue

              const minLabel = t === 1 ? '1 minute' : `${t} minutes`

              // Tutor reminder → tutor lobby.
              void notifyMany({
                userIds: [s.tutorId],
                type: 'reminder',
                title: 'Your class starts soon',
                message: `"${s.title}" starts in ${minLabel}.`,
                actionUrl: s.courseId ? `/tutor/classroom/${s.courseId}` : undefined,
              }).catch(() => {})

              // Enrolled students reminder → student lobby.
              if (s.courseId) {
                try {
                  const rows = await drizzleDb
                    .select({ studentId: courseEnrollment.studentId })
                    .from(courseEnrollment)
                    .where(
                      inArray(courseEnrollment.courseId, await expandToCourseFamily([s.courseId]))
                    )
                  const studentIds = rows.map(r => r.studentId).filter(Boolean)
                  if (studentIds.length > 0) {
                    void notifyMany({
                      userIds: studentIds,
                      type: 'reminder',
                      title: 'Class starting soon',
                      message: `"${s.title}" starts in ${minLabel}.`,
                      actionUrl: `/student/classroom/${s.courseId}`,
                    }).catch(() => {})
                  }
                } catch (e) {
                  console.error('[Session Start Alert] enrollment lookup failed:', e)
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('[Session Start Alert] Error:', err)
      }
    }, 30 * 1000)
  )

  // Start cleanup intervals
  intervalHandles.push(setInterval(cleanupInactiveClassRooms, ROOM_CLEANUP_INTERVAL))
  intervalHandles.push(setInterval(cleanupInactiveDMRooms, DM_CLEANUP_INTERVAL))
  intervalHandles.push(setInterval(cleanupInactiveWhiteboards, WHITEBOARD_CLEANUP_INTERVAL))
  intervalHandles.push(setInterval(cleanupStaleSocketState, 5 * 60 * 1000))
  intervalHandles.push(
    setInterval(
      () => {
        // Clean up old rate limit states
        const now = Date.now()
        connectionRateLimits.forEach((state, connectionId) => {
          if (now - state.lastRefill > 5 * 60 * 1000) {
            // 5 minutes
            connectionRateLimits.delete(connectionId)
          }
        })
      },
      5 * 60 * 1000
    )
  )

  io.on('connection', socket => {
    console.log(`Authenticated client connected: ${socket.id}`)
    setUserSocket(socket.data.userId, socket.id)
    // Join a per-user room so `emitToUser` can fan a message out to ALL of a
    // user's open tabs (userSocketMap only tracks the latest socket).
    if (socket.data.userId) socket.join(`user:${socket.data.userId}`)

    // Apply token-bucket limiting to every incoming event packet.
    socket.use((_packet, next) => rateLimitMiddleware(socket, next))

    // Feedback & Insights handlers — shared with socket-server.ts
    initFeedbackHandlers(io, socket)
    initPollHandlers(io, socket)

    // Enhanced room management with authentication
    socket.on('chat_message', ({ text, roomId }: { text: string; roomId?: string }) => {
      if (!text || typeof text !== 'string') return
      const targetRoomId = roomId || socket.data.roomId
      if (!targetRoomId) return

      const room = activeRooms.get(targetRoomId)
      if (!room) return

      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        userId: socket.data.userId || 'anonymous',
        name: socket.data.name || 'Anonymous',
        text: text.slice(0, 1000),
        timestamp: Date.now(),
      }
      room.chatHistory = room.chatHistory || []
      room.chatHistory.push(msg)
      io.to(targetRoomId).emit('chat_message', msg)

      if (socket.data.userId) {
        drizzleDb
          .insert(message)
          .values({
            messageId: msg.id,
            sessionId: targetRoomId,
            userId: socket.data.userId,
            content: msg.text,
            type: 'text',
            source: socket.data.role === 'tutor' ? 'TUTOR' : 'STUDENT',
            timestamp: new Date(msg.timestamp),
          })
          .catch(err => {
            console.error('[chat_message] Failed to persist chat message:', err)
          })
      }
    })

    // Enhanced room management with authentication
    socket.on('join_class', async (data: { roomId: string; name?: string }) => {
      const { roomId, name } = data
      const userId = socket.data.userId
      const role = socket.data.role

      if (!userId) {
        socket.emit('error', { message: 'Authentication required' })
        return
      }
      setUserSocket(userId, socket.id)
      socket.join(`user:${userId}`)

      if (name !== undefined) socket.data.name = name
      socket.join(roomId)
      socket.data.roomId = roomId

      // Private whiteboard sub-rooms are `<sessionId>:board:<ownerId>`. They have
      // no LiveSession row, so the tutor/enrollment gates below are no-ops and
      // would let ANY authenticated user in. Authorize explicitly: only the
      // board's owner, or the base session's scheduled tutor, may join — otherwise
      // a peer could read/draw on someone's "private" board.
      const boardIdx = roomId.indexOf(':board:')
      if (boardIdx >= 0) {
        const baseSessionId = roomId.slice(0, boardIdx)
        const ownerId = roomId.slice(boardIdx + ':board:'.length)
        let allowed = userId === ownerId
        if (!allowed && baseSessionId) {
          try {
            const [ls] = await drizzleDb
              .select({ tutorId: liveSession.tutorId })
              .from(liveSession)
              .where(eq(liveSession.sessionId, baseSessionId))
              .limit(1)
            allowed = !!ls && ls.tutorId === userId
          } catch {
            allowed = false
          }
        }
        if (!allowed) {
          socket.leave(roomId)
          socket.data.roomId = undefined
          socket.emit('error', { message: 'Not authorized for this board' })
          return
        }
      }

      // Get or create room from Redis first, then memory
      let room = activeRooms.get(roomId)
      if (!room && redisClient) {
        const redisRoom = await getRoomFromRedis(roomId)
        if (redisRoom) {
          room = redisRoom
          activeRooms.set(roomId, room)
        }
      }

      // Determine effective role — verify tutor privileges against DB before granting them
      let effectiveRole = role
      if (effectiveRole !== 'student') {
        const scheduledTutorId = await (async (): Promise<string | null> => {
          try {
            const [session] = await drizzleDb
              .select({ tutorId: liveSession.tutorId })
              .from(liveSession)
              .where(eq(liveSession.sessionId, roomId))
              .limit(1)
            return session?.tutorId ?? null
          } catch {
            return null
          }
        })()
        if (userId !== scheduledTutorId) {
          effectiveRole = 'student'
        }
      }

      if (effectiveRole === 'student') {
        const liveSessionRow = await drizzleDb.query.liveSession.findFirst({
          where: eq(liveSession.sessionId, roomId),
        })
        if (liveSessionRow?.courseId) {
          // Match the whole variant family: the session's courseId may be the
          // template while the student enrolled under the published variant —
          // a raw match would wrongly reject a legitimately enrolled student.
          const enrolledFamily = await expandToCourseFamily([liveSessionRow.courseId])
          const enrolled = await drizzleDb.query.courseEnrollment.findFirst({
            where: and(
              eq(courseEnrollment.studentId, userId),
              inArray(courseEnrollment.courseId, enrolledFamily)
            ),
          })
          if (!enrolled) {
            socket.emit('error', { message: 'You are not enrolled in this course' })
            return
          }
        }
      }

      if (!room) {
        const roomTutorId =
          effectiveRole !== 'student'
            ? userId
            : await (async (): Promise<string> => {
                try {
                  const [session] = await drizzleDb
                    .select({ tutorId: liveSession.tutorId })
                    .from(liveSession)
                    .where(eq(liveSession.sessionId, roomId))
                    .limit(1)
                  return session?.tutorId ?? ''
                } catch {
                  return ''
                }
              })()

        room = {
          id: roomId,
          tutorId: roomTutorId,
          students: new Map(),
          chatHistory: [],
          tasks: [],
          createdAt: new Date(),
          lastActivity: Date.now(),
        }
        activeRooms.set(roomId, room)
      }

      // Hydrate active polls from DB for late joiners
      try {
        const liveSessionRow = await drizzleDb.query.liveSession.findFirst({
          where: eq(liveSession.sessionId, roomId),
        })
        if (liveSessionRow) {
          const activeDbPolls = await drizzleDb.query.poll.findMany({
            where: and(eq(poll.sessionId, liveSessionRow.sessionId), eq(poll.status, 'ACTIVE')),
          })
          if (activeDbPolls.length > 0) {
            const pollIds = activeDbPolls.map(p => p.pollId)
            const allOptions = await drizzleDb
              .select()
              .from(pollOption)
              .where(inArray(pollOption.pollId, pollIds))
            const allResponses = await drizzleDb
              .select()
              .from(pollResponse)
              .where(inArray(pollResponse.pollId, pollIds))
            for (const dbPoll of activeDbPolls) {
              const options = allOptions.filter(o => o.pollId === dbPoll.pollId)
              const responses = allResponses.filter(r => r.pollId === dbPoll.pollId)
              const pollState: PollState = {
                id: dbPoll.pollId,
                sessionId: dbPoll.sessionId,
                tutorId: dbPoll.tutorId,
                question: dbPoll.question,
                type:
                  dbPoll.type === 'MULTIPLE_CHOICE'
                    ? 'multiple_choice'
                    : dbPoll.type === 'TRUE_FALSE'
                      ? 'true_false'
                      : dbPoll.type === 'RATING'
                        ? 'rating'
                        : dbPoll.type === 'SHORT_ANSWER'
                          ? 'short_answer'
                          : 'word_cloud',
                options: options.map(opt => ({
                  id: opt.optionId,
                  label: opt.label,
                  text: opt.text,
                  color: opt.color || undefined,
                })),
                isAnonymous: dbPoll.isAnonymous,
                allowMultiple: dbPoll.allowMultiple,
                showResults: dbPoll.showResults,
                timeLimit: dbPoll.timeLimit ?? undefined,
                status:
                  dbPoll.status === 'ACTIVE'
                    ? 'active'
                    : dbPoll.status === 'CLOSED'
                      ? 'closed'
                      : 'draft',
                startedAt: dbPoll.startedAt ? new Date(dbPoll.startedAt).getTime() : undefined,
                endedAt: dbPoll.endedAt ? new Date(dbPoll.endedAt).getTime() : undefined,
                responses: responses.map(resp => ({
                  id: resp.responseId,
                  respondentHash: resp.respondentHash || undefined,
                  optionIds: resp.optionIds,
                  rating: resp.rating ?? undefined,
                  textAnswer: resp.textAnswer || undefined,
                  studentId: resp.studentId || undefined,
                  createdAt: new Date(resp.createdAt).getTime(),
                })),
              }
              activePolls.set(dbPoll.pollId, pollState)
              if (!sessionPolls.has(dbPoll.sessionId)) {
                sessionPolls.set(dbPoll.sessionId, new Set())
              }
              sessionPolls.get(dbPoll.sessionId)!.add(dbPoll.pollId)
            }
          }
        }
      } catch (err) {
        console.error('Failed to hydrate polls:', err)
      }

      // Add user to room with activity tracking
      await (effectiveRole === 'student'
        ? addStudentToRoom(socket, room)
        : addTutorToRoom(socket, room))

      // Private board sub-room: replay the strokes already drawn to the joining
      // socket, so a tutor opening a student's board (or anyone rejoining) sees
      // the existing drawing instead of a blank board. EnhancedWhiteboard only
      // applies live deltas, so without this the board appears empty. Sent to the
      // joiner alone; attributed to the board owner (board rooms aren't filtered).
      const replayBoardIdx = roomId.indexOf(':board:')
      if (replayBoardIdx >= 0 && room.whiteboardData) {
        const ownerId = roomId.slice(replayBoardIdx + ':board:'.length)
        const wb = room.whiteboardData as {
          strokes?: Array<{ pageIndex?: number }>
          shapes?: Array<{ pageIndex?: number }>
          texts?: Array<{ pageIndex?: number }>
          formulas?: Array<{ pageIndex?: number }>
          graphs?: Array<{ pageIndex?: number }>
        }
        // `replay: true` tells the client this is hydration, not a live echo —
        // the board owner (viewerId === ownerId) would otherwise drop every one
        // of these as its "own echo" and see a blank board on rejoin.
        for (const stroke of wb.strokes ?? []) {
          socket.emit('whiteboard:stroke:added', {
            userId: ownerId,
            stroke,
            pageIndex: stroke.pageIndex ?? 0,
            replay: true,
          })
        }
        for (const shape of wb.shapes ?? []) {
          socket.emit('whiteboard:shape:added', {
            userId: ownerId,
            shape,
            pageIndex: shape.pageIndex ?? 0,
            replay: true,
          })
        }
        for (const text of wb.texts ?? []) {
          socket.emit('whiteboard:text:added', {
            userId: ownerId,
            text,
            pageIndex: text.pageIndex ?? 0,
            replay: true,
          })
        }
        for (const formula of wb.formulas ?? []) {
          socket.emit('whiteboard:formula:added', {
            userId: ownerId,
            formula,
            pageIndex: formula.pageIndex ?? 0,
            replay: true,
          })
        }
        for (const graph of wb.graphs ?? []) {
          socket.emit('whiteboard:graph:added', {
            userId: ownerId,
            graph,
            pageIndex: graph.pageIndex ?? 0,
            replay: true,
          })
        }
      }
    })

    // Activity ping keeps room and student alive during quiet sessions
    socket.on(
      'activity_ping',
      (data: {
        activity?: string
        engagement?: number
        understanding?: number
        roomId?: string
      }) => {
        const roomId = data?.roomId || socket.data.roomId
        if (!roomId) return
        const room = activeRooms.get(roomId)
        if (!room) return
        room.lastActivity = Date.now()
        const student = room.students.get(socket.data.userId)
        if (student) {
          student.lastActivity = Date.now()
          if (typeof data?.engagement === 'number') student.engagement = data.engagement
          if (typeof data?.understanding === 'number') student.understanding = data.understanding
          if (data?.activity) student.currentActivity = data.activity
          // Recompute a coarse status from the (now live) engagement signal so the
          // tutor's Monitor shows a real badge: engaged → on track, waning → needs
          // a nudge, disengaged/away → idle.
          const eng = student.engagement
          student.status = eng >= 60 ? 'on_track' : eng >= 30 ? 'needs_help' : 'idle'
          // Broadcast to tutors so the Monitor reflects the change immediately
          // (room_state is only sent on join). use-socket maps this to the roster.
          io.to(roomId).emit('student_state_update', {
            userId: socket.data.userId,
            state: {
              engagement: student.engagement,
              understanding: student.understanding,
              frustration: student.frustration,
              status: student.status,
              currentActivity: student.currentActivity,
              lastActivity: student.lastActivity,
            },
          })
        }
      }
    )

    // Poll handlers with DB persistence
    socket.on('poll:join', (data: { sessionId: string }) => {
      socket.join(`poll:${data.sessionId}`)
      socket.data.pollSessionId = data.sessionId
    })

    socket.on('poll:leave', (data: { sessionId: string }) => {
      socket.leave(`poll:${data.sessionId}`)
      delete socket.data.pollSessionId
    })

    // Helper: check if a session is currently in a state where tutors can deploy content
    async function canDeployToSession(
      sessionId: string,
      source?: string
    ): Promise<{ ok: true } | { ok: false; reason: string }> {
      try {
        const [sessionRec] = await drizzleDb
          .select({
            status: liveSession.status,
            scheduledAt: liveSession.scheduledAt,
            startedAt: liveSession.startedAt,
            endedAt: liveSession.endedAt,
          })
          .from(liveSession)
          .where(eq(liveSession.sessionId, sessionId))
          .limit(1)

        if (!sessionRec) return { ok: false, reason: 'Session not found' }

        // Homework can be dropped even after session ends
        if (source !== 'homework') {
          if (sessionRec.status === 'ended') return { ok: false, reason: 'Session has ended' }
          if (sessionRec.endedAt) return { ok: false, reason: 'Session has ended' }
        }

        // Must be active or live to deploy (or ended for homework)
        const allowedStatuses =
          source === 'homework'
            ? ['active', 'live', 'preparing', 'paused', 'ended']
            : ['active', 'live', 'preparing', 'paused']
        if (!allowedStatuses.includes(sessionRec.status)) {
          return { ok: false, reason: 'Session has not started yet' }
        }

        return { ok: true }
      } catch {
        return { ok: false, reason: 'Unable to verify session state' }
      }
    }

    socket.on('task:deploy', async (data: { roomId: string; task: LiveTask }) => {
      if (socket.data.role !== 'tutor') {
        socket.emit('task:deploy:error', { error: 'Only tutors can deploy tasks' })
        return
      }
      const { roomId, task } = data
      if (!roomId || !task?.id) {
        socket.emit('task:deploy:error', { error: 'Invalid deploy data' })
        return
      }
      let room = activeRooms.get(roomId)
      if (!room) {
        // Room may have been cleaned up — recreate it on demand
        room = {
          id: roomId,
          tutorId: socket.data.userId || '',
          students: new Map(),
          chatHistory: [],
          tasks: [],
          polls: [],
          whiteboardData: undefined,
          codeEditorContent: '',
          codeLanguage: 'javascript',
          createdAt: new Date(),
          lastActivity: Date.now(),
        }
        activeRooms.set(roomId, room)
        console.log(`[task:deploy] Recreated room ${roomId} on demand`)
      }

      const deployCheck = await canDeployToSession(roomId, task.source)
      if (!deployCheck.ok) {
        socket.emit('task:deploy:error', { error: deployCheck.reason })
        return
      }

      // Refresh any GCS document URLs (re-sign from fileKey) before deploying so
      // students get a live URL rather than a possibly-expired one, and render a
      // raw Office document to PDF so students get an inline viewer rather than a
      // download-only link. Never let this block the deploy — on failure it falls
      // back to the original document.
      let refreshedSourceDocument = task.sourceDocument
      if (task.sourceDocument) {
        try {
          refreshedSourceDocument = await ensureViewableSourceDocument(task.sourceDocument)
        } catch (err) {
          console.warn('[task:deploy] source-document prep failed:', err)
        }
      }

      const normalizedTask: LiveTask = {
        id: task.id,
        title: task.title,
        content: task.content,
        source: task.source || 'task',
        dmiItems: task.dmiItems,
        deployedAt: task.deployedAt || Date.now(),
        polls: Array.isArray(task.polls) ? task.polls : [],
        questions: Array.isArray(task.questions) ? task.questions : [],
        sourceDocument: refreshedSourceDocument,
      }

      const existingIndex = room!.tasks.findIndex(existing => existing.id === normalizedTask.id)
      if (existingIndex >= 0) {
        room!.tasks[existingIndex] = {
          ...room!.tasks[existingIndex],
          ...normalizedTask,
          polls: room!.tasks[existingIndex].polls,
          questions: room!.tasks[existingIndex].questions,
        }
      } else {
        room!.tasks.push(normalizedTask)
      }

      room!.lastActivity = Date.now()
      void persistRoomToRedis(roomId, room!)
      io.to(roomId).emit('task:deployed', normalizedTask)
      io.to(roomId).emit('task:updated', { task: normalizedTask })

      // Create persistent notifications for students in the room
      try {
        const studentIds = Array.from(room!.students.keys())
        if (studentIds.length > 0) {
          void notifyMany({
            userIds: studentIds,
            type: 'assignment',
            title: `New ${normalizedTask.source === 'assessment' ? 'Assessment' : 'Task'}: ${normalizedTask.title}`,
            message: `Your tutor deployed "${normalizedTask.title}" in the live session.`,
            data: { deployType: normalizedTask.source, taskId: normalizedTask.id, roomId },
            actionUrl: `/student/feedback?sessionId=${roomId}`,
          })
        }
      } catch (notifyErr) {
        console.error('Failed to create task deployment notifications:', notifyErr)
      }

      // Persist to Database for Student Directory and Replays
      try {
        const { drizzleDb } = await import('./db/drizzle')
        const { liveSession, deployedMaterial } = await import('./db/schema')
        const { eq } = await import('drizzle-orm')

        const sessionRec = await drizzleDb.query.liveSession.findFirst({
          where: eq(liveSession.sessionId, roomId),
          columns: { courseId: true, sessionId: true },
        })

        // Course-less sessions (1-on-1 / group) persist under a hidden ad-hoc
        // anchor course — mirroring the task:complete handler — so their deploys
        // are recorded and gradable instead of silently dropped.
        const effectiveCourseId = sessionRec?.courseId || (await ensureAdhocAnchorCourseId())
        if (effectiveCourseId) {
          // Sequence orders a deploy within its course's sessions; an ad-hoc
          // session has no course to order within, so it is always 1.
          let sessionSequence = 1
          if (sessionRec?.courseId) {
            const courseSessions = await drizzleDb.query.liveSession.findMany({
              where: eq(liveSession.courseId, sessionRec.courseId),
              orderBy: (sessions, { asc }) => [asc(sessions.scheduledAt)],
            })
            const sessionIndex = courseSessions.findIndex(s => s.sessionId === roomId)
            sessionSequence = sessionIndex >= 0 ? sessionIndex + 1 : 1
          }

          await drizzleDb.insert(deployedMaterial).values({
            sessionId: roomId,
            courseId: effectiveCourseId,
            type: normalizedTask.source,
            itemId: normalizedTask.id,
            title: normalizedTask.title,
            content: normalizedTask as unknown as Record<string, unknown>,
            sessionSequence,
            // Source lesson (deploy-only), so the Desk groups this under the real
            // lesson instead of always "Lesson 1".
            lessonId: typeof task.lessonId === 'string' && task.lessonId ? task.lessonId : null,
            deployedAt: new Date(normalizedTask.deployedAt || Date.now()),
          })

          // We notify clients of the session sequence so they can append "(s1, s2)" etc.
          io.to(roomId).emit('task:deployed:sequence', {
            taskId: normalizedTask.id,
            sequence: sessionSequence,
          })

          // Auto-create a BuilderTask row for this deployed task (if one doesn't
          // already exist) so student completions can be persisted to
          // TaskSubmission — whose taskId FK requires a builderTask. This makes
          // EVERY deployed task gradable (even ad-hoc/unsaved ones) and ensures
          // submissions reach the Grading page. Idempotent on the PK so a real
          // saved task is never overwritten.
          try {
            const tutorId = socket.data.userId
            if (tutorId) {
              // builderTask.lessonId is a NOT NULL FK. Prefer the lesson the task
              // was actually deployed FROM (task.lessonId, sent on the deploy
              // payload) so submissions group under the real lesson instead of
              // always "Lesson 1". Fall back to the course's first lesson, then a
              // placeholder (a course published with only a schedule has none).
              let lesson: { lessonId: string } | undefined
              if (typeof task.lessonId === 'string' && task.lessonId) {
                const [preferred] = await drizzleDb
                  .select({ lessonId: courseLesson.lessonId })
                  .from(courseLesson)
                  .where(
                    and(
                      eq(courseLesson.lessonId, task.lessonId),
                      eq(courseLesson.courseId, effectiveCourseId)
                    )
                  )
                  .limit(1)
                if (preferred?.lessonId) lesson = preferred
              }
              if (!lesson) {
                const [first] = await drizzleDb
                  .select({ lessonId: courseLesson.lessonId })
                  .from(courseLesson)
                  .where(eq(courseLesson.courseId, effectiveCourseId))
                  .orderBy(courseLesson.order)
                  .limit(1)
                lesson = first
              }
              // NOTE: set createdAt/updatedAt explicitly. These columns are
              // declared notNull().defaultNow() in the schema, but the prod DB
              // has drifted and lacks the column DEFAULT, so relying on the
              // default inserts NULL and violates the not-null constraint
              // (this is exactly what was silently breaking grading). $onUpdate
              // does not apply to inserts, so it can't cover this either.
              const now = new Date()
              if (!lesson?.lessonId) {
                const newLessonId = crypto.randomUUID()
                await drizzleDb.insert(courseLesson).values({
                  lessonId: newLessonId,
                  courseId: effectiveCourseId,
                  title: 'Live Session',
                  order: 0,
                  createdAt: now,
                  updatedAt: now,
                })
                lesson = { lessonId: newLessonId }
              }
              // Tutor's marking basis, carried on the deploy payload (never in
              // the student broadcast). Refreshed on each deploy so the live
              // tutor + grader see the latest PCI; only these columns are
              // updated on conflict, so a saved task's title/content is kept.
              const taskPci = typeof task.pci === 'string' ? task.pci.slice(0, 20000) : ''
              const taskPciSpec = normalizePciSpec(task.pciSpec)
              await drizzleDb
                .insert(builderTask)
                .values({
                  taskId: normalizedTask.id,
                  courseId: effectiveCourseId,
                  lessonId: lesson.lessonId,
                  tutorId,
                  title: normalizedTask.title || 'Untitled',
                  content: normalizedTask.content || '',
                  pci: taskPci,
                  pciSpec: taskPciSpec,
                  type: normalizedTask.source,
                  status: 'published',
                  publishedAt: now,
                  createdAt: now,
                  updatedAt: now,
                })
                .onConflictDoUpdate({
                  target: builderTask.taskId,
                  set: { pci: taskPci, pciSpec: taskPciSpec, updatedAt: now },
                })

              // Persist the answer key + marks server-side so live submissions
              // auto-grade against it. Carried on the deploy payload's
              // `answerKey` (never in the student broadcast). One row per task,
              // refreshed on each deploy; the grader reads the latest by taskId.
              const answerKey = Array.isArray(task.answerKey) ? task.answerKey : []
              const gradableKey = answerKey.filter(
                k => k && typeof k.id === 'string' && (k.answer ?? '').toString().trim().length > 0
              )
              if (gradableKey.length > 0) {
                try {
                  await drizzleDb
                    .insert(builderTaskDmi)
                    .values({
                      dmiId: `dmi-${normalizedTask.id}`,
                      taskId: normalizedTask.id,
                      type: normalizedTask.source === 'assessment' ? 'assessment' : 'task',
                      items: gradableKey,
                      createdAt: now,
                      updatedAt: now,
                    })
                    .onConflictDoUpdate({
                      target: builderTaskDmi.dmiId,
                      set: { items: gradableKey, updatedAt: now },
                    })
                } catch (dmiErr) {
                  console.warn(
                    '[task:deploy] BuilderTaskDmi answer-key persist failed (non-critical):',
                    dmiErr
                  )
                }
              }

              // Persist the tutor's answer-reveal policy onto the task metadata
              // so the async assignment GET/submit routes honor it. Merged into
              // existing metadata so other keys are preserved.
              const reveal = task.answerReveal
              if (
                reveal === 'instant' ||
                reveal === 'after_submit' ||
                reveal === 'hidden' ||
                reveal === 'student_choice'
              ) {
                try {
                  const { sql } = await import('drizzle-orm')
                  await drizzleDb
                    .update(builderTask)
                    .set({
                      metadata: sql`COALESCE(${builderTask.metadata}, '{}'::jsonb) || ${JSON.stringify(
                        { answerReveal: reveal }
                      )}::jsonb`,
                    })
                    .where(eq(builderTask.taskId, normalizedTask.id))
                } catch (revealErr) {
                  console.warn(
                    '[task:deploy] answerReveal persist failed (non-critical):',
                    revealErr
                  )
                }
              }
            }
          } catch (btErr) {
            console.warn('[task:deploy] BuilderTask auto-create failed (non-critical):', btErr)
          }
        }
      } catch (err) {
        console.error('Failed to persist deployed material to DB:', err)
      }
    })

    // Tutor requests course content sync to live session
    socket.on('course:sync', async (data: { roomId: string; courseId: string }) => {
      if (socket.data.role !== 'tutor') {
        socket.emit('course:sync:error', { error: 'Only tutors can sync course content' })
        return
      }
      const { roomId, courseId } = data
      if (!roomId || !courseId) {
        socket.emit('course:sync:error', { error: 'Invalid sync data' })
        return
      }

      let room = activeRooms.get(roomId)
      if (!room) {
        room = {
          id: roomId,
          tutorId: socket.data.userId || '',
          students: new Map(),
          chatHistory: [],
          tasks: [],
          polls: [],
          whiteboardData: undefined,
          codeEditorContent: '',
          codeLanguage: 'javascript',
          createdAt: new Date(),
          lastActivity: Date.now(),
        }
        activeRooms.set(roomId, room)
      }

      try {
        const lessons = await drizzleDb
          .select()
          .from(courseLesson)
          .where(eq(courseLesson.courseId, courseId))
          .orderBy(courseLesson.order)

        const syncedTasks: LiveTask[] = []

        for (const lesson of lessons) {
          const bData = (lesson.builderData ?? {}) as Record<string, unknown>
          const tasks = Array.isArray(bData.tasks) ? bData.tasks : []
          const assessments = Array.isArray(bData.assessments) ? bData.assessments : []
          const homework = Array.isArray(bData.homework) ? bData.homework : []

          for (const item of [...tasks, ...assessments, ...homework]) {
            const raw = item as Record<string, unknown>
            const rawSourceDoc = raw.sourceDocument as Record<string, unknown> | undefined
            const refreshedSourceDoc = rawSourceDoc
              ? await ensureViewableSourceDocument({
                  fileName: (rawSourceDoc.fileName as string) || '',
                  fileUrl: (rawSourceDoc.fileUrl as string) || '',
                  // Preserve fileKey so the URL is re-signed from the object key
                  // (reliable) rather than regex-parsing a possibly-expired URL,
                  // and so a raw Office doc can be rendered to an inline PDF.
                  fileKey: (rawSourceDoc.fileKey as string) || undefined,
                  mimeType: (rawSourceDoc.mimeType as string) || '',
                })
              : undefined
            const liveTask: LiveTask = {
              id: (raw.id as string) || `sync-${Date.now()}-${Math.random()}`,
              title: (raw.title as string) || 'Untitled',
              content: (raw.description as string) || (raw.taskContent as string) || '',
              source: tasks.includes(item)
                ? 'task'
                : assessments.includes(item)
                  ? 'assessment'
                  : 'homework',
              // Carry the FULL student-facing fields (input type + options/pairs/
              // hotspot + marks) so a course:sync doesn't overwrite a deployed
              // DMI with bare text fields — that was turning every question into
              // a plain input after a sync. answer/rubric are deliberately NOT
              // included (they must never reach students).
              dmiItems: Array.isArray(raw.dmiItems)
                ? (raw.dmiItems as Array<Record<string, unknown>>).map(
                    (d): LiveTaskDmiItem => ({
                      id: (d.id as string) || '',
                      questionNumber: (d.questionNumber as number) || 0,
                      questionLabel:
                        typeof d.questionLabel === 'string'
                          ? (d.questionLabel as string)
                          : undefined,
                      questionText: (d.questionText as string) || '',
                      marks: typeof d.marks === 'number' ? (d.marks as number) : undefined,
                      questionType: d.questionType as LiveTaskDmiItem['questionType'],
                      options: Array.isArray(d.options) ? (d.options as string[]) : undefined,
                      hotspotImageUrl:
                        typeof d.hotspotImageUrl === 'string' ? d.hotspotImageUrl : undefined,
                      // Student-safe matching/drag_drop fields only; pairs/regions
                      // (the answer key) are never reconstructed onto a broadcast.
                      matchPrompts: Array.isArray(d.matchPrompts)
                        ? (d.matchPrompts as string[])
                        : undefined,
                      matchBank: Array.isArray(d.matchBank) ? (d.matchBank as string[]) : undefined,
                      section: typeof d.section === 'string' ? d.section : undefined,
                    })
                  )
                : undefined,
              deployedAt: Date.now(),
              polls: [],
              questions: [],
              sourceDocument: refreshedSourceDoc,
            }

            const existingIndex = room.tasks.findIndex(t => t.id === liveTask.id)
            if (existingIndex >= 0) {
              // Only sync content UPDATES to tasks the tutor has ALREADY
              // deployed. A task that isn't deployed yet must NOT be introduced
              // to students here — deployment is explicit via the Deploy button
              // (task:deploy). Otherwise editing the builder (e.g. adding a new
              // task) would mass-deploy every task on the next course:sync.
              room.tasks[existingIndex] = { ...room.tasks[existingIndex], ...liveTask }
              syncedTasks.push(liveTask)
            }
            // else: not deployed yet — skip; the tutor deploys it explicitly.
          }
        }

        room.lastActivity = Date.now()
        void persistRoomToRedis(roomId, room)

        // Emit only task:updated (not task:deployed) — these are edits to
        // already-deployed tasks, not new deployments, so they shouldn't trigger
        // the tutor's "Deployed to students" confirmation.
        for (const task of syncedTasks) {
          io.to(roomId).emit('task:updated', { task: toPublicTask(task) })
        }

        socket.emit('course:sync:success', { count: syncedTasks.length })
        console.log(`[course:sync] Synced ${syncedTasks.length} tasks to room ${roomId}`)
      } catch (err) {
        console.error('[course:sync] Failed:', err)
        socket.emit('course:sync:error', { error: 'Failed to sync course content' })
      }
    })

    // Student marks a task as complete
    socket.on(
      'task:complete',
      (
        data: {
          roomId: string
          taskId: string
          answers?: Record<string, string>
          // Set by the chat-task flow: the answers + AI responses were already
          // persisted over HTTP (task-chat route), so this event should only
          // broadcast the live completion tick and NOT write the DB again.
          aiHandled?: boolean
        },
        ack?: (resp: { ok: boolean; error?: string }) => void
      ) => {
        const { roomId, taskId, answers, aiHandled } = data
        if (!roomId || !taskId) {
          ack?.({ ok: false, error: 'Invalid submission' })
          return
        }
        const room = activeRooms.get(roomId)
        if (!room) {
          ack?.({ ok: false, error: 'This session is not active. Rejoin and try again.' })
          return
        }
        const studentId = socket.data.userId
        if (!studentId || !room.students.has(studentId)) {
          ack?.({ ok: false, error: 'Not enrolled in this session' })
          socket.emit('task:complete:error', { error: 'Not enrolled in this session' })
          return
        }
        const task = room.tasks.find(t => t.id === taskId)
        if (!task) {
          ack?.({ ok: false, error: 'Task not found' })
          socket.emit('task:complete:error', { error: 'Task not found' })
          return
        }
        const completed = new Set(task.completedBy || [])
        if (completed.has(studentId)) {
          // Already submitted is not a delivery failure.
          ack?.({ ok: true })
          socket.emit('task:complete:error', { error: 'Already marked complete' })
          return
        }
        completed.add(studentId)
        task.completedBy = Array.from(completed)
        // Capture the student's typed answers so the tutor's Insights can show
        // per-student responses, not just a completion count.
        if (answers && Object.keys(answers).length > 0) {
          task.responses = task.responses || {}
          task.responses[studentId] = answers
        }
        room.lastActivity = Date.now()
        void persistRoomToRedis(roomId, room)
        const studentName = room.students.get(studentId)?.name || 'A student'
        // The completion event carries the student's answers, so it must NOT be
        // broadcast to the room — in a group session that would hand every
        // student their peers' answers. Send it only to the tutor (live grading
        // + Insights) and the submitting student (their own). The room-wide
        // completion COUNT still propagates via the answer-free task:updated
        // below, so peers' progress indicators keep working.
        const completedPayload = {
          taskId,
          studentId,
          studentName,
          completedAt: Date.now(),
          totalCompleted: task.completedBy.length,
          answers: answers ?? {},
        }
        if (room.tutorId) emitToUser(room.tutorId, 'task:completed', completedPayload)
        emitToUser(studentId, 'task:completed', completedPayload)
        io.to(roomId).emit('task:updated', { task: toPublicTask(task) })

        // The server received and accepted the submission — confirm to the
        // student. (DB persistence below is best-effort and self-healing.) If
        // the payload had been dropped — e.g. too large — no ack would arrive
        // and the client would surface a real error instead of a false success.
        ack?.({ ok: true })

        // Chat tasks already persisted everything (taskSubmission + AI responses)
        // over HTTP — this event was only for the live completion tick, so stop
        // before the DB write to avoid clobbering that richer row.
        if (aiHandled) return

        // Persist the completion durably so it reaches the tutor's grading
        // views. There are THREE tutor readers with DIFFERENT requirements:
        //   - Grading page (/api/tutor/submissions): taskSubmission ⋈ builderTask,
        //     filtered by builderTask.tutorId.
        //   - In-session SubmissionsPanel (/submissions-tree) and the live panel:
        //     taskSubmission filtered by deployedMaterial.itemId AND the student
        //     being a sessionParticipant (or course enrollee).
        // So a submission only shows everywhere if builderTask, deployedMaterial,
        // and sessionParticipant all exist. The deploy-time creation of those is
        // skipped when the live session had no courseId (or failed), which is why
        // completions went missing. Self-heal all of them here. Everything is
        // FK-safe and idempotent; failures never affect the live session.
        void (async () => {
          try {
            const sess = await drizzleDb.query.liveSession.findFirst({
              where: eq(liveSession.sessionId, roomId),
              columns: { courseId: true, tutorId: true },
            })
            const tutorId = sess?.tutorId || room.tutorId
            // builderTask/deployedMaterial both require a NOT NULL courseId. A
            // live session may have none (ad-hoc, or the course was deleted →
            // courseId set null). Anchor those rows to a hidden system course so
            // the completion still persists and reaches the tutor. We only need
            // a tutorId to own the BuilderTask; without one we truly can't.
            if (!tutorId) {
              console.warn(
                '[task:complete] NOT persisting — no tutor for session (cannot own the task).',
                { roomId, taskId, studentId, hasSessionRow: !!sess }
              )
              return
            }
            const courseId = sess?.courseId || (await ensureAdhocAnchorCourseId())

            // Set createdAt/updatedAt/etc. explicitly throughout. These columns
            // are notNull().defaultNow() in the schema, but the prod DB has
            // drifted and lacks the column DEFAULT — relying on it inserts NULL
            // and violates the not-null constraint, which is what silently broke
            // every persist in this chain. Explicit values are drift-proof.
            const now = new Date()

            // 1) Lesson (builderTask.lessonId is NOT NULL). Prefer the lesson the
            //    task was deployed from; fall back to the first lesson, then a
            //    placeholder.
            let lesson: { lessonId: string } | undefined
            if (typeof task.lessonId === 'string' && task.lessonId) {
              const [preferred] = await drizzleDb
                .select({ lessonId: courseLesson.lessonId })
                .from(courseLesson)
                .where(
                  and(eq(courseLesson.lessonId, task.lessonId), eq(courseLesson.courseId, courseId))
                )
                .limit(1)
              if (preferred?.lessonId) lesson = preferred
            }
            if (!lesson) {
              const [first] = await drizzleDb
                .select({ lessonId: courseLesson.lessonId })
                .from(courseLesson)
                .where(eq(courseLesson.courseId, courseId))
                .orderBy(courseLesson.order)
                .limit(1)
              lesson = first
            }
            if (!lesson?.lessonId) {
              const newLessonId = crypto.randomUUID()
              await drizzleDb.insert(courseLesson).values({
                lessonId: newLessonId,
                courseId,
                title: 'Live Session',
                order: 0,
                createdAt: now,
                updatedAt: now,
              })
              lesson = { lessonId: newLessonId }
            }

            // 2) builderTask — FK target for taskSubmission; read by the Grading page.
            //    Carry the tutor's PCI + structured spec (deploy-only; never
            //    broadcast). Refreshed on conflict without clobbering title/content.
            const completedPci = typeof task.pci === 'string' ? task.pci.slice(0, 20000) : ''
            const completedPciSpec = normalizePciSpec(task.pciSpec)
            await drizzleDb
              .insert(builderTask)
              .values({
                taskId,
                courseId,
                lessonId: lesson.lessonId,
                tutorId,
                title: task.title || 'Untitled',
                content: task.content || '',
                pci: completedPci,
                pciSpec: completedPciSpec,
                type: task.source,
                status: 'published',
                publishedAt: now,
                createdAt: now,
                updatedAt: now,
              })
              .onConflictDoUpdate({
                target: builderTask.taskId,
                set: { pci: completedPci, pciSpec: completedPciSpec, updatedAt: now },
              })

            // 3) deployedMaterial — without it, the in-session SubmissionsPanel
            //    (/submissions-tree) and live panel filter the submission out.
            //    No unique constraint on (sessionId, itemId), so check first.
            const [alreadyDeployed] = await drizzleDb
              .select({ id: deployedMaterial.id })
              .from(deployedMaterial)
              .where(
                and(eq(deployedMaterial.sessionId, roomId), eq(deployedMaterial.itemId, taskId))
              )
              .limit(1)
            if (!alreadyDeployed) {
              await drizzleDb.insert(deployedMaterial).values({
                sessionId: roomId,
                courseId,
                type: task.source,
                itemId: taskId,
                title: task.title || 'Untitled',
                sessionSequence: 1,
                lessonId: lesson.lessonId,
                deployedAt: now,
              })
            }

            // 4) sessionParticipant — the tree readers require the student to be
            //    a participant (or course enrollee). The student is here now.
            await drizzleDb
              .insert(sessionParticipant)
              .values({
                participantId: crypto.randomUUID(),
                sessionId: roomId,
                studentId,
                joinedAt: now,
              })
              .onConflictDoNothing({
                target: [sessionParticipant.sessionId, sessionParticipant.studentId],
              })

            // Live auto-grade: score the answers against the task's DMI answer
            // key (stored server-side in BuilderTaskDmi.items; never sent to
            // students). Conservative + best-effort — leaves score null when
            // there's no answer key. This feeds the tutor's live Understanding.
            let autoScore: number | null = null
            let autoResults: ReturnType<typeof autoGradeDmi>['questionResults'] = null
            let correctAnswers: Record<string, string> | null = null
            try {
              const [dmi] = await drizzleDb
                .select({ items: builderTaskDmi.items })
                .from(builderTaskDmi)
                .where(eq(builderTaskDmi.taskId, taskId))
                .orderBy(desc(builderTaskDmi.updatedAt))
                .limit(1)
              if (dmi?.items) {
                const items = dmi.items as { id: string; answer?: string; marks?: number }[]
                const graded = autoGradeDmi(items, (answers ?? {}) as Record<string, string>)
                // score is the marks-weighted percentage (0–100); maxScore stays
                // 100 to preserve the app-wide percentage contract. The raw marks
                // total is surfaced in the tutor DMI view, not the submission row.
                autoScore = graded.score
                autoResults = graded.questionResults

                // Answer reveal: once the student has submitted, expose the
                // correct answers UNLESS the tutor set the policy to 'hidden'
                // (unset defaults to reveal — matching the REST assignments
                // contract's 'instant' default). These reach only the submitter +
                // tutor via the private task:graded below, never peers.
                const [bt] = await drizzleDb
                  .select({ metadata: builderTask.metadata })
                  .from(builderTask)
                  .where(eq(builderTask.taskId, taskId))
                  .limit(1)
                const reveal = (bt?.metadata as { answerReveal?: string } | null)?.answerReveal
                if (reveal !== 'hidden') {
                  const key: Record<string, string> = {}
                  for (const it of items) {
                    if (
                      it &&
                      typeof it.id === 'string' &&
                      typeof it.answer === 'string' &&
                      it.answer.trim()
                    ) {
                      key[it.id] = it.answer
                    }
                  }
                  if (Object.keys(key).length > 0) correctAnswers = key
                }
              }
            } catch (gradeErr) {
              console.warn('[task:complete] auto-grade failed (non-critical):', gradeErr)
            }

            // Push the auto-grade outcome only to the tutor (live view) and the
            // submitting student (their own score + per-question result) — never
            // to peers, so a group session doesn't reveal one student's result to
            // the others. `questionResults` is student-safe by design (correct/
            // needs-review flags, never the answer key — see AutoGradeQuestionResult).
            const gradedPayload = {
              taskId,
              studentId,
              score: autoScore,
              questionResults: autoResults,
              // Correct answers per item when the reveal policy permits (null
              // otherwise). Safe here: the tutor owns the key, and the student
              // has already submitted. Never sent to peers (this event is private).
              correctAnswers,
            }
            if (tutorId) emitToUser(tutorId, 'task:graded', gradedPayload)
            emitToUser(studentId, 'task:graded', gradedPayload)

            // 5) The submission itself. onConflictDoNothing preserves the
            //    one-per-(task,student) rule and never overwrites a graded row.
            //    Status stays 'submitted' so the tutor can still review/override.
            await drizzleDb
              .insert(taskSubmission)
              .values({
                submissionId: crypto.randomUUID(),
                taskId,
                studentId,
                answers: answers ?? {},
                timeSpent: 0,
                attempts: 1,
                questionResults: autoResults,
                score: autoScore,
                maxScore: 100,
                status: 'submitted',
                tutorApproved: false,
                submittedAt: now,
              })
              .onConflictDoNothing({ target: [taskSubmission.taskId, taskSubmission.studentId] })

            console.log('[task:complete] submission persisted', {
              roomId,
              taskId,
              studentId,
              courseId,
              source: task.source,
            })
          } catch (err) {
            console.warn('[task:complete] TaskSubmission persist failed (non-critical):', err)
          }
        })()
      }
    )

    // Tutor assigns homework during live class
    socket.on(
      'homework:assigned',
      (data: {
        roomId: string
        homework: {
          id: string
          title: string
          content: string
          dmiItems?: any[]
          sourceDocument?: any
          lessonId?: string
          lessonName?: string
        }
      }) => {
        if (socket.data.role !== 'tutor') {
          socket.emit('homework:error', { error: 'Only tutors can assign homework' })
          return
        }
        const { roomId, homework } = data
        if (!roomId || !homework?.id) {
          socket.emit('homework:error', { error: 'Invalid homework data' })
          return
        }

        let room = activeRooms.get(roomId)
        if (!room) {
          room = {
            id: roomId,
            tutorId: socket.data.userId || '',
            students: new Map(),
            chatHistory: [],
            tasks: [],
            polls: [],
            whiteboardData: undefined,
            codeEditorContent: '',
            codeLanguage: 'javascript',
            createdAt: new Date(),
            lastActivity: Date.now(),
          }
          activeRooms.set(roomId, room)
        }

        room!.lastActivity = Date.now()
        void persistRoomToRedis(roomId, room!)

        // Broadcast to all students in the room
        io.to(roomId).emit('homework:received', {
          ...homework,
          assignedAt: new Date().toISOString(),
          tutorId: socket.data.userId,
        })

        // Also emit to individual student feedback channels
        room!.students.forEach((_studentState, studentId) => {
          io.to(`feedback:student:${studentId}`).emit('homework:received', {
            ...homework,
            assignedAt: new Date().toISOString(),
            tutorId: socket.data.userId,
          })
        })

        // Create persistent notifications for students
        try {
          const studentIds = Array.from(room!.students.keys())
          if (studentIds.length > 0) {
            void notifyMany({
              userIds: studentIds,
              type: 'assignment',
              title: `New Homework: ${homework.title}`,
              message: `Your tutor assigned "${homework.title}" as homework.`,
              data: { deployType: 'homework', homeworkId: homework.id, roomId },
              actionUrl: `/student/feedback?sessionId=${roomId}`,
            })
          }
        } catch (notifyErr) {
          console.error('Failed to create homework assignment notifications:', notifyErr)
        }
      }
    )

    socket.on(
      'tutor:whiteboard:update',
      (data: {
        roomId: string
        board: { pages: unknown[]; pageIndex: number; updatedAt?: number }
      }) => {
        if (socket.data.role !== 'tutor') return
        const { roomId, board } = data || ({} as any)
        if (!roomId || !board) return

        let room = activeRooms.get(roomId)
        if (!room) {
          room = {
            id: roomId,
            tutorId: socket.data.userId || '',
            students: new Map(),
            chatHistory: [],
            tasks: [],
            polls: [],
            whiteboardData: undefined,
            codeEditorContent: '',
            codeLanguage: 'javascript',
            createdAt: new Date(),
            lastActivity: Date.now(),
          }
          activeRooms.set(roomId, room)
        }

        room.lastActivity = Date.now()
        // Legacy full-state snapshot — delta sync is preferred
        room.whiteboardData = {
          ...(room.whiteboardData || {}),
          tutorBoard: board,
        }
        io.to(roomId).emit('tutor:whiteboard:update', board)
      }
    )

    // --- Whiteboard state sync (delta-first with on-demand snapshot) ---
    socket.on(
      'whiteboard:state:request',
      (data: {
        roomId: string
        target: 'tutorBoard' | 'studentBoard' | 'all'
        studentId?: string
      }) => {
        const { roomId, target, studentId } = data || ({} as any)
        if (!roomId || !target) return
        const room = activeRooms.get(roomId)
        if (!room) return

        const wb = (room.whiteboardData || {}) as Record<string, any>
        const payload: Record<string, unknown> = { roomId, target }

        if (target === 'tutorBoard' || target === 'all') {
          if (wb.tutorBoard) payload.tutorBoard = wb.tutorBoard
        }

        if (target === 'studentBoard' || target === 'all') {
          const sid = studentId || socket.data.userId
          const studentBoards = (wb.studentBoards || {}) as Record<string, unknown>
          if (sid && studentBoards[sid]) {
            payload.studentId = sid
            payload.studentBoard = studentBoards[sid]
          }
          if (target === 'all' && wb.studentBoards) {
            payload.studentBoards = wb.studentBoards
          }
        }

        socket.emit('whiteboard:state:response', payload)
      }
    )

    // Student sends full-board snapshot only when tutor explicitly requests it
    // (via whiteboard:state:request). Delta sync (whiteboard:stroke:add etc.)
    // handles real-time updates without full-state overhead.
    socket.on(
      'student:whiteboard:update',
      (data: {
        roomId: string
        board: { pages: unknown[]; pageIndex: number; updatedAt?: number }
      }) => {
        if (socket.data.role !== 'student') return
        const { roomId, board } = data || ({} as any)
        if (!roomId || !board) return

        let room = activeRooms.get(roomId)
        if (!room) {
          room = {
            id: roomId,
            tutorId: '',
            students: new Map(),
            chatHistory: [],
            tasks: [],
            polls: [],
            whiteboardData: undefined,
            codeEditorContent: '',
            codeLanguage: 'javascript',
            createdAt: new Date(),
            lastActivity: Date.now(),
          }
          activeRooms.set(roomId, room)
        }

        room.lastActivity = Date.now()
        const studentId = socket.data.userId
        const existing = (room.whiteboardData || {}) as Record<string, unknown>
        const studentBoards = (existing.studentBoards || {}) as Record<string, typeof board>
        room.whiteboardData = {
          ...existing,
          studentBoards: {
            ...studentBoards,
            [studentId]: board,
          },
        }
        // Push the full board (pages + active page) to the rest of the room so the
        // tutor sees newly added pages and can follow the student's page switches in
        // realtime — not just on-demand. Per-stroke deltas only grow pages when the
        // student actually draws, so blank pages and page switches need this snapshot.
        socket.to(roomId).emit('student:whiteboard:update', {
          studentId,
          pages: board.pages,
          pageIndex: board.pageIndex,
          updatedAt: board.updatedAt ?? Date.now(),
        })
      }
    )

    // A socket may only mutate/broadcast into a private board sub-room it actually
    // joined. `join_class` gates board membership to the owner + base-session
    // tutor (and makes a rejected socket leave), but io.to(roomId).emit does NOT
    // require the sender to be a member — so without this check a crafted
    // `roomId = "<session>:board:<victim>"` could write to a board the sender was
    // rejected from. Base (non-board) rooms keep their existing behaviour.
    const canWriteRoom = (roomId: string): boolean =>
      !roomId.includes(':board:') || socket.rooms.has(roomId)

    // Incremental whiteboard delta sync handlers
    socket.on(
      'whiteboard:stroke:add',
      (data: { roomId: string; stroke: StrokeDelta; pageIndex?: number }) => {
        if (socket.data.role !== 'tutor' && socket.data.role !== 'student') return
        const { roomId, stroke, pageIndex } = data || ({} as any)
        if (!roomId || !stroke) return
        if (!canWriteRoom(roomId)) return

        const room = activeRooms.get(roomId)
        if (!room) return

        room.lastActivity = Date.now()
        const wb = (room.whiteboardData || {}) as Record<string, unknown>
        const strokes = (wb.strokes || []) as StrokeDelta[]
        room.whiteboardData = {
          ...wb,
          strokes: trimToCap([...strokes, { ...stroke, pageIndex }], WHITEBOARD_MAX_ITEMS_PER_TYPE),
        }
        io.to(roomId).emit('whiteboard:stroke:added', {
          userId: socket.data.userId,
          stroke,
          pageIndex,
        })
      }
    )

    socket.on(
      'whiteboard:shape:add',
      (data: { roomId: string; shape: ShapeDelta; pageIndex?: number }) => {
        if (socket.data.role !== 'tutor' && socket.data.role !== 'student') return
        const { roomId, shape, pageIndex } = data || ({} as any)
        if (!roomId || !shape) return
        if (!canWriteRoom(roomId)) return

        const room = activeRooms.get(roomId)
        if (!room) return

        room.lastActivity = Date.now()
        const wb = (room.whiteboardData || {}) as Record<string, unknown>
        const shapes = (wb.shapes || []) as ShapeDelta[]
        room.whiteboardData = {
          ...wb,
          shapes: trimToCap([...shapes, { ...shape, pageIndex }], WHITEBOARD_MAX_ITEMS_PER_TYPE),
        }
        io.to(roomId).emit('whiteboard:shape:added', {
          userId: socket.data.userId,
          shape,
          pageIndex,
        })
      }
    )

    socket.on(
      'whiteboard:text:add',
      (data: { roomId: string; text: TextDelta; pageIndex?: number }) => {
        if (socket.data.role !== 'tutor' && socket.data.role !== 'student') return
        const { roomId, text, pageIndex } = data || ({} as any)
        if (!roomId || !text) return
        if (!canWriteRoom(roomId)) return

        const room = activeRooms.get(roomId)
        if (!room) return

        room.lastActivity = Date.now()
        const wb = (room.whiteboardData || {}) as Record<string, unknown>
        const texts = (wb.texts || []) as TextDelta[]
        room.whiteboardData = {
          ...wb,
          texts: trimToCap([...texts, { ...text, pageIndex }], WHITEBOARD_MAX_ITEMS_PER_TYPE),
        }
        io.to(roomId).emit('whiteboard:text:added', { userId: socket.data.userId, text, pageIndex })
      }
    )

    socket.on('whiteboard:cursor:move', (data: { roomId: string; cursor: CursorDelta }) => {
      if (socket.data.role !== 'tutor' && socket.data.role !== 'student') return
      const { roomId, cursor } = data || ({} as any)
      if (!roomId || !cursor) return

      const room = activeRooms.get(roomId)
      if (!room) return

      room.lastActivity = Date.now()
      // Cursor movements are ephemeral — no persistence
      io.to(roomId).emit('whiteboard:cursor:moved', { cursor })
    })

    socket.on(
      'whiteboard:formula:add',
      (data: { roomId: string; formula: FormulaDelta; pageIndex?: number }) => {
        if (socket.data.role !== 'tutor' && socket.data.role !== 'student') return
        const { roomId, formula, pageIndex } = data || ({} as any)
        if (!roomId || !formula) return
        if (!canWriteRoom(roomId)) return

        const room = activeRooms.get(roomId)
        if (!room) return

        room.lastActivity = Date.now()
        const wb = (room.whiteboardData || {}) as Record<string, unknown>
        const formulas = (wb.formulas || []) as FormulaDelta[]
        room.whiteboardData = {
          ...wb,
          formulas: trimToCap(
            [...formulas, { ...formula, pageIndex }],
            WHITEBOARD_MAX_ITEMS_PER_TYPE
          ),
        }
        io.to(roomId).emit('whiteboard:formula:added', {
          userId: socket.data.userId,
          formula,
          pageIndex,
        })
      }
    )

    socket.on(
      'whiteboard:graph:add',
      (data: { roomId: string; graph: GraphDelta; pageIndex?: number }) => {
        if (socket.data.role !== 'tutor' && socket.data.role !== 'student') return
        const { roomId, graph, pageIndex } = data || ({} as any)
        if (!roomId || !graph) return
        if (!canWriteRoom(roomId)) return

        const room = activeRooms.get(roomId)
        if (!room) return

        room.lastActivity = Date.now()
        const wb = (room.whiteboardData || {}) as Record<string, unknown>
        const graphs = (wb.graphs || []) as GraphDelta[]
        room.whiteboardData = {
          ...wb,
          graphs: trimToCap([...graphs, { ...graph, pageIndex }], WHITEBOARD_MAX_ITEMS_PER_TYPE),
        }
        io.to(roomId).emit('whiteboard:graph:added', {
          userId: socket.data.userId,
          graph,
          pageIndex,
        })
      }
    )

    socket.on('whiteboard:page:clear', (data: { roomId: string; pageIndex: number }) => {
      if (socket.data.role !== 'tutor' && socket.data.role !== 'student') return
      const { roomId, pageIndex } = data || ({} as any)
      if (!roomId || typeof pageIndex !== 'number') return
      if (!canWriteRoom(roomId)) return

      const room = activeRooms.get(roomId)
      if (!room) return

      room.lastActivity = Date.now()
      const wb = (room.whiteboardData || {}) as Record<string, unknown>
      const strokes = ((wb.strokes || []) as StrokeDelta[]).filter(s => s.pageIndex !== pageIndex)
      const shapes = ((wb.shapes || []) as ShapeDelta[]).filter(s => s.pageIndex !== pageIndex)
      const texts = ((wb.texts || []) as TextDelta[]).filter(t => t.pageIndex !== pageIndex)
      const formulas = ((wb.formulas || []) as FormulaDelta[]).filter(
        f => f.pageIndex !== pageIndex
      )
      const graphs = ((wb.graphs || []) as GraphDelta[]).filter(g => g.pageIndex !== pageIndex)
      room.whiteboardData = {
        ...wb,
        strokes,
        shapes,
        texts,
        formulas,
        graphs,
      }
      io.to(roomId).emit('whiteboard:page:cleared', { pageIndex })
    })

    socket.on(
      'insight:send',
      async (data: {
        roomId: string
        taskId?: string
        type: 'poll' | 'question' | 'tutor:state_sync'
        prompt?: string
        /** Poll option labels chosen by the tutor (True/False, Yes/No, custom).
         *  Omitted ⇒ default A–E. */
        options?: string[]
        payload?: unknown
      }) => {
        if (socket.data.role !== 'tutor') return
        const { roomId, taskId, type, prompt, payload } = data
        if (!roomId) return

        if (type === 'tutor:state_sync') {
          io.to(roomId).emit('insight:receive', { type, payload })
          return
        }

        const deployCheck = await canDeployToSession(roomId)
        if (!deployCheck.ok) {
          socket.emit('insight:send:error', { error: deployCheck.reason })
          return
        }

        if (!taskId) return
        let room = activeRooms.get(roomId)
        if (!room && redisClient) {
          const redisRoom = await getRoomFromRedis(roomId)
          if (redisRoom) {
            room = redisRoom
            activeRooms.set(roomId, room)
          }
        }
        if (!room) {
          socket.emit('insight:send:error', { error: 'Room not available' })
          return
        }

        let task = room.tasks.find(item => item.id === taskId)
        if (!task) {
          try {
            const [material] = await drizzleDb
              .select({ content: deployedMaterial.content })
              .from(deployedMaterial)
              .where(
                and(eq(deployedMaterial.sessionId, roomId), eq(deployedMaterial.itemId, taskId))
              )
              .limit(1)
            const content = material?.content as any
            if (content?.id) {
              task = {
                id: content.id,
                title: content.title,
                content: content.content,
                source: content.source || 'task',
                dmiItems: content.dmiItems,
                deployedAt: content.deployedAt || Date.now(),
                polls: Array.isArray(content.polls) ? content.polls : [],
                questions: Array.isArray(content.questions) ? content.questions : [],
                sourceDocument: content.sourceDocument,
              }
              room.tasks.push(task)
              room.lastActivity = Date.now()
              void persistRoomToRedis(roomId, room)
            }
          } catch {}
        }
        if (!task) {
          socket.emit('insight:send:error', { error: 'Task is not deployed to this session' })
          return
        }

        if (type === 'poll') {
          // Tutor-chosen labels (True/False, Yes/No, custom); fall back to A–E.
          // Sanitized: trimmed, non-empty, deduped-by-position, capped at 8.
          const rawLabels = Array.isArray(data.options)
            ? data.options.map(o => String(o ?? '').trim()).filter(Boolean)
            : []
          const labels = rawLabels.length >= 2 ? rawLabels.slice(0, 8) : ['A', 'B', 'C', 'D', 'E']
          const poll: LiveTaskPoll = {
            id: `poll-${taskId}-${Date.now()}`,
            taskId,
            question: prompt || 'Did you find this task difficult?',
            // Index-based options; a vote's `value` is the chosen 0-based index.
            options: labels.map((_, i) => i),
            optionLabels: labels,
            status: 'open',
            responses: [],
            createdAt: Date.now(),
          }
          task.polls.push(poll)
          room.lastActivity = Date.now()
          void persistRoomToRedis(roomId, room)
          io.to(roomId).emit('insight:sent', { taskId, type: 'poll', item: poll })
          io.to(roomId).emit('task:updated', { task: toPublicTask(task) })
          return
        }

        const question: LiveTaskQuestion = {
          id: `question-${taskId}-${Date.now()}`,
          taskId,
          prompt: prompt || 'Do you have a question about this task?',
          status: 'open',
          responses: [],
          createdAt: Date.now(),
        }
        task.questions.push(question)
        room.lastActivity = Date.now()
        void persistRoomToRedis(roomId, room)
        io.to(roomId).emit('insight:sent', { taskId, type: 'question', item: question })
        io.to(roomId).emit('task:updated', { task: toPublicTask(task) })
      }
    )

    socket.on(
      'insight:respond',
      (data: {
        roomId: string
        taskId: string
        type: 'poll' | 'question'
        insightId: string
        value?: number
        answer?: string
      }) => {
        const { roomId, taskId, type, insightId, value, answer } = data
        if (!roomId || !taskId || !insightId) return
        const room = activeRooms.get(roomId)
        if (!room) return

        const task = room.tasks.find(item => item.id === taskId)
        if (!task) return

        if (type === 'poll') {
          const poll = task.polls.find(item => item.id === insightId)
          if (!poll || poll.status === 'closed' || typeof value !== 'number') return
          const studentId = socket.data.userId
          if (!studentId) return
          const existingIndex = poll.responses.findIndex(r => r.studentId === studentId)
          // Once answered, a response is immutable — ignore any change attempt.
          if (existingIndex >= 0) return
          const response: LiveTaskPollResponse = {
            studentId,
            value,
            submittedAt: Date.now(),
          }
          poll.responses.push(response)
          room.lastActivity = Date.now()
          void persistRoomToRedis(roomId, room)
          io.to(roomId).emit('insight:response', { taskId, type: 'poll', item: poll })
          io.to(roomId).emit('task:updated', { task: toPublicTask(task) })
          return
        }

        const question = task.questions.find(item => item.id === insightId)
        if (!question || question.status === 'closed') return
        const studentId = socket.data.userId
        if (!studentId || !answer?.trim()) return
        const existingIndex = question.responses.findIndex(r => r.studentId === studentId)
        // Once answered, a response is immutable — ignore any change attempt.
        if (existingIndex >= 0) return
        const response: LiveTaskQuestionResponse = {
          studentId,
          answer: answer.trim(),
          submittedAt: Date.now(),
        }
        question.responses.push(response)
        room.lastActivity = Date.now()
        void persistRoomToRedis(roomId, room)
        io.to(roomId).emit('insight:response', { taskId, type: 'question', item: question })
        io.to(roomId).emit('task:updated', { task: toPublicTask(task) })
      }
    )

    // Tutor closes a poll/question: no further responses are accepted and the
    // already-collected answers are locked. Broadcast so both sides update.
    socket.on(
      'insight:close',
      (data: { roomId: string; taskId: string; type: 'poll' | 'question'; insightId: string }) => {
        const { roomId, taskId, type, insightId } = data
        if (!roomId || !taskId || !insightId) return
        const room = activeRooms.get(roomId)
        if (!room) return
        const task = room.tasks.find(item => item.id === taskId)
        if (!task) return

        if (type === 'poll') {
          const poll = task.polls.find(item => item.id === insightId)
          if (!poll) return
          poll.status = 'closed'
          io.to(roomId).emit('insight:response', { taskId, type: 'poll', item: poll })
        } else {
          const question = task.questions.find(item => item.id === insightId)
          if (!question) return
          question.status = 'closed'
          io.to(roomId).emit('insight:response', { taskId, type: 'question', item: question })
        }
        room.lastActivity = Date.now()
        void persistRoomToRedis(roomId, room)
        io.to(roomId).emit('task:updated', { task: toPublicTask(task) })
      }
    )

    // --- Student Screen Mirroring / Monitoring ---
    socket.on('student:state_sync', (data: { roomId: string; payload: unknown }) => {
      if (socket.data.role !== 'student') return
      const { roomId, payload } = data
      if (!roomId) return
      // Broadcast this student's state to tutors in the room
      io.to(roomId).emit('student:state_update', {
        studentId: socket.data.userId,
        studentName: socket.data.name,
        payload,
      })
    })

    // --- Tutor Direct Messaging / Help ---
    socket.on(
      'tutor:direct_message',
      (data: { roomId: string; studentId: string; message: string }) => {
        if (socket.data.role !== 'tutor') return
        const { roomId, studentId, message } = data
        if (!roomId || !studentId || !message) return
        // Deliver ONLY to the target student's own `user:` room — not the whole
        // class. Broadcasting to the room (with client-side filtering) leaked the
        // message text to every peer's socket; `emitToUser` keeps a "private" nudge
        // actually private. Payload shape unchanged, so existing listeners (the
        // 1-on-1 classroom + the course-builder feedback page) still match on
        // `targetStudentId`.
        emitToUser(studentId, 'student:direct_message', {
          targetStudentId: studentId,
          message,
        })
      }
    )

    // --- Tutor ends the session for everyone ---
    // Mirrors the server's own duration-timeout end (mark the LiveSession ended +
    // broadcast session:ended), just triggered on demand by the tutor. The
    // booking-completion sweep runs independently, so this only closes the live
    // room early — no refund/series side effects.
    socket.on('tutor:end_session', async (data: { roomId: string }) => {
      if (socket.data.role !== 'tutor') return
      const roomId = data?.roomId || socket.data.roomId
      if (!roomId || !socket.data.userId) return
      try {
        // Scope the end to a session THIS tutor owns — `roomId` is client-supplied,
        // so without the tutorId predicate any tutor could end (and kick everyone
        // out of) any session by id. Only broadcast if a row was actually ended.
        const ended = await drizzleDb
          .update(liveSession)
          .set({ status: 'ended', endedAt: new Date() })
          .where(
            and(eq(liveSession.sessionId, roomId), eq(liveSession.tutorId, socket.data.userId))
          )
          .returning({ id: liveSession.sessionId })
        if (ended.length === 0) return // not this tutor's session — do nothing
      } catch (err) {
        console.warn('[tutor:end_session] failed to mark session ended:', err)
        return
      }
      io.to(roomId).emit('session:ended', { sessionId: roomId, reason: 'tutor' })
    })

    // Enhanced disconnect handler with cleanup
    socket.on('disconnect', async () => {
      console.log(`Client disconnected: ${socket.id}`)

      // Clean up various states
      const userId = socket.data.userId
      const roomId = socket.data.roomId

      clearUserSocketIfCurrent(userId, socket.id)

      if (roomId && userId) {
        const room = activeRooms.get(roomId)
        if (room && socket.data.role === 'student') {
          room.students.delete(userId)
          room.lastActivity = Date.now()
          socket.to(roomId).emit('student_left', { userId })

          // Update sessionParticipant.leftAt in database
          try {
            const liveSessionRow = await drizzleDb.query.liveSession.findFirst({
              where: eq(liveSession.sessionId, roomId),
              columns: { sessionId: true },
            })
            if (liveSessionRow) {
              await drizzleDb
                .update(sessionParticipant)
                .set({ leftAt: new Date() })
                .where(
                  and(
                    eq(sessionParticipant.sessionId, liveSessionRow.sessionId),
                    eq(sessionParticipant.studentId, userId)
                  )
                )
            }
          } catch (err) {
            console.error('Failed to update sessionParticipant leftAt:', err)
          }
        }
        // Whiteboard cleanup removed
      }

      // Connection rate limit cleanup
      connectionRateLimits.delete(socket.data.userId || socket.id)
    })
  })

  const originalClose = io.close.bind(io)
  io.close = ((cb?: (err?: Error) => void) => {
    intervalHandles.forEach(handle => clearInterval(handle))
    intervalHandles.length = 0

    const closeRedis = async () => {
      try {
        await Promise.allSettled([
          redisClient?.quit?.() ?? Promise.resolve(),
          redisPubClient?.quit?.() ?? Promise.resolve(),
          redisSubClient?.quit?.() ?? Promise.resolve(),
        ])
      } catch {
        // best-effort cleanup
      } finally {
        redisClient = null
        redisPubClient = null
        redisSubClient = null
      }
    }

    void closeRedis()
    return originalClose(cb)
  }) as SocketIOServer['close']

  return io
}

// Helper functions (implementing join_class logic)
async function addStudentToRoom(socket: Socket, room: ClassRoom) {
  const studentState: StudentState = {
    userId: socket.data.userId,
    name: socket.data.name,
    status: 'on_track',
    engagement: 100,
    understanding: 80,
    frustration: 0,
    lastActivity: Date.now(),
    joinedAt: Date.now(),
  }

  room.students.set(socket.data.userId, studentState)
  room.lastActivity = Date.now()

  socket.to(room.id).emit('student_joined', {
    userId: socket.data.userId,
    name: socket.data.name,
    state: studentState,
  })

  // Students hydrate from public tasks only — `toPublicTask` drops the
  // per-student answer map so a group-session joiner never receives peers'
  // answers on join. (The tutor path below keeps `responses` for grading.)
  const refreshedTasks = await Promise.all(
    room.tasks.map(async task => ({
      ...toPublicTask(task),
      sourceDocument: task.sourceDocument
        ? await refreshDocumentUrls(task.sourceDocument)
        : undefined,
    }))
  )

  socket.emit('room_state', {
    students: Array.from(room.students.values()),
    chatHistory: room.chatHistory.slice(-50),
    whiteboardData: room.whiteboardData,
    tasks: refreshedTasks,
  })
}

async function addTutorToRoom(socket: Socket, room: ClassRoom) {
  room.lastActivity = Date.now()

  const refreshedTasks = await Promise.all(
    room.tasks.map(async task => ({
      ...task,
      sourceDocument: task.sourceDocument
        ? await refreshDocumentUrls(task.sourceDocument)
        : undefined,
    }))
  )

  socket.emit('room_state', {
    students: Array.from(room.students.values()),
    chatHistory: room.chatHistory,
    whiteboardData: room.whiteboardData,
    tasks: refreshedTasks,
  })
}

function formatPollForBroadcast(pollState: PollState) {
  return {
    id: pollState.id,
    sessionId: pollState.sessionId,
    tutorId: pollState.tutorId,
    question: pollState.question,
    type: pollState.type,
    options: pollState.options,
    isAnonymous: pollState.isAnonymous,
    allowMultiple: pollState.allowMultiple,
    showResults: pollState.showResults,
    timeLimit: pollState.timeLimit,
    status: pollState.status,
    startedAt: pollState.startedAt ? new Date(pollState.startedAt).toISOString() : undefined,
    endedAt: pollState.endedAt ? new Date(pollState.endedAt).toISOString() : undefined,
    responses: pollState.responses.map(r => ({
      id: r.id,
      optionIds: r.optionIds,
      rating: r.rating,
      textAnswer: r.textAnswer,
      studentId: pollState.isAnonymous ? undefined : r.studentId,
      createdAt: new Date(r.createdAt).toISOString(),
    })),
    totalResponses: pollState.responses.length,
    createdAt: new Date().toISOString(),
  }
}

function endPoll(io: SocketIOServer, pollId: string) {
  const pollState = activePolls.get(pollId)
  if (!pollState || pollState.status === 'closed') return

  pollState.status = 'closed'
  pollState.endedAt = Date.now()

  if (pollState.timer) {
    clearTimeout(pollState.timer)
    pollState.timer = undefined
  }

  io.to(`poll:${pollState.sessionId}`).emit('poll:ended', formatPollForBroadcast(pollState))
}

function getPollOptionColor(index: number): string {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
  return colors[index % colors.length]
}

async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Export helper functions for external use
export function getRoomState(roomId: string): ClassRoom | undefined {
  return activeRooms.get(roomId)
}

export function getWhiteboardState(whiteboardId: string): WhiteboardState | undefined {
  return activeWhiteboards.get(whiteboardId)
}

export function isUserOnline(userId: string): boolean {
  return userSocketMap.has(userId)
}

export function getUserSocketId(userId: string): string | undefined {
  return userSocketMap.get(userId)
}

export function emitToUser(userId: string, event: string, data: unknown) {
  if (!ioRef || !userId) return
  // Emit to the user's room (every open tab), not just the latest socket, so a
  // tutor with the classroom in one tab and Insights in another both update.
  ioRef.to(`user:${userId}`).emit(event, data)
}

/**
 * Access the shared Socket.io server instance from API routes (e.g. to
 * broadcast to a session room). Returns null if the socket server hasn't
 * been initialized yet (e.g. during early startup).
 */
export function getIO(): SocketIOServer | null {
  return ioRef
}

/**
 * Internal hooks for deterministic unit tests.
 * Not used by runtime code.
 */
export const socketRateLimitTesting = {
  isRateLimited,
  reset() {
    connectionRateLimits.clear()
  },
  limits: RATE_LIMITS,
  presence: {
    set: setUserSocket,
    clearIfCurrent: clearUserSocketIfCurrent,
    get(userId: string) {
      return userSocketMap.get(userId)
    },
    reset() {
      userSocketMap.clear()
    },
  },
}
