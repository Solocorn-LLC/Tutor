-- Migration: Add courseMaterials JSONB column to Course for storing uploaded/converted material

--> statement-breakpoint
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "courseMaterials" jsonb;
