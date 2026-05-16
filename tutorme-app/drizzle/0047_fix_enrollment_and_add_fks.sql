-- Custom migration: remove redundant lessonsCompleted from CourseEnrollment,
-- add foreign keys to StudentTaskReport, and link ContentItem to lessons

--> statement-breakpoint
ALTER TABLE "CourseEnrollment" DROP COLUMN IF EXISTS "lessonsCompleted";

--> statement-breakpoint
ALTER TABLE "StudentTaskReport" ADD CONSTRAINT "StudentTaskReport_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE set null ON UPDATE no action;

--> statement-breakpoint
ALTER TABLE "StudentTaskReport" ADD CONSTRAINT "StudentTaskReport_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "BuilderTask"("id") ON DELETE set null ON UPDATE no action;

--> statement-breakpoint
ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "lessonId" text;

--> statement-breakpoint
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "CourseLesson"("id") ON DELETE set null ON UPDATE no action;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ContentItem_lessonId_idx" ON "ContentItem" USING btree ("lessonId");
