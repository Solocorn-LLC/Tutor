-- Migration to rename all primary key columns to 'id' to match production schema
-- This aligns the local database with the Drizzle schema definitions
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM (
      VALUES
        ('User', 'userId', 'id'),
        ('Profile', 'profileId', 'id'),
        ('Account', 'accountId', 'id'),
        ('TutorApplication', 'applicationId', 'id'),
        ('Course', 'courseId', 'id'),
        ('CourseCatalog', 'catalogId', 'id'),
        ('CourseShare', 'shareId', 'id'),
        ('CourseLesson', 'lessonId', 'id'),
        ('LessonSession', 'sessionId', 'id'),
        ('CourseLessonProgress', 'progressId', 'id'),
        ('CourseEnrollment', 'enrollmentId', 'id'),
        ('CourseProgress', 'progressId', 'id'),
        ('LiveSession', 'sessionId', 'id'),
        ('SessionReplayArtifact', 'artifactId', 'id'),
        ('SessionParticipant', 'participantId', 'id'),
        ('Poll', 'pollId', 'id'),
        ('PollOption', 'optionId', 'id'),
        ('PollResponse', 'responseId', 'id'),
        ('BreakoutRoom', 'roomId', 'id'),
        ('BreakoutRoomAssignment', 'assignmentId', 'id'),
        ('Whiteboard', 'whiteboardId', 'id'),
        ('WhiteboardElement', 'elementId', 'id'),
        ('Quiz', 'quizId', 'id'),
        ('QuizAttempt', 'attemptId', 'id'),
        ('QuizAssignment', 'assignmentId', 'id'),
        ('QuizQuestion', 'questionId', 'id'),
        ('ContentItem', 'contentId', 'id'),
        ('VideoTranscript', 'transcriptId', 'id'),
        ('Payment', 'paymentId', 'id'),
        ('Payout', 'payoutId', 'id'),
        ('PaymentOnPayout', 'paymentOnPayoutId', 'id'),
        ('PlatformRevenue', 'revenueId', 'id'),
        ('FamilyAccount', 'familyId', 'id'),
        ('FamilyMember', 'memberId', 'id'),
        ('FamilyPayment', 'familyPaymentId', 'id'),
        ('FamilyNotification', 'notificationId', 'id'),
        ('Notification', 'notificationId', 'id'),
        ('UserActivityLog', 'logId', 'id'),
        ('CalendarEvent', 'eventId', 'id'),
        ('OneOnOneBookingRequest', 'requestId', 'id'),
        ('Subscription', 'subscriptionId', 'id'),
        ('SubscriptionPayment', 'subscriptionPaymentId', 'id'),
        ('AITutorSession', 'sessionId', 'id'),
        ('AITutorMessage', 'messageId', 'id'),
        ('AITutorEnrollment', 'enrollmentId', 'id'),
        ('StudentPerformance', 'performanceId', 'id'),
        ('UserGamification', 'gamificationId', 'id'),
        ('Mission', 'missionId', 'id'),
        ('UserMission', 'userMissionId', 'id'),
        ('Badge', 'badgeId', 'id'),
        ('UserBadge', 'userBadgeId', 'id'),
        ('LeaderboardEntry', 'entryId', 'id'),
        ('ParentActivityLog', 'activityId', 'id'),
        ('Message', 'messageId', 'id'),
        ('Conversation', 'conversationId', 'id'),
        ('ConversationParticipant', 'participantId', 'id'),
        ('Attachment', 'attachmentId', 'id'),
        ('Announcement', 'announceId', 'id'),
        ('AnnouncementAck', 'ackId', 'id'),
        ('ResourceLibraryItem', 'itemId', 'id'),
        ('Curriculum', 'curriculumId', 'id'),
        ('CurriculumVersion', 'versionId', 'id'),
        ('CurriculumShare', 'shareId', 'id'),
        ('SuggestedEdit', 'editId', 'id'),
        ('HandleRegistry', 'handleId', 'id'),
        ('SocialConnection', 'connectionId', 'id'),
        ('SocialInteraction', 'interactionId', 'id'),
        ('EngagementInsight', 'insightId', 'id'),
        ('StudentMemory', 'memoryId', 'id'),
        ('ContentResource', 'resourceId', 'id'),
        ('Schedule', 'scheduleId', 'id'),
        ('ScheduleItem', 'itemId', 'id'),
        ('StudyPlan', 'planId', 'id'),
        ('StudyPlanItem', 'itemId', 'id'),
        ('StudyStreak', 'streakId', 'id'),
        ('UserPreference', 'preferenceId', 'id'),
        ('Goal', 'goalId', 'id'),
        ('Review', 'reviewId', 'id'),
        ('Recommendation', 'recommendationId', 'id'),
        ('SessionFeedback', 'feedbackId', 'id'),
        ('SessionObservation', 'observationId', 'id'),
        ('LearningPath', 'pathId', 'id'),
        ('LearningPathEnrollment', 'enrollmentId', 'id'),
        ('LearningPathMilestone', 'milestoneId', 'id'),
        ('SupportTicket', 'ticketId', 'id'),
        ('SupportTicketMessage', 'messageId', 'id'),
        ('Referral', 'referralId', 'id'),
        ('ReferralReward', 'rewardId', 'id'),
        ('WebhookEvent', 'eventId', 'id'),
        ('SystemSetting', 'settingId', 'id'),
        ('DataRetentionLog', 'logId', 'id'),
        ('AuditLog', 'auditId', 'id')
    ) AS t(tbl, from_col, to_col)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = r.tbl AND column_name = r.from_col
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = r.tbl AND column_name = r.to_col
    ) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', r.tbl, r.from_col, r.to_col);
    END IF;
  END LOOP;
END $$;
