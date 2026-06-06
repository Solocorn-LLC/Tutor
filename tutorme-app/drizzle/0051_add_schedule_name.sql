-- Migration: Add name column to CourseSchedule for custom schedule labels

--> statement-breakpoint
ALTER TABLE "CourseSchedule" ADD COLUMN IF NOT EXISTS "name" text;
