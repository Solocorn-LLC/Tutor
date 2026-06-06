-- Migration 0054: Ensure all CourseSchedule columns exist
--
-- Background: migration 0050 used CREATE TABLE IF NOT EXISTS. If CourseSchedule
-- already existed (created via an earlier schema push with fewer columns), the
-- CREATE was silently skipped and several columns were never added.
-- This migration adds every column idempotently so the table matches the Drizzle
-- schema regardless of how the table was originally created.

--> statement-breakpoint
ALTER TABLE "CourseSchedule" ADD COLUMN IF NOT EXISTS "enrolledCount" integer NOT NULL DEFAULT 0;

--> statement-breakpoint
ALTER TABLE "CourseSchedule" ADD COLUMN IF NOT EXISTS "weeksToSchedule" integer NOT NULL DEFAULT 8;

--> statement-breakpoint
-- From migration 0051 (may also have been skipped for the same reason)
ALTER TABLE "CourseSchedule" ADD COLUMN IF NOT EXISTS "name" text;

--> statement-breakpoint
-- Ensure the unique index exists (also from 0050, may be missing)
CREATE UNIQUE INDEX IF NOT EXISTS "CourseSchedule_courseId_scheduleIndex_key"
  ON "CourseSchedule"("courseId", "scheduleIndex");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CourseSchedule_courseId_idx"
  ON "CourseSchedule"("courseId");
