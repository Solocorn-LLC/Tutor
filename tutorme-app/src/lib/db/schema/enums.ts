/**
 * Drizzle enums aligned with the current Postgres schema.
 */
import { pgEnum } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('Role', ['STUDENT', 'TUTOR', 'PARENT', 'ADMIN'])
export type Role = (typeof roleEnum.enumValues)[number]

export const pollTypeEnum = pgEnum('PollType', [
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'RATING',
  'SHORT_ANSWER',
  'WORD_CLOUD',
])
export type PollType = (typeof pollTypeEnum.enumValues)[number]

export const pollStatusEnum = pgEnum('PollStatus', ['DRAFT', 'ACTIVE', 'CLOSED'])
export type PollStatus = (typeof pollStatusEnum.enumValues)[number]

export const messageSourceEnum = pgEnum('MessageSource', ['AI', 'TUTOR', 'STUDENT'])
export type MessageSource = (typeof messageSourceEnum.enumValues)[number]

export const tierEnum = pgEnum('Tier', ['FREE', 'PRO', 'ELITE'])
export type Tier = (typeof tierEnum.enumValues)[number]

export const paymentStatusEnum = pgEnum('PaymentStatus', [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'REFUNDED',
  'CANCELLED',
])
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number]

export const paymentGatewayEnum = pgEnum('PaymentGateway', ['AIRWALLEX', 'HITPAY'])
export type PaymentGateway = (typeof paymentGatewayEnum.enumValues)[number]

export const refundStatusEnum = pgEnum('RefundStatus', [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
])
export type RefundStatus = (typeof refundStatusEnum.enumValues)[number]

export const eventTypeEnum = pgEnum('EventType', [
  'LESSON',
  'CLINIC',
  'CONSULTATION',
  'BREAK',
  'PERSONAL',
  'OTHER',
])
export type EventType = (typeof eventTypeEnum.enumValues)[number]

export const eventStatusEnum = pgEnum('EventStatus', ['CONFIRMED', 'TENTATIVE', 'CANCELLED'])
export type EventStatus = (typeof eventStatusEnum.enumValues)[number]

export const preferenceStatusEnum = pgEnum('PreferenceStatus', ['PENDING', 'MATCHED', 'REJECTED'])
export type PreferenceStatus = (typeof preferenceStatusEnum.enumValues)[number]

export const preferenceSlotTypeEnum = pgEnum('PreferenceSlotType', ['SELECTED', 'INTERSECTION'])
export type PreferenceSlotType = (typeof preferenceSlotTypeEnum.enumValues)[number]

export const bookingRequestStatusEnum = pgEnum('BookingRequestStatus', [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'PAID',
  'CANCELLED',
  // A paid session whose scheduled time has passed (marked by the completion
  // sweep). Distinguishes a finished session from an upcoming confirmed one.
  'COMPLETED',
])
export type BookingRequestStatus = (typeof bookingRequestStatusEnum.enumValues)[number]

export const builderTaskTypeEnum = pgEnum('BuilderTaskType', ['task', 'assessment', 'homework'])
export type BuilderTaskType = (typeof builderTaskTypeEnum.enumValues)[number]

export const builderTaskStatusEnum = pgEnum('BuilderTaskStatus', ['draft', 'published', 'archived'])
export type BuilderTaskStatus = (typeof builderTaskStatusEnum.enumValues)[number]

export const taskDeploymentStatusEnum = pgEnum('TaskDeploymentStatus', ['active', 'closed'])
export type TaskDeploymentStatus = (typeof taskDeploymentStatusEnum.enumValues)[number]

export const liveSessionStatusEnum = pgEnum('LiveSessionStatus', [
  'scheduled',
  'active',
  'ended',
  'preparing',
  'live',
  'paused',
])
export type LiveSessionStatus = (typeof liveSessionStatusEnum.enumValues)[number]

export const payoutStatusEnum = pgEnum('PayoutStatus', [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'REJECTED',
])
export type PayoutStatus = (typeof payoutStatusEnum.enumValues)[number]

export const feedbackStatusEnum = pgEnum('feedback_status', [
  'ai_generated',
  'tutor_modified',
  'approved',
  'sent_to_student',
  'rejected',
])
export type FeedbackStatus = (typeof feedbackStatusEnum.enumValues)[number]
