-- Apply latest schema changes idempotently
-- Safe to run multiple times

-- 1. Soft delete columns
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone;
ALTER TABLE "CourseLesson" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone;
ALTER TABLE "BuilderTask" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone;

-- 2. Indexes for soft deletes and performance
CREATE INDEX IF NOT EXISTS "Course_deletedAt_idx" ON "Course"("deletedAt") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "CourseLesson_deletedAt_idx" ON "CourseLesson"("deletedAt") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "BuilderTask_deletedAt_idx" ON "BuilderTask"("deletedAt") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Course_isPublished_creatorId_idx" ON "Course"("isPublished", "creatorId");

-- 3. feedbackStatus enum and column migration
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_status') THEN
    CREATE TYPE "feedback_status" AS ENUM ('ai_generated', 'tutor_modified', 'approved', 'sent_to_student', 'rejected');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'FeedbackWorkflow' AND column_name = 'status' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE "FeedbackWorkflow" ALTER COLUMN "status" TYPE "feedback_status" USING ("status"::"feedback_status");
  END IF;
END $$;

-- 4. Payment courseId column and index
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "courseId" text;
CREATE INDEX IF NOT EXISTS "Payment_courseId_status_idx" ON "Payment"("courseId", "status");

-- 5. Foreign key fixes (defensive: skip if referenced column doesn't exist)
DO $$
DECLARE
  user_pk_col text;
BEGIN
  -- Discover User PK column name (could be 'userId' or 'id')
  SELECT column_name INTO user_pk_col
  FROM information_schema.columns
  WHERE table_name = 'User' AND column_name IN ('userId', 'id')
  LIMIT 1;

  -- Session -> User FK
  IF user_pk_col IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'Session_userId_fkey' AND table_name = 'Session'
  ) THEN
    EXECUTE format(
      'ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(%I) ON DELETE CASCADE',
      user_pk_col
    );
  END IF;

  -- StudentProgressSnapshot -> User FK
  IF user_pk_col IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'StudentProgressSnapshot_studentId_fkey' AND table_name = 'StudentProgressSnapshot'
  ) THEN
    EXECUTE format(
      'ALTER TABLE "StudentProgressSnapshot" ADD CONSTRAINT "StudentProgressSnapshot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"(%I) ON DELETE CASCADE',
      user_pk_col
    );
  END IF;
END $$;

DO $$
DECLARE
  family_pk_col text;
BEGIN
  -- Discover FamilyAccount PK column name
  SELECT column_name INTO family_pk_col
  FROM information_schema.columns
  WHERE table_name = 'FamilyAccount' AND column_name IN ('familyAccountId', 'id')
  LIMIT 1;

  IF family_pk_col IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'EmergencyContact_parentId_fkey' AND table_name = 'EmergencyContact'
  ) THEN
    EXECUTE format(
      'ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FamilyAccount"(%I) ON DELETE CASCADE',
      family_pk_col
    );
  END IF;
END $$;

-- ============================================
-- curriculumId -> courseId renames (skipped migration 0019 / 0032)
-- ============================================
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['BuilderTask', 'CalendarEvent', 'LiveSession', 'ResourceShare', 'StudentPerformance']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = tbl AND column_name = 'curriculumId'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = tbl AND column_name = 'courseId'
    ) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN "curriculumId" TO "courseId"', tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================
-- LiveSession schema integrity fixes
-- Handle drift from skipped migrations (0019 rename + 0036 enum)
-- ============================================

-- Rename subject -> category if old exists and new doesn't
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'LiveSession' AND column_name = 'subject'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'LiveSession' AND column_name = 'category'
  ) THEN
    ALTER TABLE "LiveSession" RENAME COLUMN "subject" TO "category";
  END IF;
END $$;

-- Ensure required columns exist (defensive for partially migrated DBs)
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "courseId" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'LiveSession' AND column_name = 'category'
  ) THEN
    ALTER TABLE "LiveSession" ADD COLUMN "category" text NOT NULL DEFAULT 'general';
  END IF;
END $$;

-- Ensure category is NOT NULL (matches Drizzle schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'LiveSession' AND column_name = 'category' AND is_nullable = 'YES'
  ) THEN
    UPDATE "LiveSession" SET "category" = COALESCE("category", 'general') WHERE "category" IS NULL;
    ALTER TABLE "LiveSession" ALTER COLUMN "category" SET NOT NULL;
  END IF;
END $$;

-- Ensure LiveSessionStatus enum exists and status uses it
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LiveSessionStatus') THEN
    CREATE TYPE "LiveSessionStatus" AS ENUM ('scheduled', 'active', 'ended', 'preparing', 'live', 'paused');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'LiveSession' AND column_name = 'status' AND data_type = 'character varying'
  ) THEN
    UPDATE "LiveSession" SET "status" = 'scheduled'
    WHERE "status" IS NULL OR "status" NOT IN ('scheduled', 'active', 'ended', 'preparing', 'live', 'paused');
    ALTER TABLE "LiveSession" ALTER COLUMN "status" TYPE "LiveSessionStatus" USING ("status"::"LiveSessionStatus");
  END IF;
END $$;

-- Drop deprecated columns if they still exist
ALTER TABLE "LiveSession" DROP COLUMN IF EXISTS "type";
ALTER TABLE "LiveSession" DROP COLUMN IF EXISTS "gradeLevel";

-- Ensure maxStudents exists (matches Drizzle schema)
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "maxStudents" integer DEFAULT 50 NOT NULL;

-- ============================================
-- Additional enum fixes for drifted DBs (0036)
-- ============================================

-- BuilderTaskType enum + column conversion
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BuilderTaskType') THEN
    CREATE TYPE "BuilderTaskType" AS ENUM ('task', 'assessment', 'homework');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'BuilderTask' AND column_name = 'type' AND data_type = 'character varying'
  ) THEN
    UPDATE "BuilderTask" SET "type" = 'task'
    WHERE "type" IS NULL OR "type" NOT IN ('task', 'assessment', 'homework');
    ALTER TABLE "BuilderTask" ALTER COLUMN "type" TYPE "BuilderTaskType" USING ("type"::"BuilderTaskType");
  END IF;
END $$;

-- BuilderTaskStatus enum + column conversion
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BuilderTaskStatus') THEN
    CREATE TYPE "BuilderTaskStatus" AS ENUM ('draft', 'published', 'archived');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'BuilderTask' AND column_name = 'status' AND data_type = 'character varying'
  ) THEN
    UPDATE "BuilderTask" SET "status" = 'draft'
    WHERE "status" IS NULL OR "status" NOT IN ('draft', 'published', 'archived');
    ALTER TABLE "BuilderTask" ALTER COLUMN "status" TYPE "BuilderTaskStatus" USING ("status"::"BuilderTaskStatus");
  END IF;
END $$;

-- TaskDeploymentStatus enum + column conversion
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TaskDeploymentStatus') THEN
    CREATE TYPE "TaskDeploymentStatus" AS ENUM ('active', 'closed');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'TaskDeployment' AND column_name = 'status' AND data_type = 'character varying'
  ) THEN
    UPDATE "TaskDeployment" SET "status" = 'active'
    WHERE "status" IS NULL OR "status" NOT IN ('active', 'closed');
    ALTER TABLE "TaskDeployment" ALTER COLUMN "status" TYPE "TaskDeploymentStatus" USING ("status"::"TaskDeploymentStatus");
  END IF;
END $$;

-- PayoutStatus enum + column conversion
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PayoutStatus') THEN
    CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Payout' AND column_name = 'status' AND data_type = 'character varying'
  ) THEN
    UPDATE "Payout" SET "status" = 'PENDING'
    WHERE "status" IS NULL OR "status" NOT IN ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED');
    ALTER TABLE "Payout" ALTER COLUMN "status" TYPE "PayoutStatus" USING ("status"::"PayoutStatus");
  END IF;
END $$;

-- BookingRequestStatus enum (defensive: table may not exist in very old snapshots)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BookingRequestStatus') THEN
    CREATE TYPE "BookingRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'COMPLETED');
  END IF;
END $$;

-- ============================================
-- TutorAsset fileKey column (for GCS URL refresh)
-- ============================================
ALTER TABLE "TutorAsset" ADD COLUMN IF NOT EXISTS "fileKey" text;

-- ============================================
-- CourseSchedule column completeness (migration 0050/0051 drift)
-- If CourseSchedule existed before 0050 was written, CREATE TABLE IF NOT EXISTS
-- silently skipped — leaving enrolledCount, weeksToSchedule, and name missing.
-- ============================================
ALTER TABLE "CourseSchedule" ADD COLUMN IF NOT EXISTS "enrolledCount" integer NOT NULL DEFAULT 0;
ALTER TABLE "CourseSchedule" ADD COLUMN IF NOT EXISTS "weeksToSchedule" integer NOT NULL DEFAULT 8;
ALTER TABLE "CourseSchedule" ADD COLUMN IF NOT EXISTS "name" text;
CREATE UNIQUE INDEX IF NOT EXISTS "CourseSchedule_courseId_scheduleIndex_key"
  ON "CourseSchedule"("courseId", "scheduleIndex");
CREATE INDEX IF NOT EXISTS "CourseSchedule_courseId_idx"
  ON "CourseSchedule"("courseId");
