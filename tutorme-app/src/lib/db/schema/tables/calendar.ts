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

export const calendarConnection = pgTable(
  'CalendarConnection',
  {
    connectionId: text('id').primaryKey().notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId'),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    expiresAt: timestamp('expiresAt', { withTimezone: true }),
    syncEnabled: boolean('syncEnabled').notNull(),
    syncDirection: text('syncDirection').notNull(),
    lastSyncedAt: timestamp('lastSyncedAt', { withTimezone: true }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    CalendarConnection_userId_idx: index('CalendarConnection_userId_idx').on(table.userId),
    CalendarConnection_provider_idx: index('CalendarConnection_provider_idx').on(table.provider),
    CalendarConnection_userId_provider_key: uniqueIndex(
      'CalendarConnection_userId_provider_key'
    ).on(table.userId, table.provider),
  })
)

export const calendarEvent = pgTable(
  'CalendarEvent',
  {
    eventId: text('id').primaryKey().notNull(),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    type: enums.eventTypeEnum('type').notNull(),
    status: enums.eventStatusEnum('status').notNull(),
    startTime: timestamp('startTime', { withTimezone: true }).notNull(),
    endTime: timestamp('endTime', { withTimezone: true }).notNull(),
    timezone: text('timezone').notNull(),
    isAllDay: boolean('isAllDay').notNull(),
    recurrenceRule: text('recurrenceRule'),
    recurringEventId: text('recurringEventId'),
    isRecurring: boolean('isRecurring').notNull(),
    location: text('location'),
    meetingUrl: text('meetingUrl'),
    isVirtual: boolean('isVirtual').notNull(),
    courseId: text('courseId').references(() => course.courseId, { onDelete: 'set null' }),
    studentId: text('studentId').references(() => user.userId, { onDelete: 'set null' }),
    attendees: jsonb('attendees'),
    maxAttendees: integer('maxAttendees').notNull(),
    reminders: jsonb('reminders'),
    color: text('color'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    createdBy: text('createdBy')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    externalId: text('externalId'),
    deletedAt: timestamp('deletedAt', { withTimezone: true }),
    isCancelled: boolean('isCancelled').notNull(),
  },
  table => ({
    CalendarEvent_tutorId_idx: index('CalendarEvent_tutorId_idx').on(table.tutorId),
    CalendarEvent_startTime_idx: index('CalendarEvent_startTime_idx').on(table.startTime),
    CalendarEvent_endTime_idx: index('CalendarEvent_endTime_idx').on(table.endTime),
    CalendarEvent_status_idx: index('CalendarEvent_status_idx').on(table.status),
    CalendarEvent_type_idx: index('CalendarEvent_type_idx').on(table.type),
    CalendarEvent_recurringEventId_idx: index('CalendarEvent_recurringEventId_idx').on(
      table.recurringEventId
    ),
    CalendarEvent_tutorId_startTime_endTime_idx: index(
      'CalendarEvent_tutorId_startTime_endTime_idx'
    ).on(table.tutorId, table.startTime, table.endTime),
    CalendarEvent_courseId_idx: index('CalendarEvent_courseId_idx').on(table.courseId),
  })
)

export const calendarAvailability = pgTable(
  'CalendarAvailability',
  {
    availabilityId: text('id').primaryKey().notNull(),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    dayOfWeek: integer('dayOfWeek').notNull(),
    startTime: text('startTime').notNull(),
    endTime: text('endTime').notNull(),
    timezone: text('timezone').notNull(),
    isAvailable: boolean('isAvailable').notNull(),
    validFrom: timestamp('validFrom', { withTimezone: true }),
    validUntil: timestamp('validUntil', { withTimezone: true }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    CalendarAvailability_tutorId_idx: index('CalendarAvailability_tutorId_idx').on(table.tutorId),
    CalendarAvailability_dayOfWeek_idx: index('CalendarAvailability_dayOfWeek_idx').on(
      table.dayOfWeek
    ),
    CalendarAvailability_tutorId_dayOfWeek_startTime_endTime_key: uniqueIndex(
      'CalendarAvailability_tutorId_dayOfWeek_startTime_endTime_key'
    ).on(table.tutorId, table.dayOfWeek, table.startTime, table.endTime),
  })
)

export const calendarException = pgTable(
  'CalendarException',
  {
    exceptionId: text('id').primaryKey().notNull(),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    date: timestamp('date', { withTimezone: true }).notNull(),
    isAvailable: boolean('isAvailable').notNull(),
    startTime: text('startTime'),
    endTime: text('endTime'),
    reason: text('reason'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    CalendarException_tutorId_idx: index('CalendarException_tutorId_idx').on(table.tutorId),
    CalendarException_date_idx: index('CalendarException_date_idx').on(table.date),
    CalendarException_tutorId_date_startTime_key: uniqueIndex(
      'CalendarException_tutorId_date_startTime_key'
    ).on(table.tutorId, table.date, table.startTime),
  })
)

// Student weekly availability (mirror of CalendarAvailability, keyed by student)
export const studentAvailability = pgTable(
  'StudentAvailability',
  {
    availabilityId: text('id').primaryKey().notNull(),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    dayOfWeek: integer('dayOfWeek').notNull(),
    startTime: text('startTime').notNull(),
    endTime: text('endTime').notNull(),
    timezone: text('timezone').notNull(),
    isAvailable: boolean('isAvailable').notNull(),
    validFrom: timestamp('validFrom', { withTimezone: true }),
    validUntil: timestamp('validUntil', { withTimezone: true }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    StudentAvailability_studentId_idx: index('StudentAvailability_studentId_idx').on(
      table.studentId
    ),
    StudentAvailability_studentId_dayOfWeek_startTime_endTime_key: uniqueIndex(
      'StudentAvailability_studentId_dayOfWeek_startTime_endTime_key'
    ).on(table.studentId, table.dayOfWeek, table.startTime, table.endTime),
  })
)

// Student date-specific availability exceptions (mirror of CalendarException)
export const studentAvailabilityException = pgTable(
  'StudentAvailabilityException',
  {
    exceptionId: text('id').primaryKey().notNull(),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    date: timestamp('date', { withTimezone: true }).notNull(),
    isAvailable: boolean('isAvailable').notNull(),
    startTime: text('startTime'),
    endTime: text('endTime'),
    reason: text('reason'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    StudentAvailabilityException_studentId_idx: index(
      'StudentAvailabilityException_studentId_idx'
    ).on(table.studentId),
    StudentAvailabilityException_studentId_date_startTime_key: uniqueIndex(
      'StudentAvailabilityException_studentId_date_startTime_key'
    ).on(table.studentId, table.date, table.startTime),
  })
)

// One-on-one booking requests
export const oneOnOneBookingRequest = pgTable(
  'OneOnOneBookingRequest',
  {
    requestId: text('id').primaryKey().notNull(),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    requestedDate: timestamp('requestedDate', { withTimezone: true }).notNull(),
    startTime: text('startTime').notNull(),
    endTime: text('endTime').notNull(),
    timezone: text('timezone').notNull(),
    durationMinutes: integer('durationMinutes').notNull().default(60),
    costPerSession: doublePrecision('costPerSession').notNull(),
    status: enums.bookingRequestStatusEnum('status').notNull().default('PENDING'),
    tutorResponseAt: timestamp('tutorResponseAt', { withTimezone: true }),
    tutorNotes: text('tutorNotes'),
    // The student's note to the tutor when requesting ("why I want this session").
    studentNotes: text('studentNotes'),
    // Optional course the student wants this session to be about (a published
    // course of the tutor). Nullable; helps the tutor prepare + deploy material.
    courseId: text('courseId').references(() => course.courseId, { onDelete: 'set null' }),
    // Recurring bookings: N weekly sessions requested together share one seriesId
    // (null = a standalone single session). seriesIndex is the 0-based week offset.
    seriesId: text('seriesId'),
    seriesIndex: integer('seriesIndex'),
    paymentDueAt: timestamp('paymentDueAt', { withTimezone: true }),
    paidAt: timestamp('paidAt', { withTimezone: true }),
    calendarEventId: text('calendarEventId').references(() => calendarEvent.eventId, {
      onDelete: 'set null',
    }),
    // Pending reschedule proposal (one party proposes a new time; the other
    // accepts to move the session, or declines to keep it). Cleared once
    // resolved. `rescheduleProposedBy` is the proposer's userId.
    rescheduleProposedDate: timestamp('rescheduleProposedDate', { withTimezone: true }),
    rescheduleProposedStart: text('rescheduleProposedStart'),
    rescheduleProposedEnd: text('rescheduleProposedEnd'),
    rescheduleProposedBy: text('rescheduleProposedBy'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    OneOnOneBookingRequest_tutorId_idx: index('OneOnOneBookingRequest_tutorId_idx').on(
      table.tutorId
    ),
    OneOnOneBookingRequest_studentId_idx: index('OneOnOneBookingRequest_studentId_idx').on(
      table.studentId
    ),
    OneOnOneBookingRequest_status_idx: index('OneOnOneBookingRequest_status_idx').on(table.status),
    OneOnOneBookingRequest_tutorId_studentId_status_idx: index(
      'OneOnOneBookingRequest_tutorId_studentId_status_idx'
    ).on(table.tutorId, table.studentId, table.status),
    OneOnOneBookingRequest_seriesId_idx: index('OneOnOneBookingRequest_seriesId_idx').on(
      table.seriesId
    ),
    // A CalendarEvent belongs to exactly one booking (accept/heal always mints a
    // fresh event and repoints this column at it). Enforce that 1:1 so reads that
    // join on it can't fan out. NULLs are allowed to repeat (unpaid/legacy rows).
    OneOnOneBookingRequest_calendarEventId_key: uniqueIndex(
      'OneOnOneBookingRequest_calendarEventId_key'
    ).on(table.calendarEventId),
  })
)

/**
 * A student's review of a completed 1-on-1 session — one per booking. Drives the
 * tutor's average rating shown on their public profile.
 */
export const oneOnOneReview = pgTable(
  'OneOnOneReview',
  {
    reviewId: text('id').primaryKey().notNull(),
    requestId: text('requestId')
      .notNull()
      .references(() => oneOnOneBookingRequest.requestId, { onDelete: 'cascade' }),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(), // 1–5
    comment: text('comment'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    // One review per booking (a student can edit theirs, not create duplicates).
    OneOnOneReview_requestId_key: uniqueIndex('OneOnOneReview_requestId_key').on(table.requestId),
    OneOnOneReview_tutorId_idx: index('OneOnOneReview_tutorId_idx').on(table.tutorId),
  })
)

/**
 * A student waiting for a 1-on-1 opening with a tutor who has no bookable slots.
 * When a confirmed booking is cancelled, everyone on that tutor's waitlist is
 * notified that a slot may have opened.
 */
export const oneOnOneWaitlist = pgTable(
  'OneOnOneWaitlist',
  {
    waitlistId: text('id').primaryKey().notNull(),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    note: text('note'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    OneOnOneWaitlist_tutor_student_key: uniqueIndex('OneOnOneWaitlist_tutor_student_key').on(
      table.tutorId,
      table.studentId
    ),
    OneOnOneWaitlist_tutorId_idx: index('OneOnOneWaitlist_tutorId_idx').on(table.tutorId),
    OneOnOneWaitlist_studentId_idx: index('OneOnOneWaitlist_studentId_idx').on(table.studentId),
  })
)

/**
 * A tutor-hosted group 1-on-1: an open session at a set time with a fixed seat
 * capacity and a per-seat price. Multiple students each book (and pay for) their
 * own seat; the session is shared. Times follow the same absolute-UTC convention
 * as OneOnOneBookingRequest (requestedDate = midnight-UTC calendar date; the
 * wall-clock startTime/endTime are interpreted in `timezone`).
 */
export const groupSession = pgTable(
  'GroupSession',
  {
    groupSessionId: text('id').primaryKey().notNull(),
    tutorId: text('tutorId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    // Optional course this session is built around — lets the tutor deploy that
    // course's structure/tasks in the live room. Nullable (ad-hoc sessions have
    // none); the course may be published or still a draft.
    courseId: text('courseId').references(() => course.courseId, { onDelete: 'set null' }),
    requestedDate: timestamp('requestedDate', { withTimezone: true }).notNull(),
    startTime: text('startTime').notNull(),
    endTime: text('endTime').notNull(),
    timezone: text('timezone').notNull(),
    durationMinutes: integer('durationMinutes').notNull().default(60),
    capacity: integer('capacity').notNull(),
    pricePerSeat: doublePrecision('pricePerSeat').notNull(),
    currency: text('currency').notNull().default('USD'),
    // OPEN | FULL | CANCELLED | COMPLETED (plain text — no new enum migration).
    status: text('status').notNull().default('OPEN'),
    calendarEventId: text('calendarEventId').references(() => calendarEvent.eventId, {
      onDelete: 'set null',
    }),
    liveSessionId: text('liveSessionId'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    GroupSession_tutorId_idx: index('GroupSession_tutorId_idx').on(table.tutorId),
    GroupSession_status_idx: index('GroupSession_status_idx').on(table.status),
    GroupSession_requestedDate_idx: index('GroupSession_requestedDate_idx').on(table.requestedDate),
    // A CalendarEvent belongs to exactly one group session — same 1:1 invariant
    // as the 1-on-1 booking above. NULLs may repeat.
    GroupSession_calendarEventId_key: uniqueIndex('GroupSession_calendarEventId_key').on(
      table.calendarEventId
    ),
  })
)

/**
 * One seat in a GroupSession. A seat is RESERVED when a student claims it and
 * flips to PAID once their per-seat payment clears (a webhook then also inserts a
 * SessionParticipant so they can enter the room). CANCELLED seats free capacity.
 */
export const groupSessionParticipant = pgTable(
  'GroupSessionParticipant',
  {
    participantId: text('id').primaryKey().notNull(),
    groupSessionId: text('groupSessionId')
      .notNull()
      .references(() => groupSession.groupSessionId, { onDelete: 'cascade' }),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    // RESERVED | PAID | CANCELLED
    status: text('status').notNull().default('RESERVED'),
    paymentId: text('paymentId'),
    reservedAt: timestamp('reservedAt', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paidAt', { withTimezone: true }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    // A student can hold at most one seat per group session.
    GroupSessionParticipant_session_student_key: uniqueIndex(
      'GroupSessionParticipant_session_student_key'
    ).on(table.groupSessionId, table.studentId),
    GroupSessionParticipant_groupSessionId_idx: index(
      'GroupSessionParticipant_groupSessionId_idx'
    ).on(table.groupSessionId),
    GroupSessionParticipant_studentId_idx: index('GroupSessionParticipant_studentId_idx').on(
      table.studentId
    ),
  })
)
