-- Migration: Add CourseSchedule table and scheduleId to CourseEnrollment

--> statement-breakpoint
-- ============================================
-- CourseSchedule: multiple schedules per course (cohorts)
-- ============================================
CREATE TABLE IF NOT EXISTS "CourseSchedule" (
  "id" text PRIMARY KEY NOT NULL,
  "courseId" text NOT NULL REFERENCES "Course"("id") ON DELETE CASCADE,
  "scheduleIndex" integer NOT NULL DEFAULT 1,
  "schedule" jsonb NOT NULL DEFAULT '[]',
  "weeksToSchedule" integer NOT NULL DEFAULT 8,
  "maxStudents" integer,
  "enrolledCount" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CourseSchedule_courseId_idx" ON "CourseSchedule"("courseId");

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "CourseSchedule_courseId_scheduleIndex_key" ON "CourseSchedule"("courseId", "scheduleIndex");

--> statement-breakpoint
-- ============================================
-- Add scheduleId to CourseEnrollment
-- ============================================
ALTER TABLE "CourseEnrollment" ADD COLUMN IF NOT EXISTS "scheduleId" text REFERENCES "CourseSchedule"("id") ON DELETE SET NULL;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CourseEnrollment_scheduleId_idx" ON "CourseEnrollment"("scheduleId");

--> statement-breakpoint
-- ============================================
-- Backfill: create CourseSchedule rows from existing course.schedule JSONB
-- ============================================
INSERT INTO "CourseSchedule" ("id", "courseId", "scheduleIndex", "schedule", "weeksToSchedule", "enrolledCount", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  c."id",
  1,
  COALESCE(c."schedule", '[]'),
  8,
  (
    SELECT COUNT(*)::int
    FROM "CourseEnrollment" e
    WHERE e."courseId" = c."id"
  ),
  now(),
  now()
FROM "Course" c
WHERE c."schedule" IS NOT NULL
  AND jsonb_array_length(COALESCE(c."schedule", '[]'::jsonb)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM "CourseSchedule" cs WHERE cs."courseId" = c."id"
  );

--> statement-breakpoint
-- Link existing enrollments to the newly created schedule rows
UPDATE "CourseEnrollment" e
SET "scheduleId" = cs."id"
FROM "CourseSchedule" cs
WHERE cs."courseId" = e."courseId"
  AND e."scheduleId" IS NULL;
