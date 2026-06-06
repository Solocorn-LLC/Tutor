-- Migration: Add missing indexes identified during performance audit

--> statement-breakpoint
-- BuilderTask: joined by (courseId, lessonId) on every course builder load
CREATE INDEX IF NOT EXISTS idx_builder_task_course_lesson ON "BuilderTask" ("courseId", "lessonId");

--> statement-breakpoint
-- FamilyMember: looked up by userId alone (parent child lookup)
CREATE INDEX IF NOT EXISTS idx_family_member_userid ON "FamilyMember" ("userId");

--> statement-breakpoint
-- ContentProgress: partial index for incomplete items (most reads filter on completed = false)
CREATE INDEX IF NOT EXISTS idx_content_progress_incomplete ON "ContentProgress" ("studentId") WHERE "completed" = false;

--> statement-breakpoint
-- LiveSession: queried by courseId when building session lists per course
CREATE INDEX IF NOT EXISTS idx_live_session_course ON "LiveSession" ("courseId");
