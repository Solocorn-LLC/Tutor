import { relations } from 'drizzle-orm'
import {
  user,
  profile,
  tutorApplication,
  adminSession,
  adminAssignment,
  adminRole,
  course,
  courseEnrollment,
  courseLesson,
  courseLessonProgress,
  courseProgress,
  studentPerformance,
  courseShare,
  liveSession,
  sessionParticipant,
  payout,
  taskSubmission,
  feedbackWorkflow,
  familyAccount,
  familyMember,
  familyPayment,
  familyNotification,
  parentActivityLog,
  payment,
  paymentOnPayout,
  conversation,
  directMessage,
  message,
  mention,
  tutorFollow,
  lessonLearningSession,
  // AI Tutor tables removed - feature deleted
  userActivityLog,
  builderTask,
  builderTaskExtension,
  builderTaskFile,
  builderTaskDmi,
  builderTaskDmiVersion,
  builderTaskVersion,
  oneOnOneBookingRequest,
  calendarEvent,
  courseVariant,
  notification,
  notificationPreference,
  contentItem,
  poll,
  pollOption,
  pollResponse,
  videoWatchEvent,
  calendarConnection,
  studentMemoryProfile,
  resource,
  engagementSnapshot,
  deployedMaterial,
  sessionReplayArtifact,
  trainingAttendance,
  taskDeployment,
  taskPoll,
  taskQuestion,
} from './tables'
import { session } from './next-auth'
import { consentLog } from './compliance'

export const userRelations = relations(user, ({ one, many }) => ({
  profile: one(profile, {
    fields: [user.userId],
    references: [profile.userId],
  }),
  tutorApplication: one(tutorApplication, {
    fields: [user.userId],
    references: [tutorApplication.userId],
  }),
  adminAssignments: many(adminAssignment),
  adminSessions: many(adminSession),
  courseEnrollments: many(courseEnrollment),
  liveSessionsAsTutor: many(liveSession),
  sessionParticipations: many(sessionParticipant),
  payouts: many(payout),
  familyMemberships: many(familyMember),
  conversationsAsParticipant1: many(conversation, { relationName: 'participant1' }),
  conversationsAsParticipant2: many(conversation, { relationName: 'participant2' }),
  sentDirectMessages: many(directMessage),
  mentionsSent: many(mention, { relationName: 'mentioner' }),
  mentionsReceived: many(mention, { relationName: 'mentionee' }),
  tutorFollowers: many(tutorFollow, { relationName: 'tutor' }),
  oneOnOneRequestsAsTutor: many(oneOnOneBookingRequest, { relationName: 'tutorOneOnOneRequests' }),
  oneOnOneRequestsAsStudent: many(oneOnOneBookingRequest, {
    relationName: 'studentOneOnOneRequests',
  }),
  calendarEventsAsTutor: many(calendarEvent, { relationName: 'tutorCalendarEvents' }),
  calendarEventsAsStudent: many(calendarEvent, { relationName: 'studentCalendarEvents' }),
  notifications: many(notification),
  notificationPreference: one(notificationPreference, {
    fields: [user.userId],
    references: [notificationPreference.userId],
  }),
  messages: many(message),
  pollsAsTutor: many(poll),
  taskDeployments: many(taskDeployment),
  taskPolls: many(taskPoll),
  taskQuestions: many(taskQuestion),
}))

export const profileRelations = relations(profile, ({ one }) => ({
  user: one(user, {
    fields: [profile.userId],
    references: [user.userId],
  }),
}))

export const tutorFollowRelations = relations(tutorFollow, ({ one }) => ({
  follower: one(user, {
    fields: [tutorFollow.followerId],
    references: [user.userId],
    relationName: 'follower',
  }),
  tutor: one(user, {
    fields: [tutorFollow.tutorId],
    references: [user.userId],
    relationName: 'tutor',
  }),
}))

export const tutorApplicationRelations = relations(tutorApplication, ({ one }) => ({
  user: one(user, {
    fields: [tutorApplication.userId],
    references: [user.userId],
  }),
}))

export const adminSessionRelations = relations(adminSession, ({ one }) => ({
  admin: one(user, {
    fields: [adminSession.adminId],
    references: [user.userId],
  }),
}))

export const adminAssignmentRelations = relations(adminAssignment, ({ one }) => ({
  user: one(user, {
    fields: [adminAssignment.userId],
    references: [user.userId],
  }),
  role: one(adminRole, {
    fields: [adminAssignment.roleId],
    references: [adminRole.roleId],
  }),
}))

export const adminRoleRelations = relations(adminRole, ({ many }) => ({
  assignments: many(adminAssignment),
}))

export const courseRelations = relations(course, ({ many }) => ({
  enrollments: many(courseEnrollment),
  lessons: many(courseLesson),
  shares: many(courseShare),
  progress: many(courseProgress),
  studentPerformances: many(studentPerformance),
}))

export const courseLessonRelations = relations(courseLesson, ({ one, many }) => ({
  course: one(course, {
    fields: [courseLesson.courseId],
    references: [course.courseId],
  }),
  progressRecords: many(courseLessonProgress),
}))

export const courseLessonProgressRelations = relations(courseLessonProgress, ({ one }) => ({
  lesson: one(courseLesson, {
    fields: [courseLessonProgress.lessonId],
    references: [courseLesson.lessonId],
  }),
  student: one(user, {
    fields: [courseLessonProgress.studentId],
    references: [user.userId],
  }),
}))

export const courseProgressRelations = relations(courseProgress, ({ one }) => ({
  student: one(user, {
    fields: [courseProgress.studentId],
    references: [user.userId],
  }),
  course: one(course, {
    fields: [courseProgress.courseId],
    references: [course.courseId],
  }),
}))

export const studentPerformanceRelations = relations(studentPerformance, ({ one }) => ({
  student: one(user, {
    fields: [studentPerformance.studentId],
    references: [user.userId],
  }),
  course: one(course, {
    fields: [studentPerformance.courseId],
    references: [course.courseId],
  }),
}))

export const courseEnrollmentRelations = relations(courseEnrollment, ({ one }) => ({
  student: one(user, {
    fields: [courseEnrollment.studentId],
    references: [user.userId],
  }),
  course: one(course, {
    fields: [courseEnrollment.courseId],
    references: [course.courseId],
  }),
}))

export const courseShareRelations = relations(courseShare, ({ one }) => ({
  course: one(course, {
    fields: [courseShare.courseId],
    references: [course.courseId],
  }),
  sharedBy: one(user, {
    fields: [courseShare.sharedByTutorId],
    references: [user.userId],
  }),
  recipient: one(user, {
    fields: [courseShare.recipientId],
    references: [user.userId],
  }),
}))

export const liveSessionRelations = relations(liveSession, ({ one, many }) => ({
  tutor: one(user, {
    fields: [liveSession.tutorId],
    references: [user.userId],
  }),
  participants: many(sessionParticipant),
  messages: many(message),
  polls: many(poll),
  deployedMaterials: many(deployedMaterial),
  sessionReplayArtifact: one(sessionReplayArtifact, {
    fields: [liveSession.sessionId],
    references: [sessionReplayArtifact.sessionId],
  }),
  trainingAttendances: many(trainingAttendance),
  course: one(course, {
    fields: [liveSession.courseId],
    references: [course.courseId],
  }),
}))

export const sessionParticipantRelations = relations(sessionParticipant, ({ one }) => ({
  session: one(liveSession, {
    fields: [sessionParticipant.sessionId],
    references: [liveSession.sessionId],
  }),
  student: one(user, {
    fields: [sessionParticipant.studentId],
    references: [user.userId],
  }),
}))

export const payoutRelations = relations(payout, ({ one, many }) => ({
  tutor: one(user, {
    fields: [payout.tutorId],
    references: [user.userId],
  }),
  payments: many(paymentOnPayout),
}))

export const paymentOnPayoutRelations = relations(paymentOnPayout, ({ one }) => ({
  payout: one(payout, {
    fields: [paymentOnPayout.payoutId],
    references: [payout.payoutId],
  }),
  payment: one(payment, {
    fields: [paymentOnPayout.paymentId],
    references: [payment.paymentId],
  }),
}))

export const familyAccountRelations = relations(familyAccount, ({ many }) => ({
  members: many(familyMember),
  payments: many(familyPayment),
  notifications: many(familyNotification),
  activities: many(parentActivityLog),
}))

export const familyMemberRelations = relations(familyMember, ({ one }) => ({
  familyAccount: one(familyAccount, {
    fields: [familyMember.familyAccountId],
    references: [familyAccount.familyAccountId],
  }),
  user: one(user, {
    fields: [familyMember.userId],
    references: [user.userId],
  }),
}))

export const familyPaymentRelations = relations(familyPayment, ({ one }) => ({
  parent: one(user, {
    fields: [familyPayment.parentId],
    references: [user.userId],
  }),
}))

export const familyNotificationRelations = relations(familyNotification, ({ one }) => ({
  parent: one(user, {
    fields: [familyNotification.parentId],
    references: [user.userId],
  }),
}))

export const parentActivityLogRelations = relations(parentActivityLog, ({ one }) => ({
  parent: one(user, {
    fields: [parentActivityLog.parentId],
    references: [user.userId],
  }),
}))

export const paymentRelations = relations(payment, ({ one }) => ({
  enrollment: one(courseEnrollment, {
    fields: [payment.enrollmentId],
    references: [courseEnrollment.enrollmentId],
  }),
}))

export const conversationRelations = relations(conversation, ({ one, many }) => ({
  participant1: one(user, {
    fields: [conversation.participant1Id],
    references: [user.userId],
    relationName: 'participant1',
  }),
  participant2: one(user, {
    fields: [conversation.participant2Id],
    references: [user.userId],
    relationName: 'participant2',
  }),
  messages: many(directMessage),
}))

export const directMessageRelations = relations(directMessage, ({ one }) => ({
  conversation: one(conversation, {
    fields: [directMessage.conversationId],
    references: [conversation.conversationId],
  }),
  sender: one(user, {
    fields: [directMessage.senderId],
    references: [user.userId],
  }),
}))

export const mentionRelations = relations(mention, ({ one }) => ({
  message: one(message, {
    fields: [mention.messageId],
    references: [message.messageId],
  }),
  mentioner: one(user, {
    fields: [mention.mentionerId],
    references: [user.userId],
    relationName: 'mentioner',
  }),
  mentionee: one(user, {
    fields: [mention.mentioneeId],
    references: [user.userId],
    relationName: 'mentionee',
  }),
}))

export const messageRelations = relations(message, ({ one, many }) => ({
  session: one(liveSession, {
    fields: [message.sessionId],
    references: [liveSession.sessionId],
  }),
  user: one(user, {
    fields: [message.userId],
    references: [user.userId],
  }),
  mentions: many(mention),
}))

export const taskSubmissionRelations = relations(taskSubmission, ({ one }) => ({
  task: one(builderTask, {
    fields: [taskSubmission.taskId],
    references: [builderTask.taskId],
  }),
  student: one(user, {
    fields: [taskSubmission.studentId],
    references: [user.userId],
  }),
  feedbackWorkflow: one(feedbackWorkflow, {
    fields: [taskSubmission.submissionId],
    references: [feedbackWorkflow.submissionId],
  }),
}))

export const feedbackWorkflowRelations = relations(feedbackWorkflow, ({ one }) => ({
  submission: one(taskSubmission, {
    fields: [feedbackWorkflow.submissionId],
    references: [taskSubmission.submissionId],
  }),
  student: one(user, {
    fields: [feedbackWorkflow.studentId],
    references: [user.userId],
  }),
}))

export const lessonLearningSessionRelations = relations(lessonLearningSession, ({ one }) => ({
  lesson: one(courseLesson, {
    fields: [lessonLearningSession.lessonId],
    references: [courseLesson.lessonId],
  }),
  student: one(user, {
    fields: [lessonLearningSession.studentId],
    references: [user.userId],
  }),
}))

// AI Tutor relations removed - tables deleted
// Relations removed: aITutorEnrollmentRelations, aIInteractionSessionRelations, aITutorDailyUsageRelations

export const userActivityLogRelations = relations(userActivityLog, ({ one }) => ({
  user: one(user, {
    fields: [userActivityLog.userId],
    references: [user.userId],
  }),
}))

// ============================================
// TASK BUILDER RELATIONS
// ============================================

export const builderTaskRelations = relations(builderTask, ({ one, many }) => ({
  course: one(course, {
    fields: [builderTask.courseId],
    references: [course.courseId],
  }),
  lesson: one(courseLesson, {
    fields: [builderTask.lessonId],
    references: [courseLesson.lessonId],
  }),
  tutor: one(user, {
    fields: [builderTask.tutorId],
    references: [user.userId],
  }),
  extensions: many(builderTaskExtension),
  files: many(builderTaskFile),
  dmi: many(builderTaskDmi),
  dmiVersions: many(builderTaskDmiVersion),
  versions: many(builderTaskVersion),
  taskDeployments: many(taskDeployment),
  taskPolls: many(taskPoll),
  taskQuestions: many(taskQuestion),
}))

export const builderTaskExtensionRelations = relations(builderTaskExtension, ({ one }) => ({
  task: one(builderTask, {
    fields: [builderTaskExtension.taskId],
    references: [builderTask.taskId],
  }),
}))

export const builderTaskFileRelations = relations(builderTaskFile, ({ one }) => ({
  task: one(builderTask, {
    fields: [builderTaskFile.taskId],
    references: [builderTask.taskId],
  }),
}))

export const builderTaskVersionRelations = relations(builderTaskVersion, ({ one }) => ({
  task: one(builderTask, {
    fields: [builderTaskVersion.taskId],
    references: [builderTask.taskId],
  }),
}))

export const builderTaskDmiRelations = relations(builderTaskDmi, ({ one }) => ({
  task: one(builderTask, {
    fields: [builderTaskDmi.taskId],
    references: [builderTask.taskId],
  }),
}))

export const builderTaskDmiVersionRelations = relations(builderTaskDmiVersion, ({ one }) => ({
  task: one(builderTask, {
    fields: [builderTaskDmiVersion.taskId],
    references: [builderTask.taskId],
  }),
}))

// ============================================
// CALENDAR & ONE-ON-ONE RELATIONS
// ============================================

export const oneOnOneBookingRequestRelations = relations(oneOnOneBookingRequest, ({ one }) => ({
  tutor: one(user, {
    fields: [oneOnOneBookingRequest.tutorId],
    references: [user.userId],
    relationName: 'tutorOneOnOneRequests',
  }),
  student: one(user, {
    fields: [oneOnOneBookingRequest.studentId],
    references: [user.userId],
    relationName: 'studentOneOnOneRequests',
  }),
  calendarEvent: one(calendarEvent, {
    fields: [oneOnOneBookingRequest.calendarEventId],
    references: [calendarEvent.eventId],
  }),
}))

export const calendarEventRelations = relations(calendarEvent, ({ one }) => ({
  tutor: one(user, {
    fields: [calendarEvent.tutorId],
    references: [user.userId],
    relationName: 'tutorCalendarEvents',
  }),
  student: one(user, {
    fields: [calendarEvent.studentId],
    references: [user.userId],
    relationName: 'studentCalendarEvents',
  }),
}))

export const courseVariantRelations = relations(courseVariant, ({ one }) => ({
  templateCourse: one(course, {
    fields: [courseVariant.templateCourseId],
    references: [course.courseId],
  }),
  publishedCourse: one(course, {
    fields: [courseVariant.publishedCourseId],
    references: [course.courseId],
  }),
}))

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, {
    fields: [notification.userId],
    references: [user.userId],
  }),
}))

export const notificationPreferenceRelations = relations(notificationPreference, ({ one }) => ({
  user: one(user, {
    fields: [notificationPreference.userId],
    references: [user.userId],
  }),
}))

export const contentItemRelations = relations(contentItem, ({ many }) => ({
  videoWatchEvents: many(videoWatchEvent),
}))

export const videoWatchEventRelations = relations(videoWatchEvent, ({ one }) => ({
  contentItem: one(contentItem, {
    fields: [videoWatchEvent.contentId],
    references: [contentItem.contentId],
  }),
  student: one(user, {
    fields: [videoWatchEvent.studentId],
    references: [user.userId],
  }),
}))

export const calendarConnectionRelations = relations(calendarConnection, ({ one }) => ({
  user: one(user, {
    fields: [calendarConnection.userId],
    references: [user.userId],
  }),
}))

export const studentMemoryProfileRelations = relations(studentMemoryProfile, ({ one }) => ({
  student: one(user, {
    fields: [studentMemoryProfile.studentId],
    references: [user.userId],
  }),
}))

export const resourceRelations = relations(resource, ({ one }) => ({
  tutor: one(user, {
    fields: [resource.tutorId],
    references: [user.userId],
  }),
}))

export const consentLogRelations = relations(consentLog, ({ one }) => ({
  user: one(user, {
    fields: [consentLog.userId],
    references: [user.userId],
  }),
}))

export const engagementSnapshotRelations = relations(engagementSnapshot, ({ one }) => ({
  session: one(liveSession, {
    fields: [engagementSnapshot.sessionId],
    references: [liveSession.sessionId],
  }),
  student: one(user, {
    fields: [engagementSnapshot.studentId],
    references: [user.userId],
  }),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.userId],
  }),
}))

export const pollRelations = relations(poll, ({ one, many }) => ({
  session: one(liveSession, {
    fields: [poll.sessionId],
    references: [liveSession.sessionId],
  }),
  tutor: one(user, {
    fields: [poll.tutorId],
    references: [user.userId],
  }),
  options: many(pollOption),
  responses: many(pollResponse),
}))

export const pollOptionRelations = relations(pollOption, ({ one }) => ({
  poll: one(poll, {
    fields: [pollOption.pollId],
    references: [poll.pollId],
  }),
}))

export const pollResponseRelations = relations(pollResponse, ({ one }) => ({
  poll: one(poll, {
    fields: [pollResponse.pollId],
    references: [poll.pollId],
  }),
  student: one(user, {
    fields: [pollResponse.studentId],
    references: [user.userId],
  }),
}))

export const deployedMaterialRelations = relations(deployedMaterial, ({ one }) => ({
  session: one(liveSession, {
    fields: [deployedMaterial.sessionId],
    references: [liveSession.sessionId],
  }),
  course: one(course, {
    fields: [deployedMaterial.courseId],
    references: [course.courseId],
  }),
}))

export const sessionReplayArtifactRelations = relations(sessionReplayArtifact, ({ one }) => ({
  session: one(liveSession, {
    fields: [sessionReplayArtifact.sessionId],
    references: [liveSession.sessionId],
  }),
  tutor: one(user, {
    fields: [sessionReplayArtifact.tutorId],
    references: [user.userId],
  }),
}))

export const trainingAttendanceRelations = relations(trainingAttendance, ({ one }) => ({
  session: one(liveSession, {
    fields: [trainingAttendance.sessionId],
    references: [liveSession.sessionId],
  }),
  user: one(user, {
    fields: [trainingAttendance.tutorId],
    references: [user.userId],
  }),
}))

export const taskDeploymentRelations = relations(taskDeployment, ({ one }) => ({
  task: one(builderTask, {
    fields: [taskDeployment.taskId],
    references: [builderTask.taskId],
  }),
  tutor: one(user, {
    fields: [taskDeployment.tutorId],
    references: [user.userId],
  }),
  session: one(liveSession, {
    fields: [taskDeployment.sessionId],
    references: [liveSession.sessionId],
  }),
}))

export const taskPollRelations = relations(taskPoll, ({ one }) => ({
  task: one(builderTask, {
    fields: [taskPoll.taskId],
    references: [builderTask.taskId],
  }),
  tutor: one(user, {
    fields: [taskPoll.tutorId],
    references: [user.userId],
  }),
  session: one(liveSession, {
    fields: [taskPoll.sessionId],
    references: [liveSession.sessionId],
  }),
}))

export const taskQuestionRelations = relations(taskQuestion, ({ one }) => ({
  task: one(builderTask, {
    fields: [taskQuestion.taskId],
    references: [builderTask.taskId],
  }),
  tutor: one(user, {
    fields: [taskQuestion.tutorId],
    references: [user.userId],
  }),
  session: one(liveSession, {
    fields: [taskQuestion.sessionId],
    references: [liveSession.sessionId],
  }),
}))
