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
import { course, courseLesson } from './course'

export const contentItem = pgTable(
  'ContentItem',
  {
    contentId: text('id').primaryKey().notNull(),
    title: text('title').notNull(),
    description: text('description'),
    subject: text('subject').notNull(),
    type: text('type').notNull(),
    url: text('url'),
    thumbnailUrl: text('thumbnailUrl'),
    duration: integer('duration'),
    difficulty: text('difficulty').notNull(),
    isPublished: boolean('isPublished').notNull(),
    transcript: text('transcript'),
    videoVariants: jsonb('videoVariants'),
    uploadStatus: text('uploadStatus'),
    lessonId: text('lessonId').references(() => courseLesson.lessonId, { onDelete: 'set null' }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    ContentItem_subject_idx: index('ContentItem_subject_idx').on(table.subject),
    ContentItem_isPublished_idx: index('ContentItem_isPublished_idx').on(table.isPublished),
    ContentItem_lessonId_idx: index('ContentItem_lessonId_idx').on(table.lessonId),
  })
)

export const videoWatchEvent = pgTable(
  'VideoWatchEvent',
  {
    eventId: text('id').primaryKey().notNull(),
    contentId: text('contentId')
      .notNull()
      .references(() => contentItem.contentId, { onDelete: 'cascade' }),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    eventType: text('eventType').notNull(),
    videoSeconds: doublePrecision('videoSeconds').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata'),
  },
  table => ({
    VideoWatchEvent_contentId_idx: index('VideoWatchEvent_contentId_idx').on(table.contentId),
    VideoWatchEvent_studentId_idx: index('VideoWatchEvent_studentId_idx').on(table.studentId),
    VideoWatchEvent_contentId_studentId_idx: index('VideoWatchEvent_contentId_studentId_idx').on(
      table.contentId,
      table.studentId
    ),
  })
)

export const contentQuizCheckpoint = pgTable(
  'ContentQuizCheckpoint',
  {
    checkpointId: text('id').primaryKey().notNull(),
    contentId: text('contentId')
      .notNull()
      .references(() => contentItem.contentId, { onDelete: 'cascade' }),
    videoTimestampSec: integer('videoTimestampSec').notNull(),
    title: text('title'),
    questions: jsonb('questions').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    ContentQuizCheckpoint_contentId_idx: index('ContentQuizCheckpoint_contentId_idx').on(
      table.contentId
    ),
    ContentQuizCheckpoint_contentId_videoTimestampSec_key: uniqueIndex(
      'ContentQuizCheckpoint_contentId_videoTimestampSec_key'
    ).on(table.contentId, table.videoTimestampSec),
  })
)

export const contentProgress = pgTable(
  'ContentProgress',
  {
    progressId: text('id').primaryKey().notNull(),
    contentId: text('contentId')
      .notNull()
      .references(() => contentItem.contentId, { onDelete: 'cascade' }),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    progress: integer('progress').notNull(),
    completed: boolean('completed').notNull(),
    lastPosition: integer('lastPosition'),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    ContentProgress_studentId_idx: index('ContentProgress_studentId_idx').on(table.studentId),
    ContentProgress_contentId_studentId_key: uniqueIndex(
      'ContentProgress_contentId_studentId_key'
    ).on(table.contentId, table.studentId),
  })
)

export const reviewSchedule = pgTable(
  'ReviewSchedule',
  {
    scheduleId: text('id').primaryKey().notNull(),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    contentId: text('contentId')
      .notNull()
      .references(() => contentItem.contentId, { onDelete: 'cascade' }),
    lastReviewed: timestamp('lastReviewed', { withTimezone: true }).notNull().defaultNow(),
    nextReview: timestamp('nextReview', { withTimezone: true }).notNull(),
    interval: integer('interval').notNull(),
    easeFactor: doublePrecision('easeFactor').notNull(),
    stability: doublePrecision('stability').notNull(),
    repetitionCount: integer('repetitionCount').notNull(),
    performance: doublePrecision('performance').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    ReviewSchedule_studentId_idx: index('ReviewSchedule_studentId_idx').on(table.studentId),
    ReviewSchedule_nextReview_idx: index('ReviewSchedule_nextReview_idx').on(table.nextReview),
    ReviewSchedule_studentId_contentId_key: uniqueIndex(
      'ReviewSchedule_studentId_contentId_key'
    ).on(table.studentId, table.contentId),
  })
)

export const note = pgTable(
  'Note',
  {
    noteId: text('id').primaryKey().notNull(),
    contentId: text('contentId')
      .notNull()
      .references(() => contentItem.contentId, { onDelete: 'cascade' }),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    timestamp: integer('timestamp').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    Note_contentId_idx: index('Note_contentId_idx').on(table.contentId),
    Note_studentId_idx: index('Note_studentId_idx').on(table.studentId),
  })
)

export const bookmark = pgTable(
  'Bookmark',
  {
    bookmarkId: text('id').primaryKey().notNull(),
    contentId: text('contentId')
      .notNull()
      .references(() => contentItem.contentId, { onDelete: 'cascade' }),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    Bookmark_studentId_idx: index('Bookmark_studentId_idx').on(table.studentId),
    Bookmark_contentId_studentId_key: uniqueIndex('Bookmark_contentId_studentId_key').on(
      table.contentId,
      table.studentId
    ),
  })
)
