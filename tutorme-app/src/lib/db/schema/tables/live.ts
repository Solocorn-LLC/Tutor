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
  uuid,
} from 'drizzle-orm/pg-core'
import * as enums from '../enums'
import { user } from './auth'
import { course, courseSchedule } from './course'

export const liveSession = pgTable(
  'LiveSession',
  {
    sessionId: text('id').primaryKey().notNull(),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    courseId: text('courseId').references(() => course.courseId, { onDelete: 'set null' }),
    // The CourseSchedule this session was materialized from (null for ad-hoc / 1:1).
    // Lets a session trace back to its schedule and makes re-publish idempotent.
    scheduleId: text('scheduleId').references(() => courseSchedule.scheduleId, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    category: text('category').notNull(),
    description: text('description'),
    scheduledAt: timestamp('scheduledAt', { withTimezone: true }),
    startedAt: timestamp('startedAt', { withTimezone: true }),
    endedAt: timestamp('endedAt', { withTimezone: true }),
    status: enums.liveSessionStatusEnum('status').notNull(),
    roomId: text('roomId'),
    roomUrl: text('roomUrl'),
    recordingUrl: text('recordingUrl'),
    recordingAvailableAt: timestamp('recordingAvailableAt', { withTimezone: true }),
    maxStudents: integer('maxStudents').notNull().default(50),
    durationMinutes: integer('durationMinutes').notNull().default(120),
  },
  table => ({
    LiveSession_tutorId_idx: index('LiveSession_tutorId_idx').on(table.tutorId),
    LiveSession_courseId_idx: index('LiveSession_courseId_idx').on(table.courseId),
    LiveSession_scheduleId_idx: index('LiveSession_scheduleId_idx').on(table.scheduleId),
    LiveSession_status_idx: index('LiveSession_status_idx').on(table.status),
    LiveSession_scheduledAt_idx: index('LiveSession_scheduledAt_idx').on(table.scheduledAt),
    LiveSession_roomId_idx: index('LiveSession_roomId_idx').on(table.roomId),
  })
)

export const sessionReplayArtifact = pgTable(
  'SessionReplayArtifact',
  {
    artifactId: text('id').primaryKey().notNull(),
    sessionId: text('sessionId')
      .notNull()
      .unique()
      .references(() => liveSession.sessionId, { onDelete: 'cascade' }),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    recordingUrl: text('recordingUrl'),
    transcript: text('transcript'),
    summary: text('summary'),
    summaryJson: jsonb('summaryJson').$type<Record<string, unknown>>(),
    status: text('status').notNull(),
    startedAt: timestamp('startedAt', { withTimezone: true }),
    endedAt: timestamp('endedAt', { withTimezone: true }),
    generatedAt: timestamp('generatedAt', { withTimezone: true }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    SessionReplayArtifact_tutorId_idx: index('SessionReplayArtifact_tutorId_idx').on(table.tutorId),
    SessionReplayArtifact_status_idx: index('SessionReplayArtifact_status_idx').on(table.status),
    SessionReplayArtifact_generatedAt_idx: index('SessionReplayArtifact_generatedAt_idx').on(
      table.generatedAt
    ),
  })
)

export const sessionParticipant = pgTable(
  'SessionParticipant',
  {
    participantId: text('id').primaryKey().notNull(),
    sessionId: text('sessionId')
      .notNull()
      .references(() => liveSession.sessionId, { onDelete: 'cascade' }),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    joinedAt: timestamp('joinedAt', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('leftAt', { withTimezone: true }),
  },
  table => ({
    SessionParticipant_studentId_idx: index('SessionParticipant_studentId_idx').on(table.studentId),
    SessionParticipant_sessionId_idx: index('SessionParticipant_sessionId_idx').on(table.sessionId),
    SessionParticipant_sessionId_studentId_key: uniqueIndex(
      'SessionParticipant_sessionId_studentId_key'
    ).on(table.sessionId, table.studentId),
  })
)

export const poll = pgTable(
  'Poll',
  {
    pollId: text('id').primaryKey().notNull(),
    sessionId: text('sessionId')
      .notNull()
      .references(() => liveSession.sessionId, { onDelete: 'cascade' }),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    type: enums.pollTypeEnum('type').notNull(),
    isAnonymous: boolean('isAnonymous').notNull(),
    allowMultiple: boolean('allowMultiple').notNull(),
    timeLimit: integer('timeLimit'),
    showResults: boolean('showResults').notNull(),
    correctOptionId: text('correctOptionId').references((): any => pollOption.optionId, {
      onDelete: 'set null',
    }),
    status: enums.pollStatusEnum('status').notNull(),
    startedAt: timestamp('startedAt', { withTimezone: true }),
    endedAt: timestamp('endedAt', { withTimezone: true }),
    totalResponses: integer('totalResponses').notNull().default(0),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    Poll_sessionId_idx: index('Poll_sessionId_idx').on(table.sessionId),
    Poll_tutorId_idx: index('Poll_tutorId_idx').on(table.tutorId),
    Poll_status_idx: index('Poll_status_idx').on(table.status),
    Poll_createdAt_idx: index('Poll_createdAt_idx').on(table.createdAt),
  })
)

export const deployedMaterial = pgTable(
  'DeployedMaterial',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    sessionId: text('sessionId')
      .notNull()
      .references(() => liveSession.sessionId, { onDelete: 'cascade' }),
    courseId: text('courseId')
      .notNull()
      .references(() => course.courseId, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'task', 'assessment', 'homework', 'asset', 'recording'
    itemId: text('itemId').notNull(), // ID of the specific item being deployed
    title: text('title').notNull(),
    content: jsonb('content').$type<Record<string, unknown>>(), // Snapshot of the item's content at deployment time
    sessionSequence: integer('sessionSequence').notNull(), // e.g. 1 for 's1', 2 for 's2'
    deployedAt: timestamp('deployedAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    DeployedMaterial_sessionId_idx: index('DeployedMaterial_sessionId_idx').on(table.sessionId),
    DeployedMaterial_courseId_idx: index('DeployedMaterial_courseId_idx').on(table.courseId),
    DeployedMaterial_type_idx: index('DeployedMaterial_type_idx').on(table.type),
    DeployedMaterial_deployedAt_idx: index('DeployedMaterial_deployedAt_idx').on(table.deployedAt),
    DeployedMaterial_sessionId_sessionSequence_idx: index(
      'DeployedMaterial_sessionId_sessionSequence_idx'
    ).on(table.sessionId, table.sessionSequence),
  })
)

export const pollOption = pgTable(
  'PollOption',
  {
    optionId: text('id').primaryKey().notNull(),
    pollId: text('pollId')
      .notNull()
      .references(() => poll.pollId, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    text: text('text').notNull(),
    color: text('color'),
    responseCount: integer('responseCount').notNull().default(0),
    percentage: doublePrecision('percentage').notNull().default(0),
  },
  table => ({
    PollOption_pollId_idx: index('PollOption_pollId_idx').on(table.pollId),
  })
)

export const pollResponse = pgTable(
  'PollResponse',
  {
    responseId: text('id').primaryKey().notNull(),
    pollId: text('pollId')
      .notNull()
      .references(() => poll.pollId, { onDelete: 'cascade' }),
    respondentHash: text('respondentHash'),
    optionIds: text('optionIds').array().notNull(),
    rating: integer('rating'),
    textAnswer: text('textAnswer'),
    studentId: text('studentId').references(() => user.userId, { onDelete: 'set null' }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    PollResponse_pollId_idx: index('PollResponse_pollId_idx').on(table.pollId),
    PollResponse_studentId_idx: index('PollResponse_studentId_idx').on(table.studentId),
    PollResponse_createdAt_idx: index('PollResponse_createdAt_idx').on(table.createdAt),
    PollResponse_pollId_respondentHash_key: uniqueIndex(
      'PollResponse_pollId_respondentHash_key'
    ).on(table.pollId, table.respondentHash),
  })
)

export const trainingAttendance = pgTable(
  'TrainingAttendance',
  {
    id: text('id').primaryKey().notNull(),
    sessionId: text('sessionId')
      .notNull()
      .references(() => liveSession.sessionId, { onDelete: 'cascade' }),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    attendedAt: timestamp('attendedAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    TrainingAttendance_sessionId_idx: index('TrainingAttendance_sessionId_idx').on(table.sessionId),
    TrainingAttendance_tutorId_idx: index('TrainingAttendance_tutorId_idx').on(table.tutorId),
    TrainingAttendance_sessionId_tutorId_key: uniqueIndex(
      'TrainingAttendance_sessionId_tutorId_key'
    ).on(table.sessionId, table.tutorId),
  })
)

export const message = pgTable(
  'Message',
  {
    messageId: text('id').primaryKey().notNull(),
    sessionId: text('sessionId')
      .notNull()
      .references(() => liveSession.sessionId, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    type: text('type').notNull(),
    source: enums.messageSourceEnum('source').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    Message_sessionId_idx: index('Message_sessionId_idx').on(table.sessionId),
    Message_userId_idx: index('Message_userId_idx').on(table.userId),
    Message_sessionId_timestamp_idx: index('Message_sessionId_timestamp_idx').on(
      table.sessionId,
      table.timestamp
    ),
  })
)

export const conversation = pgTable(
  'Conversation',
  {
    conversationId: text('id').primaryKey().notNull(),
    participant1Id: text('participant1Id')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    participant2Id: text('participant2Id')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => ({
    Conversation_participant1Id_idx: index('Conversation_participant1Id_idx').on(
      table.participant1Id
    ),
    Conversation_participant2Id_idx: index('Conversation_participant2Id_idx').on(
      table.participant2Id
    ),
    Conversation_updatedAt_idx: index('Conversation_updatedAt_idx').on(table.updatedAt),
    Conversation_participant1Id_participant2Id_key: uniqueIndex(
      'Conversation_participant1Id_participant2Id_key'
    ).on(table.participant1Id, table.participant2Id),
  })
)

export const directMessage = pgTable(
  'DirectMessage',
  {
    directMessageId: text('id').primaryKey().notNull(),
    conversationId: text('conversationId')
      .notNull()
      .references(() => conversation.conversationId, { onDelete: 'cascade' }),
    senderId: text('senderId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    type: text('type').notNull(),
    attachmentUrl: text('attachmentUrl'),
    read: boolean('read').notNull().default(false),
    readAt: timestamp('readAt', { withTimezone: true }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    DirectMessage_conversationId_idx: index('DirectMessage_conversationId_idx').on(
      table.conversationId
    ),
    DirectMessage_senderId_idx: index('DirectMessage_senderId_idx').on(table.senderId),
    DirectMessage_createdAt_idx: index('DirectMessage_createdAt_idx').on(table.createdAt),
    DirectMessage_conversationId_createdAt_idx: index(
      'DirectMessage_conversationId_createdAt_idx'
    ).on(table.conversationId, table.createdAt),
  })
)

export const mention = pgTable(
  'Mention',
  {
    mentionId: uuid('mentionId').primaryKey().notNull().defaultRandom(),
    messageId: text('messageId')
      .notNull()
      .references(() => message.messageId, { onDelete: 'cascade' }),
    mentionerId: text('mentionerId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    mentioneeId: text('mentioneeId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    Mention_messageId_idx: index('Mention_messageId_idx').on(table.messageId),
    Mention_mentionerId_idx: index('Mention_mentionerId_idx').on(table.mentionerId),
    Mention_mentioneeId_idx: index('Mention_mentioneeId_idx').on(table.mentioneeId),
  })
)

export const tutorFollow = pgTable(
  'TutorFollow',
  {
    followId: uuid('followId').primaryKey().notNull().defaultRandom(),
    followerId: text('followerId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    TutorFollow_followerId_idx: index('TutorFollow_followerId_idx').on(table.followerId),
    TutorFollow_tutorId_idx: index('TutorFollow_tutorId_idx').on(table.tutorId),
    TutorFollow_follower_tutor_key: uniqueIndex('TutorFollow_follower_tutor_key').on(
      table.followerId,
      table.tutorId
    ),
  })
)

export const notification = pgTable(
  'Notification',
  {
    notificationId: text('id').primaryKey().notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>(),
    read: boolean('read').notNull(),
    readAt: timestamp('readAt', { withTimezone: true }),
    actionUrl: text('actionUrl'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    Notification_userId_idx: index('Notification_userId_idx').on(table.userId),
    Notification_read_idx: index('Notification_read_idx').on(table.read),
    Notification_createdAt_idx: index('Notification_createdAt_idx').on(table.createdAt),
    Notification_type_idx: index('Notification_type_idx').on(table.type),
    idx_notification_user_read_created: index('idx_notification_user_read_created').on(
      table.userId,
      table.read,
      table.createdAt
    ),
    idx_notification_user_type_created: index('idx_notification_user_type_created').on(
      table.userId,
      table.type,
      table.createdAt
    ),
  })
)

export const notificationPreference = pgTable('NotificationPreference', {
  preferenceId: text('id').primaryKey().notNull(),
  userId: text('userId')
    .notNull()
    .unique()
    .references(() => user.userId, { onDelete: 'cascade' }),
  emailEnabled: boolean('emailEnabled').notNull(),
  pushEnabled: boolean('pushEnabled').notNull(),
  inAppEnabled: boolean('inAppEnabled').notNull(),
  channelOverrides: jsonb('channelOverrides').notNull().$type<Record<string, unknown>>(),
  quietHoursStart: text('quietHoursStart'),
  quietHoursEnd: text('quietHoursEnd'),
  timezone: text('timezone').notNull(),
  emailDigest: text('emailDigest').notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
