/**
 * Drizzle table definitions (domain slice).
 * Aggregated via ./index.ts — keep enums in ../enums.ts.
 */
import { pgTable, text, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import * as enums from '../enums'
import { user } from './auth'
import { course, courseLesson } from './course'
import { liveSession } from './live'

// ============================================
// BUILDER TASK FAMILY - secondary content model (read-only from the app)
// ============================================
// The Course Builder UI's active content model is `courseLesson.builderData`
// (JSON blob holding lessons/tasks/assessments/quizzes) — see CourseBuilder.tsx.
// This BuilderTask/BuilderTaskExtension/...Version/TaskPoll/TaskQuestion/TaskDeployment
// family is a separate, normalized model with no in-app write path; it's populated
// externally and read by `student/feedback/tasks/route.ts` and the live-session
// replay-artifact generator. Do not assume it's unused, and don't duplicate
// `courseLesson.builderData` data into it without a dedicated migration plan.
export const builderTask = pgTable(
  'BuilderTask',
  {
    taskId: text('id').primaryKey().notNull(),
    courseId: text('courseId')
      .notNull()
      .references(() => course.courseId, { onDelete: 'cascade' }),
    lessonId: text('lessonId')
      .notNull()
      .references(() => courseLesson.lessonId, { onDelete: 'cascade' }),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    content: text('content').notNull(), // Content tab content
    pci: text('pci').notNull(), // PCI tab content (instructions)
    // Structured PCI spec (TASK-6): the normalized PciSpec object finalized in
    // the builder, persisted at deploy so the live tutor can apply it. Nullable
    // — only present once the tutor finalizes a structured spec. Tutor-only
    // evaluation layer; never broadcast to students.
    pciSpec: jsonb('pciSpec'),
    details: text('details'), // Additional details
    type: enums.builderTaskTypeEnum('type').notNull().default('task'),
    status: enums.builderTaskStatusEnum('status').notNull().default('draft'),
    order: integer('order').notNull().default(0), // For ordering within lesson
    metadata: jsonb('metadata'), // Additional flexible metadata
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    publishedAt: timestamp('publishedAt', { withTimezone: true }),
    deletedAt: timestamp('deletedAt', { withTimezone: true }),
  },
  table => ({
    BuilderTask_courseId_idx: index('BuilderTask_courseId_idx').on(table.courseId),
    BuilderTask_deletedAt_idx: index('BuilderTask_deletedAt_idx').on(table.deletedAt),
    BuilderTask_lessonId_idx: index('BuilderTask_lessonId_idx').on(table.lessonId),
    BuilderTask_tutorId_idx: index('BuilderTask_tutorId_idx').on(table.tutorId),
    BuilderTask_type_idx: index('BuilderTask_type_idx').on(table.type),
    BuilderTask_status_idx: index('BuilderTask_status_idx').on(table.status),
    BuilderTask_courseId_lessonId_idx: index('BuilderTask_courseId_lessonId_idx').on(
      table.courseId,
      table.lessonId
    ),
  })
)

export const builderTaskExtension = pgTable(
  'BuilderTaskExtension',
  {
    extensionId: text('id').primaryKey().notNull(),
    taskId: text('taskId')
      .notNull()
      .references(() => builderTask.taskId, { onDelete: 'cascade' }),
    name: text('name').notNull(), // Extension 1, Extension 2, etc.
    content: text('content').notNull(), // Extension content
    pci: text('pci').notNull(), // Extension PCI
    order: integer('order').notNull().default(0), // Serial order
    isActive: boolean('isActive').notNull().default(false), // Currently selected
    metadata: jsonb('metadata'), // Additional metadata
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    BuilderTaskExtension_taskId_idx: index('BuilderTaskExtension_taskId_idx').on(table.taskId),
    BuilderTaskExtension_taskId_order_idx: index('BuilderTaskExtension_taskId_order_idx').on(
      table.taskId,
      table.order
    ),
  })
)

export const builderTaskFile = pgTable(
  'BuilderTaskFile',
  {
    fileId: text('id').primaryKey().notNull(),
    taskId: text('taskId')
      .notNull()
      .references(() => builderTask.taskId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    mimeType: text('mimeType'),
    size: integer('size'),
    extractedText: text('extractedText'), // OCR/extracted text content
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    BuilderTaskFile_taskId_idx: index('BuilderTaskFile_taskId_idx').on(table.taskId),
  })
)

export const builderTaskVersion = pgTable(
  'BuilderTaskVersion',
  {
    versionId: text('id').primaryKey().notNull(),
    taskId: text('taskId')
      .notNull()
      .references(() => builderTask.taskId, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    content: text('content').notNull(),
    pci: text('pci').notNull(),
    changeDescription: text('changeDescription'),
    createdBy: text('createdBy')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    BuilderTaskVersion_taskId_idx: index('BuilderTaskVersion_taskId_idx').on(table.taskId),
    BuilderTaskVersion_taskId_version_idx: index('BuilderTaskVersion_taskId_version_idx').on(
      table.taskId,
      table.version
    ),
  })
)

export const builderTaskDmi = pgTable(
  'BuilderTaskDmi',
  {
    // NOTE: the prod column is literally "dmiId" (see migration 0020), NOT the
    // usual "id". Mapping it to text('id') was a latent drift bug: every
    // INSERT/upsert drizzle generated referenced a non-existent "id" column and
    // threw `column "id" does not exist`, so nothing ever persisted here (answer
    // keys on deploy, materialized DMI, etc. all silently failed). Keep this
    // aligned with the actual column name.
    dmiId: text('dmiId').primaryKey().notNull(),
    taskId: text('taskId')
      .notNull()
      .references(() => builderTask.taskId, { onDelete: 'cascade' }),
    type: text('type').notNull().default('assessment'),
    items: jsonb('items').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    BuilderTaskDmi_taskId_idx: index('BuilderTaskDmi_taskId_idx').on(table.taskId),
    BuilderTaskDmi_taskId_type_idx: index('BuilderTaskDmi_taskId_type_idx').on(
      table.taskId,
      table.type
    ),
  })
)

export const builderTaskDmiVersion = pgTable(
  'BuilderTaskDmiVersion',
  {
    // Same drift as BuilderTaskDmi above — the prod column is "versionId", not
    // "id" (migration 0020). Map it correctly so inserts don't throw.
    versionId: text('versionId').primaryKey().notNull(),
    taskId: text('taskId')
      .notNull()
      .references(() => builderTask.taskId, { onDelete: 'cascade' }),
    type: text('type').notNull().default('assessment'),
    versionNumber: integer('versionNumber').notNull(),
    items: jsonb('items').notNull(),
    createdBy: text('createdBy')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    BuilderTaskDmiVersion_taskId_idx: index('BuilderTaskDmiVersion_taskId_idx').on(table.taskId),
    BuilderTaskDmiVersion_taskId_version_idx: index('BuilderTaskDmiVersion_taskId_version_idx').on(
      table.taskId,
      table.versionNumber
    ),
  })
)

// ============================================
// TASK FEEDBACK TABLES - For Polls and Questions
// ============================================

export const taskPoll = pgTable(
  'TaskPoll',
  {
    pollId: text('id').primaryKey().notNull(),
    taskId: text('taskId')
      .notNull()
      .references(() => builderTask.taskId, { onDelete: 'cascade' }),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    sessionId: text('sessionId')
      .notNull()
      .references(() => liveSession.sessionId, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    options: jsonb('options').notNull().$type<number[]>(), // [1, 2, 3, 4, 5]
    responses: jsonb('responses').notNull().default({}).$type<Record<string, number>>(), // studentId -> option
    isActive: boolean('isActive').notNull().default(true),
    sentAt: timestamp('sentAt', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closedAt', { withTimezone: true }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    TaskPoll_taskId_idx: index('TaskPoll_taskId_idx').on(table.taskId),
    TaskPoll_sessionId_idx: index('TaskPoll_sessionId_idx').on(table.sessionId),
    TaskPoll_tutorId_idx: index('TaskPoll_tutorId_idx').on(table.tutorId),
    TaskPoll_isActive_idx: index('TaskPoll_isActive_idx').on(table.isActive),
  })
)

export const taskQuestion = pgTable(
  'TaskQuestion',
  {
    questionId: text('id').primaryKey().notNull(),
    taskId: text('taskId')
      .notNull()
      .references(() => builderTask.taskId, { onDelete: 'cascade' }),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    sessionId: text('sessionId')
      .notNull()
      .references(() => liveSession.sessionId, { onDelete: 'cascade' }), // Live session this question belongs to
    question: text('question').notNull(),
    answers: jsonb('answers')
      .notNull()
      .default({})
      .$type<Record<string, { answer: string; answeredAt: string }>>(),
    sentAt: timestamp('sentAt', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    TaskQuestion_taskId_idx: index('TaskQuestion_taskId_idx').on(table.taskId),
    TaskQuestion_sessionId_idx: index('TaskQuestion_sessionId_idx').on(table.sessionId),
    TaskQuestion_tutorId_idx: index('TaskQuestion_tutorId_idx').on(table.tutorId),
  })
)

export const taskDeployment = pgTable(
  'TaskDeployment',
  {
    deploymentId: text('id').primaryKey().notNull(),
    taskId: text('taskId')
      .notNull()
      .references(() => builderTask.taskId, { onDelete: 'cascade' }),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    sessionId: text('sessionId')
      .notNull()
      .references(() => liveSession.sessionId, { onDelete: 'cascade' }),
    studentIds: jsonb('studentIds').notNull().$type<string[]>(), // Target students
    deployedAt: timestamp('deployedAt', { withTimezone: true }).notNull().defaultNow(),
    status: enums.taskDeploymentStatusEnum('status').notNull().default('active'),
    closedAt: timestamp('closedAt', { withTimezone: true }),
  },
  table => ({
    TaskDeployment_taskId_idx: index('TaskDeployment_taskId_idx').on(table.taskId),
    TaskDeployment_sessionId_idx: index('TaskDeployment_sessionId_idx').on(table.sessionId),
    TaskDeployment_tutorId_idx: index('TaskDeployment_tutorId_idx').on(table.tutorId),
    TaskDeployment_status_idx: index('TaskDeployment_status_idx').on(table.status),
  })
)

// ============================================
// TUTOR ASSETS TABLE - For Course Builder Assets
// ============================================

export const tutorAsset = pgTable(
  'TutorAsset',
  {
    assetId: text('id').primaryKey().notNull(),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    content: text('content'), // Extracted text content
    url: text('url'), // File URL if stored externally
    fileKey: text('fileKey'), // Persistent GCS object key for URL refresh
    mimeType: text('mimeType'), // File MIME type
    size: integer('size'), // File size in bytes
    metadata: jsonb('metadata'), // Additional flexible metadata
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    TutorAsset_tutorId_idx: index('TutorAsset_tutorId_idx').on(table.tutorId),
    TutorAsset_tutorId_createdAt_idx: index('TutorAsset_tutorId_createdAt_idx').on(
      table.tutorId,
      table.createdAt
    ),
  })
)
