-- Custom migration: rename LessonSession to LessonLearningSession to avoid
-- conceptual collision with LiveSession

--> statement-breakpoint
ALTER TABLE "LessonSession" RENAME TO "LessonLearningSession";

--> statement-breakpoint
ALTER INDEX "LessonSession_studentId_idx" RENAME TO "LessonLearningSession_studentId_idx";

--> statement-breakpoint
ALTER INDEX "LessonSession_lessonId_idx" RENAME TO "LessonLearningSession_lessonId_idx";

--> statement-breakpoint
ALTER INDEX "LessonSession_studentId_lessonId_key" RENAME TO "LessonLearningSession_studentId_lessonId_key";
