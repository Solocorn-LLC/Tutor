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
import { builderTask } from './builder'

// ============================================
// COURSE TABLES
// ============================================

export const course = pgTable(
  'Course',
  {
    courseId: text('id').primaryKey().notNull(),
    name: text('name').notNull(),
    description: text('description'),
    categories: text('categories').array(),
    isPublished: boolean('isPublished').notNull().default(false),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    creatorId: text('creatorId').references(() => user.userId, { onDelete: 'set null' }),
    isLiveOnline: boolean('isLiveOnline').notNull().default(false),
    languageOfInstruction: text('languageOfInstruction'),
    price: doublePrecision('price'),
    currency: text('currency'),
    isFree: boolean('isFree').notNull().default(false),
    schedule: jsonb('schedule'),
    deletedAt: timestamp('deletedAt', { withTimezone: true }),
  },
  table => ({
    Course_isPublished_idx: index('Course_isPublished_idx').on(table.isPublished),
    Course_creatorId_idx: index('Course_creatorId_idx').on(table.creatorId),
    Course_isPublished_creatorId_idx: index('Course_isPublished_creatorId_idx').on(
      table.isPublished,
      table.creatorId
    ),
    Course_deletedAt_idx: index('Course_deletedAt_idx').on(table.deletedAt),
  })
)

export const courseShare = pgTable(
  'CourseShare',
  {
    shareId: text('id').primaryKey().notNull(),
    courseId: text('courseId')
      .notNull()
      .references(() => course.courseId, { onDelete: 'cascade' }),
    sharedByTutorId: text('sharedByTutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    recipientId: text('recipientId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    isPublic: boolean('isPublic').notNull(),
    sharedAt: timestamp('sharedAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    CourseShare_sharedByTutorId_idx: index('CourseShare_sharedByTutorId_idx').on(
      table.sharedByTutorId
    ),
    CourseShare_recipientId_idx: index('CourseShare_recipientId_idx').on(table.recipientId),
    CourseShare_courseId_idx: index('CourseShare_courseId_idx').on(table.courseId),
    CourseShare_courseId_recipientId_key: uniqueIndex('CourseShare_courseId_recipientId_key').on(
      table.courseId,
      table.recipientId
    ),
  })
)

export const courseLesson = pgTable(
  'CourseLesson',
  {
    lessonId: text('id').primaryKey().notNull(),
    courseId: text('courseId')
      .notNull()
      .references(() => course.courseId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    duration: integer('duration').notNull().default(60),
    order: integer('order').notNull(),
    // Builder data contains all lesson content (tasks, assessments, homework, media, etc.)
    builderData: jsonb('builderData').default({}),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deletedAt', { withTimezone: true }),
  },
  table => ({
    CourseLesson_courseId_idx: index('CourseLesson_courseId_idx').on(table.courseId),
    CourseLesson_order_idx: index('CourseLesson_order_idx').on(table.order),
  })
)

export const lessonSession = pgTable(
  'LessonSession',
  {
    sessionId: text('id').primaryKey().notNull(),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    lessonId: text('lessonId')
      .notNull()
      .references(() => courseLesson.lessonId, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    currentSection: text('currentSection').notNull(),
    conceptMastery: jsonb('conceptMastery').notNull(),
    misconceptions: text('misconceptions').array().notNull(),
    sessionContext: jsonb('sessionContext'),
    whiteboardItems: text('whiteboardItems').array().notNull(),
    startedAt: timestamp('startedAt', { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp('lastActivityAt', { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    completedAt: timestamp('completedAt', { withTimezone: true }),
  },
  table => ({
    LessonSession_studentId_idx: index('LessonSession_studentId_idx').on(table.studentId),
    LessonSession_lessonId_idx: index('LessonSession_lessonId_idx').on(table.lessonId),
    LessonSession_studentId_lessonId_key: uniqueIndex('LessonSession_studentId_lessonId_key').on(
      table.studentId,
      table.lessonId
    ),
  })
)

export const courseLessonProgress = pgTable(
  'CourseLessonProgress',
  {
    progressId: text('id').primaryKey().notNull(),
    lessonId: text('lessonId')
      .notNull()
      .references(() => courseLesson.lessonId, { onDelete: 'cascade' }),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    currentSection: text('currentSection').notNull(),
    score: integer('score'),
    completedAt: timestamp('completedAt', { withTimezone: true }),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    CourseLessonProgress_studentId_idx: index('CourseLessonProgress_studentId_idx').on(
      table.studentId
    ),
    CourseLessonProgress_lessonId_idx: index('CourseLessonProgress_lessonId_idx').on(
      table.lessonId
    ),
    CourseLessonProgress_lessonId_studentId_key: uniqueIndex(
      'CourseLessonProgress_lessonId_studentId_key'
    ).on(table.lessonId, table.studentId),
  })
)

export const courseEnrollment = pgTable(
  'CourseEnrollment',
  {
    enrollmentId: text('id').primaryKey().notNull(),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    courseId: text('courseId')
      .notNull()
      .references(() => course.courseId, { onDelete: 'cascade' }),
    enrolledAt: timestamp('enrolledAt', { withTimezone: true }).notNull().defaultNow(),
    startDate: timestamp('startDate', { withTimezone: true }),
    completedAt: timestamp('completedAt', { withTimezone: true }),
    lastActivity: timestamp('lastActivity', { withTimezone: true }).notNull().defaultNow(),
    lessonsCompleted: integer('lessonsCompleted').notNull().default(0),
    enrollmentSource: text('enrollmentSource'),
  },
  table => ({
    CourseEnrollment_studentId_idx: index('CourseEnrollment_studentId_idx').on(table.studentId),
    CourseEnrollment_courseId_idx: index('CourseEnrollment_courseId_idx').on(table.courseId),
    CourseEnrollment_studentId_courseId_key: uniqueIndex(
      'CourseEnrollment_studentId_courseId_key'
    ).on(table.studentId, table.courseId),
  })
)

export const courseProgress = pgTable(
  'CourseProgress',
  {
    progressId: text('id').primaryKey().notNull(),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    courseId: text('courseId')
      .notNull()
      .references(() => course.courseId, { onDelete: 'cascade' }),
    lessonsCompleted: integer('lessonsCompleted').notNull().default(0),
    totalLessons: integer('totalLessons').notNull().default(0),
    currentLessonId: text('currentLessonId').references(() => courseLesson.lessonId, {
      onDelete: 'set null',
    }),
    averageScore: doublePrecision('averageScore'),
    isCompleted: boolean('isCompleted').notNull().default(false),
    startedAt: timestamp('startedAt', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completedAt', { withTimezone: true }),
  },
  table => ({
    CourseProgress_studentId_idx: index('CourseProgress_studentId_idx').on(table.studentId),
    CourseProgress_studentId_courseId_key: uniqueIndex('CourseProgress_studentId_courseId_key').on(
      table.studentId,
      table.courseId
    ),
  })
)

export const studentPerformance = pgTable(
  'StudentPerformance',
  {
    performanceId: text('id').primaryKey().notNull(),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    courseId: text('courseId').references(() => course.courseId, { onDelete: 'set null' }),
    averageScore: doublePrecision('averageScore').notNull(),
    completionRate: doublePrecision('completionRate').notNull(),
    engagementScore: doublePrecision('engagementScore').notNull(),
    attendanceRate: doublePrecision('attendanceRate').notNull(),
    participationRate: doublePrecision('participationRate').notNull(),
    strengths: jsonb('strengths').notNull(),
    weaknesses: jsonb('weaknesses').notNull(),
    taskHistory: jsonb('taskHistory').notNull(),
    commonMistakes: jsonb('commonMistakes').notNull(),
    skillBreakdown: jsonb('skillBreakdown').notNull(),
    cluster: text('cluster').notNull(),
    learningStyle: text('learningStyle'),
    pace: text('pace').notNull(),
    recommendedPeers: jsonb('recommendedPeers').notNull(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    StudentPerformance_studentId_idx: index('StudentPerformance_studentId_idx').on(table.studentId),
    StudentPerformance_courseId_idx: index('StudentPerformance_courseId_idx').on(table.courseId),
    StudentPerformance_cluster_idx: index('StudentPerformance_cluster_idx').on(table.cluster),
    StudentPerformance_studentId_courseId_key: uniqueIndex(
      'StudentPerformance_studentId_courseId_key'
    ).on(table.studentId, table.courseId),
  })
)

export const taskSubmission = pgTable(
  'TaskSubmission',
  {
    submissionId: text('id').primaryKey().notNull(),
    taskId: text('taskId')
      .notNull()
      .references(() => builderTask.taskId, { onDelete: 'cascade' }),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    answers: jsonb('answers').notNull(),
    timeSpent: integer('timeSpent').notNull(),
    attempts: integer('attempts').notNull(),
    questionResults: jsonb('questionResults'),
    score: doublePrecision('score'),
    maxScore: integer('maxScore').notNull(),
    status: text('status').notNull(),
    aiFeedback: jsonb('aiFeedback'),
    tutorFeedback: text('tutorFeedback'),
    tutorApproved: boolean('tutorApproved').notNull(),
    submittedAt: timestamp('submittedAt', { withTimezone: true }).notNull().defaultNow(),
    gradedAt: timestamp('gradedAt', { withTimezone: true }),
  },
  table => ({
    TaskSubmission_studentId_idx: index('TaskSubmission_studentId_idx').on(table.studentId),
    TaskSubmission_taskId_idx: index('TaskSubmission_taskId_idx').on(table.taskId),
    TaskSubmission_taskId_studentId_key: uniqueIndex('TaskSubmission_taskId_studentId_key').on(
      table.taskId,
      table.studentId
    ),
  })
)

export const feedbackWorkflow = pgTable(
  'FeedbackWorkflow',
  {
    workflowId: text('id').primaryKey().notNull(),
    submissionId: text('submissionId')
      .notNull()
      .unique()
      .references(() => taskSubmission.submissionId, { onDelete: 'cascade' }),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    aiScore: doublePrecision('aiScore'),
    aiComments: text('aiComments'),
    aiStrengths: jsonb('aiStrengths').notNull(),
    aiImprovements: jsonb('aiImprovements').notNull(),
    aiResources: jsonb('aiResources').notNull(),
    status: enums.feedbackStatusEnum('status').notNull(),
    modifiedScore: doublePrecision('modifiedScore'),
    modifiedComments: text('modifiedComments'),
    addedNotes: text('addedNotes'),
    approvedAt: timestamp('approvedAt', { withTimezone: true }),
    approvedBy: text('approvedBy').references(() => user.userId, { onDelete: 'set null' }),
    autoApproved: boolean('autoApproved').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    FeedbackWorkflow_studentId_idx: index('FeedbackWorkflow_studentId_idx').on(table.studentId),
    FeedbackWorkflow_status_idx: index('FeedbackWorkflow_status_idx').on(table.status),
  })
)

// Tracks published course variants generated from a template course.
// A tutor selects nationalities and categories on the course details page;
// publishing creates one published course per (category × nationality) combination.
export const courseVariant = pgTable(
  'CourseVariant',
  {
    variantId: text('id').primaryKey().notNull(),
    templateCourseId: text('templateCourseId')
      .notNull()
      .references(() => course.courseId, { onDelete: 'cascade' }),
    publishedCourseId: text('publishedCourseId')
      .notNull()
      .references(() => course.courseId, { onDelete: 'cascade' }),
    nationality: text('nationality').notNull(),
    category: text('category').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    CourseVariant_templateCourseId_idx: index('CourseVariant_templateCourseId_idx').on(
      table.templateCourseId
    ),
    CourseVariant_publishedCourseId_idx: index('CourseVariant_publishedCourseId_idx').on(
      table.publishedCourseId
    ),
  })
)
