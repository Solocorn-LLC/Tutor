/**
 * Drizzle table definitions (domain slice).
 * Aggregated via ./index.ts — keep enums in ../enums.ts.
 */
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  doublePrecision,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import * as enums from '../enums'
import { user } from './auth'
import { course } from './course'
import { builderTask } from './builder'
import { liveSession } from './live'

// Per-call LLM token consumption, optionally attributed to a student + course.
// Used (among other things) to compute the token-cost deduction when a student
// unregisters from a paid course.
export const llmTokenUsage = pgTable(
  'LlmTokenUsage',
  {
    usageId: text('id').primaryKey().notNull(),
    studentId: text('studentId').references(() => user.userId, { onDelete: 'set null' }),
    courseId: text('courseId').references(() => course.courseId, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    model: text('model'),
    promptTokens: integer('promptTokens').notNull().default(0),
    completionTokens: integer('completionTokens').notNull().default(0),
    totalTokens: integer('totalTokens').notNull().default(0),
    costUsd: doublePrecision('costUsd').notNull().default(0),
    feature: text('feature'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    LlmTokenUsage_studentId_idx: index('LlmTokenUsage_studentId_idx').on(table.studentId),
    LlmTokenUsage_courseId_idx: index('LlmTokenUsage_courseId_idx').on(table.courseId),
    LlmTokenUsage_student_course_idx: index('LlmTokenUsage_student_course_idx').on(
      table.studentId,
      table.courseId
    ),
  })
)

export const performanceMetric = pgTable(
  'PerformanceMetric',
  {
    metricId: text('id').primaryKey().notNull(),
    name: text('name').notNull(),
    metricValue: doublePrecision('metric_value').notNull(),
    unit: text('unit').notNull(),
    tags: jsonb('tags'),
    userId: text('userId').references(() => user.userId, { onDelete: 'set null' }),
    sessionId: text('sessionId').references(() => liveSession.sessionId, { onDelete: 'set null' }),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    PerformanceMetric_name_idx: index('PerformanceMetric_name_idx').on(table.name),
    PerformanceMetric_timestamp_idx: index('PerformanceMetric_timestamp_idx').on(table.timestamp),
    PerformanceMetric_userId_idx: index('PerformanceMetric_userId_idx').on(table.userId),
  })
)

export const performanceAlert = pgTable(
  'PerformanceAlert',
  {
    alertId: text('id').primaryKey().notNull(),
    type: text('type').notNull(),
    severity: text('severity').notNull(),
    message: text('message').notNull(),
    metric: text('metric'),
    threshold: doublePrecision('threshold'),
    currentValue: doublePrecision('currentValue'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
    resolved: boolean('resolved').notNull(),
    resolvedAt: timestamp('resolvedAt', { withTimezone: true }),
  },
  table => ({
    PerformanceAlert_type_idx: index('PerformanceAlert_type_idx').on(table.type),
    PerformanceAlert_severity_idx: index('PerformanceAlert_severity_idx').on(table.severity),
    PerformanceAlert_resolved_idx: index('PerformanceAlert_resolved_idx').on(table.resolved),
    PerformanceAlert_timestamp_idx: index('PerformanceAlert_timestamp_idx').on(table.timestamp),
  })
)

// Session engagement & insights (optional feature tables)

export const engagementSnapshot = pgTable(
  'EngagementSnapshot',
  {
    snapshotId: text('id').primaryKey().notNull(),
    sessionId: text('sessionId')
      .notNull()
      .references(() => liveSession.sessionId, { onDelete: 'cascade' }),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    engagementScore: doublePrecision('engagementScore').notNull(),
    attentionLevel: text('attentionLevel').notNull(),
    comprehensionEstimate: doublePrecision('comprehensionEstimate'),
    participationCount: integer('participationCount').notNull(),
    chatMessages: integer('chatMessages').notNull(),
    whiteboardInteractions: integer('whiteboardInteractions').notNull(),
    struggleIndicators: integer('struggleIndicators').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    EngagementSnapshot_sessionId_idx: index('EngagementSnapshot_sessionId_idx').on(table.sessionId),
    EngagementSnapshot_studentId_idx: index('EngagementSnapshot_studentId_idx').on(table.studentId),
  })
)

export const sessionEngagementSummary = pgTable('SessionEngagementSummary', {
  summarySessionId: text('id')
    .primaryKey()
    .notNull()
    .references(() => liveSession.sessionId, { onDelete: 'cascade' }),
  averageEngagement: doublePrecision('averageEngagement'),
  peakEngagement: doublePrecision('peakEngagement'),
  lowEngagement: doublePrecision('lowEngagement'),
  participationRate: doublePrecision('participationRate'),
  totalChatMessages: integer('totalChatMessages'),
  totalHandRaises: integer('totalHandRaises'),
  timeOnTaskPercentage: doublePrecision('timeOnTaskPercentage'),
})

export const postSessionReport = pgTable(
  'PostSessionReport',
  {
    reportId: text('id').primaryKey().notNull(),
    sessionId: text('sessionId')
      .notNull()
      .references(() => liveSession.sessionId, { onDelete: 'cascade' }),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    keyConcepts: jsonb('keyConcepts').notNull(),
    mainTopics: jsonb('mainTopics').notNull(),
    studentQuestions: jsonb('studentQuestions').notNull(),
    challengingConcepts: jsonb('challengingConcepts').notNull(),
    overallAssessment: text('overallAssessment').notNull(),
    averageEngagement: doublePrecision('averageEngagement').notNull(),
    peakEngagement: doublePrecision('peakEngagement').notNull(),
    lowEngagement: doublePrecision('lowEngagement').notNull(),
    participationRate: doublePrecision('participationRate').notNull(),
    chatActivity: integer('chatActivity').notNull(),
    handRaises: integer('handRaises').notNull(),
    timeOnTask: doublePrecision('timeOnTask').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    PostSessionReport_sessionId_idx: index('PostSessionReport_sessionId_idx').on(table.sessionId),
  })
)

export const studentSessionInsight = pgTable(
  'StudentSessionInsight',
  {
    insightId: text('id').primaryKey().notNull(),
    sessionId: text('sessionId')
      .notNull()
      .references(() => liveSession.sessionId, { onDelete: 'cascade' }),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    engagement: doublePrecision('engagement').notNull(),
    participation: integer('participation').notNull(),
    questionsAsked: integer('questionsAsked').notNull(),
    timeAwayMinutes: integer('timeAwayMinutes').notNull(),
    flaggedForFollowUp: boolean('flaggedForFollowUp').notNull(),
    followUpReason: text('followUpReason'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    StudentSessionInsight_sessionId_idx: index('StudentSessionInsight_sessionId_idx').on(
      table.sessionId
    ),
  })
)

export const sessionBookmark = pgTable(
  'SessionBookmark',
  {
    bookmarkId: text('id').primaryKey().notNull(),
    sessionId: text('sessionId')
      .notNull()
      .references(() => liveSession.sessionId, { onDelete: 'cascade' }),
    timestampSeconds: integer('timestampSeconds').notNull(),
    label: text('label'),
    note: text('note'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    SessionBookmark_sessionId_idx: index('SessionBookmark_sessionId_idx').on(table.sessionId),
  })
)

export const resource = pgTable(
  'Resource',
  {
    resourceId: text('id').primaryKey().notNull(),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    type: text('type').notNull(),
    size: integer('size').notNull(),
    mimeType: text('mimeType'),
    url: text('url').notNull(),
    key: text('key').notNull(),
    tags: text('tags').array().notNull(),
    isPublic: boolean('isPublic').notNull(),
    downloadCount: integer('downloadCount').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    Resource_tutorId_idx: index('Resource_tutorId_idx').on(table.tutorId),
    Resource_type_idx: index('Resource_type_idx').on(table.type),
    Resource_tags_idx: index('Resource_tags_idx').on(table.tags),
    Resource_isPublic_idx: index('Resource_isPublic_idx').on(table.isPublic),
  })
)

export const resourceShare = pgTable(
  'ResourceShare',
  {
    shareId: text('id').primaryKey().notNull(),
    resourceId: text('resourceId')
      .notNull()
      .references(() => resource.resourceId, { onDelete: 'cascade' }),
    sharedByTutorId: text('sharedByTutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    recipientId: text('recipientId').references(() => user.userId, { onDelete: 'set null' }),
    courseId: text('courseId').references(() => course.courseId, { onDelete: 'set null' }),
    sharedWithAll: boolean('sharedWithAll').notNull(),
    message: text('message'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    ResourceShare_resourceId_idx: index('ResourceShare_resourceId_idx').on(table.resourceId),
    ResourceShare_recipientId_idx: index('ResourceShare_recipientId_idx').on(table.recipientId),
    ResourceShare_sharedByTutorId_idx: index('ResourceShare_sharedByTutorId_idx').on(
      table.sharedByTutorId
    ),
    ResourceShare_resourceId_recipientId_key: uniqueIndex(
      'ResourceShare_resourceId_recipientId_key'
    ).on(table.resourceId, table.recipientId),
    ResourceShare_resourceId_sharedWithAll_idx: index(
      'ResourceShare_resourceId_sharedWithAll_idx'
    ).on(table.resourceId, table.sharedWithAll),
  })
)

export const libraryTask = pgTable(
  'LibraryTask',
  {
    libraryTaskId: text('id').primaryKey().notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    type: text('type').notNull(),
    options: jsonb('options'),
    correctAnswer: text('correctAnswer'),
    explanation: text('explanation'),
    difficulty: text('difficulty').notNull(),
    subject: text('subject').notNull(),
    topics: jsonb('topics').notNull(),
    isFavorite: boolean('isFavorite').notNull(),
    usageCount: integer('usageCount').notNull(),
    lastUsedAt: timestamp('lastUsedAt', { withTimezone: true }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    LibraryTask_userId_idx: index('LibraryTask_userId_idx').on(table.userId),
    LibraryTask_isFavorite_idx: index('LibraryTask_isFavorite_idx').on(table.isFavorite),
  })
)

export const studentTaskReport = pgTable('StudentTaskReport', {
  reportId: text('id').primaryKey().notNull(),
  studentId: text('studentId')
    .notNull()
    .references(() => user.userId, { onDelete: 'cascade' }),
  tutorId: text('tutorId')
    .notNull()
    .references(() => user.userId, { onDelete: 'cascade' }),
  courseId: text('courseId').references(() => course.courseId, { onDelete: 'set null' }),
  taskId: text('taskId').references(() => builderTask.taskId, { onDelete: 'set null' }),
  type: text('type').notNull(), // 'task', 'assessment', 'master'
  title: text('title').notNull(),
  status: text('status').notNull().default('requested'), // 'requested', 'draft', 'sent'
  strengths: jsonb('strengths'), // array of strings
  weaknesses: jsonb('weaknesses'), // array of strings
  overallComments: text('overallComments'),
  score: doublePrecision('score'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sentAt', { withTimezone: true }),
})
