/**
 * Startup schema drift detection and auto-fix.
 * Safe to run on every startup — all operations are idempotent.
 */

import { drizzleDb } from './drizzle'
import { sql } from 'drizzle-orm'

const FIXES_SQL = sql.raw(`
-- curriculumId -> courseId renames
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

-- LiveSession subject -> category rename
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'LiveSession' AND column_name = 'subject'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'LiveSession' AND column_name = 'category'
  ) THEN
    ALTER TABLE "LiveSession" RENAME COLUMN "subject" TO "category";
  END IF;
END $$;

-- Ensure LiveSession required columns
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "courseId" text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'LiveSession' AND column_name = 'category'
  ) THEN
    ALTER TABLE "LiveSession" ADD COLUMN "category" text NOT NULL DEFAULT 'general';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'LiveSession' AND column_name = 'category' AND is_nullable = 'YES'
  ) THEN
    UPDATE "LiveSession" SET "category" = COALESCE("category", 'general') WHERE "category" IS NULL;
    ALTER TABLE "LiveSession" ALTER COLUMN "category" SET NOT NULL;
  END IF;
END $$;

-- LiveSessionStatus enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LiveSessionStatus') THEN
    CREATE TYPE "LiveSessionStatus" AS ENUM ('scheduled', 'active', 'ended', 'preparing', 'live', 'paused');
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'LiveSession' AND column_name = 'status' AND data_type = 'character varying'
  ) THEN
    UPDATE "LiveSession" SET "status" = 'scheduled'
    WHERE "status" IS NULL OR "status" NOT IN ('scheduled', 'active', 'ended', 'preparing', 'live', 'paused');
    ALTER TABLE "LiveSession" ALTER COLUMN "status" TYPE "LiveSessionStatus" USING ("status"::"LiveSessionStatus");
  END IF;
END $$;

-- Drop deprecated LiveSession columns
ALTER TABLE "LiveSession" DROP COLUMN IF EXISTS "type";
ALTER TABLE "LiveSession" DROP COLUMN IF EXISTS "gradeLevel";

-- LiveSession maxStudents
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "maxStudents" integer DEFAULT 50 NOT NULL;

-- LiveSession durationMinutes
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "durationMinutes" integer DEFAULT 120 NOT NULL;

-- PayoutStatus enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PayoutStatus') THEN
    CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED');
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'Payout' AND column_name = 'status' AND data_type = 'character varying'
  ) THEN
    UPDATE "Payout" SET "status" = 'PENDING'
    WHERE "status" IS NULL OR "status" NOT IN ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED');
    ALTER TABLE "Payout" ALTER COLUMN "status" TYPE "PayoutStatus" USING ("status"::"PayoutStatus");
  END IF;
END $$;

-- BuilderTask enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BuilderTaskType') THEN
    CREATE TYPE "BuilderTaskType" AS ENUM ('task', 'assessment', 'homework');
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'BuilderTask' AND column_name = 'type' AND data_type = 'character varying'
  ) THEN
    UPDATE "BuilderTask" SET "type" = 'task' WHERE "type" IS NULL OR "type" NOT IN ('task', 'assessment', 'homework');
    ALTER TABLE "BuilderTask" ALTER COLUMN "type" TYPE "BuilderTaskType" USING ("type"::"BuilderTaskType");
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BuilderTaskStatus') THEN
    CREATE TYPE "BuilderTaskStatus" AS ENUM ('draft', 'published', 'archived');
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'BuilderTask' AND column_name = 'status' AND data_type = 'character varying'
  ) THEN
    UPDATE "BuilderTask" SET "status" = 'draft' WHERE "status" IS NULL OR "status" NOT IN ('draft', 'published', 'archived');
    ALTER TABLE "BuilderTask" ALTER COLUMN "status" TYPE "BuilderTaskStatus" USING ("status"::"BuilderTaskStatus");
  END IF;
END $$;

-- TaskDeploymentStatus enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TaskDeploymentStatus') THEN
    CREATE TYPE "TaskDeploymentStatus" AS ENUM ('active', 'closed');
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'TaskDeployment' AND column_name = 'status' AND data_type = 'character varying'
  ) THEN
    UPDATE "TaskDeployment" SET "status" = 'active' WHERE "status" IS NULL OR "status" NOT IN ('active', 'closed');
    ALTER TABLE "TaskDeployment" ALTER COLUMN "status" TYPE "TaskDeploymentStatus" USING ("status"::"TaskDeploymentStatus");
  END IF;
END $$;

-- Web Push subscriptions (browser push for session reminders)
CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" text NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "userAgent" text,
  "createdAt" timestamptz DEFAULT now() NOT NULL
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PushSubscription_endpoint_unique') THEN
    ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_endpoint_unique" UNIQUE ("endpoint");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PushSubscription_userId_fkey') THEN
    ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription" ("userId");
`)

export async function applyStartupSchemaFixes(): Promise<void> {
  try {
    console.log('[SchemaFix] Checking for schema drift...')

    // Quick check: do required LiveSession columns exist?
    const check = await drizzleDb.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'LiveSession' AND column_name IN ('category', 'durationMinutes')
    `)

    if (check.rows.length >= 2) {
      console.log('[SchemaFix] LiveSession schema looks OK. Skipping.')
      return
    }

    console.log('[SchemaFix] Schema drift detected. Applying fixes...')
    await drizzleDb.execute(FIXES_SQL)
    console.log('[SchemaFix] ✅ Schema fixes applied successfully.')
  } catch (err: any) {
    console.error('[SchemaFix] ❌ Failed to apply schema fixes:', err?.message)
    // Don't throw — let the app start anyway so the user can see the error in logs
  }
}
