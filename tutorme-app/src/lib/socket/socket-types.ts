/**
 * Shared types and interfaces for the socket server.
 */

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
  /** Option indices [0..n-1]; a vote's `value` is the chosen index. Length = the
   *  number of options. */
  options: number[]
  /** Display labels per option index (e.g. ['True','False'], ['Yes','No'], or
   *  custom). Absent ⇒ render A/B/C/… by index (back-compat). */
  optionLabels?: string[]
  status: 'open' | 'closed'
  responses: LiveTaskPollResponse[]
  createdAt: number
}

export interface LiveTaskQuestion {
  id: string
  taskId: string
  prompt: string
  /** A closed question accepts no more answers (mirrors LiveTaskPoll.status). */
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
  questionType?: import('../assessment/question-types').DmiQuestionType
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

/**
 * When students may see the correct answers for a deployed task/assessment:
 * - 'instant'        — graded live as they answer (answers sent to the browser).
 * - 'after_submit'   — correct answers revealed only on the results screen.
 * - 'hidden'         — never reveal answers; show the score only.
 * - 'student_choice' — post-class self-study: the student picks practice (see
 *                      answers as they go) or test (hide until submit).
 * Chosen by the tutor at deploy time.
 */
export type AnswerReveal = 'instant' | 'after_submit' | 'hidden' | 'student_choice'

export interface LiveTask {
  id: string
  title: string
  content: string
  description?: string
  instructions?: string
  source: 'task' | 'assessment' | 'homework'
  dmiItems?: LiveTaskDmiItem[]
  /** Per-question answer key + accepted variants + marks. Sent tutor→server on
   *  deploy ONLY for server-side auto-grading; NEVER broadcast to students. */
  answerKey?: Array<{
    id: string
    answer?: string
    /** Other answer forms that earn full credit (from the marking scheme). */
    acceptableVariants?: string[]
    marks?: number
  }>
  /** Tutor's answer-reveal policy for this deploy (default 'instant'). */
  answerReveal?: AnswerReveal
  /** Tutor's task PCI (free-text) + finalized structured spec (TASK-6). Sent
   *  tutor→server on deploy ONLY so the live tutor + grader can apply them;
   *  NEVER broadcast to students — hidden evaluation layer, like answerKey. */
  pci?: string
  pciSpec?: import('@/lib/assessment/pci-spec').PciSpec
  /** The lesson this task/assessment was deployed from, so the server can tag the
   *  persisted BuilderTask + DeployedMaterial with the real lesson (not "Lesson
   *  1"). Sent tutor→server on deploy. */
  lessonId?: string
  deployedAt: number
  polls: LiveTaskPoll[]
  questions: LiveTaskQuestion[]
  sourceDocument?: LiveTaskSourceDocument
  parentId?: string
  isExtension?: boolean
  completedBy?: string[]
}

export interface TaskChatMessagePayload {
  taskId: string
  role: 'tutor' | 'student'
  content: string
  name?: string
  re?: string
  timestamp?: number
  userId?: string
}

export interface ClassRoom {
  id: string
  tutorId: string
  students: Map<string, StudentState>
  whiteboardData?: unknown[]
  chatHistory: ChatMessage[]
  tasks?: LiveTask[]
  polls?: any[]
  codeEditorContent?: string
  codeLanguage?: string
  lastActivity?: number
  createdAt: Date
}

// Direct messaging
export interface DirectMessageRoom {
  conversationId: string
  participant1Id: string
  participant2Id: string
  typingUsers: Set<string>
  lastActivity: number
}

// PDF / live doc
export interface PdfCollabRoomState {
  roomId: string
  locked: boolean
  ownerId?: string
  lastActivity: number
  participants: Map<
    string,
    { userId?: string; name: string; role: 'student' | 'tutor'; joinedAt: number }
  >
  events: Array<{
    page: number
    action: 'created' | 'modified' | 'removed' | 'sync-request'
    object?: Record<string, unknown>
    objectId?: string
    actorId?: string
    sentAt: number
  }>
}

export interface LiveDocumentShare {
  shareId: string
  classRoomId: string
  ownerId: string
  ownerName: string
  assignedStudentId?: string
  templateShareId?: string
  title: string
  description?: string
  fileUrl: string
  mimeType?: string
  pdfRoomId: string
  visibleToAll: boolean
  allowCollaborativeWrite: boolean
  collaborationPolicy?: {
    allowDrawing: boolean
    allowTyping: boolean
    allowShapes: boolean
  }
  active: boolean
  submissions?: Array<{ userId: string; userName: string; submittedAt: number }>
  updatedAt: number
}

// Whiteboard
export interface WhiteboardStroke {
  id: string
  points: Array<{ x: number; y: number; pressure?: number }>
  color: string
  width: number
  type: 'pen' | 'eraser' | 'pencil' | 'marker' | 'highlighter' | 'calligraphy' | 'shape' | 'text'
  userId: string
  opacity?: number
  shapeType?: 'line' | 'arrow' | 'rectangle' | 'circle' | 'triangle' | 'connector'
  text?: string
  fontSize?: number
  fontFamily?: string
  textStyle?: { bold?: boolean; italic?: boolean; align?: 'left' | 'center' | 'right' }
  layerId?: 'tutor-broadcast' | 'tutor-private' | 'student-personal' | 'shared-group'
  groupId?: string
  zIndex?: number
  locked?: boolean
  rotation?: number
  createdAt?: number
  updatedAt?: number
  sourceStrokeId?: string
  targetStrokeId?: string
  sourcePort?: 'top' | 'right' | 'bottom' | 'left' | 'center'
  targetPort?: 'top' | 'right' | 'bottom' | 'left' | 'center'
}

export interface WhiteboardStrokeOp {
  kind: 'upsert' | 'delete'
  stroke?: WhiteboardStroke
  strokeId?: string
  opId?: string
  sentAt?: number
  baseVersion?: number
}

export interface WhiteboardSelectionPresence {
  userId: string
  name: string
  role: 'tutor' | 'student'
  strokeIds: string[]
  pageId?: string
  color: string
  updatedAt: number
}

export interface WhiteboardShape {
  id: string
  type: 'rectangle' | 'circle' | 'line' | 'triangle'
  x: number
  y: number
  width: number
  height: number
  color: string
  lineWidth: number
  userId: string
}

export interface WhiteboardText {
  id: string
  text: string
  x: number
  y: number
  color: string
  fontSize: number
  userId: string
}

export interface WhiteboardState {
  whiteboardId: string
  roomId: string
  strokes: WhiteboardStroke[]
  shapes: WhiteboardShape[]
  texts: WhiteboardText[]
  cursors: Map<string, { x: number; y: number; color: string; name: string }>
  activeUsers: Set<string>
  backgroundColor: string
  backgroundStyle: string
}

export interface WhiteboardOpMetricsState {
  key: string
  roomId: string
  boardScope: 'tutor' | 'student'
  studentId?: string
  lastActivity: number
  receivedOps: number
  appliedOps: number
  conflictDrops: number
  duplicateDrops: number
  malformedDrops: number
  queueDepth: number
  maxQueueDepth: number
  replayRequests: number
  recentAppliedTimestamps: number[]
}

export interface WhiteboardOpObservabilitySnapshot {
  key: string
  roomId: string
  boardScope: 'tutor' | 'student'
  studentId?: string
  lastActivity: number
  receivedOps: number
  appliedOps: number
  conflictDrops: number
  duplicateDrops: number
  malformedDrops: number
  queueDepth: number
  maxQueueDepth: number
  replayRequests: number
  opsPerSecond: number
  activeStrokeCount: number
  deadLetterDepth: number
}

export interface LiveClassModerationState {
  mutedStudents: Set<string>
  studentStrokeWindowLimit: number
  strokeWindowMs: number
  strokeCounters: Map<string, { count: number; startedAt: number }>
  lockedLayers: Set<string>
  assignmentOverlay:
    | 'none'
    | 'graph-paper'
    | 'geometry-grid'
    | 'coordinate-plane'
    | 'chemistry-structure'
  spotlight: {
    enabled: boolean
    x: number
    y: number
    width: number
    height: number
    mode: 'rectangle' | 'pen'
  }
}

export interface LiveClassSnapshot {
  id: string
  createdAt: number
  roomId: string
  createdBy: string
  strokes: WhiteboardStroke[]
}

// Math whiteboard – use yjs Doc type so Y.encodeStateAsUpdate(doc) type-checks
export type YDoc = import('yjs').Doc

export interface MathWhiteboardRoomState {
  roomId: string
  sessionId: string
  locked: boolean
  ownerId?: string
  lastActivity: number
  currentPage: number
  participants: Map<
    string,
    {
      userId?: string
      name: string
      role: 'student' | 'tutor'
      color: string
      cursor?: { x: number; y: number }
      joinedAt: number
    }
  >
  elements: Map<
    string,
    Record<string, unknown> & {
      id: string
      type: string
      version: number
      lastModified: number
      modifiedBy: string
    }
  >
  pages: Array<{ index: number; backgroundType: string; elementIds: string[] }>
  tldrawSnapshot?: Record<string, unknown> | null
  yDoc: YDoc
}

export interface MathSyncMetricsState {
  sessionId: string
  roomId: string
  lastActivity: number
  joins: number
  leaves: number
  syncRequests: number
  yjsUpdates: number
  yjsBytes: number
  snapshotBroadcasts: number
  lockToggles: number
  recentUpdateTimestamps: number[]
}

export interface MathSyncObservabilitySnapshot {
  sessionId: string
  roomId: string
  lastActivity: number
  locked: boolean
  participants: number
  joins: number
  leaves: number
  syncRequests: number
  yjsUpdates: number
  yjsBytes: number
  snapshotBroadcasts: number
  lockToggles: number
  updatesPerMinute: number
  averageYjsUpdateBytes: number
}

// Polls
export interface PollState {
  id: string
  sessionId: string
  tutorId: string
  question: string
  type: 'multiple_choice' | 'true_false' | 'rating' | 'short_answer' | 'word_cloud'
  options: {
    id: string
    label: string
    text: string
    color?: string
  }[]
  isAnonymous: boolean
  allowMultiple: boolean
  showResults: boolean
  timeLimit?: number
  status: 'draft' | 'active' | 'closed'
  startedAt?: number
  endedAt?: number
  responses: {
    id: string
    respondentHash?: string
    optionIds?: string[]
    rating?: number
    textAnswer?: string
    studentId?: string
    createdAt: number
  }[]
  timer?: NodeJS.Timeout
}
