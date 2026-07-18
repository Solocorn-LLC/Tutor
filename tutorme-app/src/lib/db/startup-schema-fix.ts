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

-- BuilderTask.pciSpec (structured PCI spec, TASK-6) — persisted at deploy so the
-- live tutor can apply it. Mirrors drizzle/0064; also applied here so a revision
-- that skips migrations still has the column before it serves traffic.
ALTER TABLE "BuilderTask" ADD COLUMN IF NOT EXISTS "pciSpec" jsonb;

-- Lesson linkage (drizzle/0065): which lesson a session covers + which lesson a
-- deployed item came from. Nullable; mirrors the migration for skip-migrations.
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "lessonId" text;
ALTER TABLE "DeployedMaterial" ADD COLUMN IF NOT EXISTS "lessonId" text;

-- Source-lesson linkage (drizzle/0066): the template lesson a published-variant
-- lesson was copied from, so correlation survives lesson reordering. Nullable.
ALTER TABLE "CourseLesson" ADD COLUMN IF NOT EXISTS "sourceLessonId" text;

-- Follow-up Q&A (drizzle/0067): persisted student<->assistant follow-ups on a
-- graded assessment, so tutors can see what was asked/answered. Nullable jsonb.
ALTER TABLE "TaskSubmission" ADD COLUMN IF NOT EXISTS "followUps" jsonb;

-- Worked solutions (drizzle/0068): cached AI worked solutions keyed by
-- questionId, reused instead of re-running the model. Nullable jsonb.
ALTER TABLE "TaskSubmission" ADD COLUMN IF NOT EXISTS "workedSolutions" jsonb;

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
`)

// Tables that must be ensured on EVERY boot — independent of the LiveSession
// drift early-exit below. Without this, a prod DB whose LiveSession already
// looks fine would skip the whole drift block and never get these tables.
const ENSURE_TABLES_SQL = sql.raw(`
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

-- Account status (admins can suspend accounts to block sign-in).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';

-- ---------------------------------------------------------------------------
-- 1-on-1 schema (drizzle/0069–0072). The drizzle journal is frozen at 0068, so
-- the journal-based migrator ignores these files entirely — they only reach a
-- prod DB through this idempotent boot-time block. Without it, the shipped
-- buffer/reschedule/review/waitlist features silently degrade (queries hit
-- missing columns/tables and fall back via try/catch).
-- ---------------------------------------------------------------------------

-- 0069: per-tutor buffer (minutes) enforced around 1-on-1 bookings.
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "bufferMinutes" integer;

-- Per-tutor toggle: allow students to book a recurring weekly series (default on).
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "oneOnOneRecurringEnabled" boolean NOT NULL DEFAULT true;

-- 0070: pending reschedule proposal fields (propose → accept/decline).
ALTER TABLE "OneOnOneBookingRequest" ADD COLUMN IF NOT EXISTS "rescheduleProposedDate" timestamptz;
ALTER TABLE "OneOnOneBookingRequest" ADD COLUMN IF NOT EXISTS "rescheduleProposedStart" text;
ALTER TABLE "OneOnOneBookingRequest" ADD COLUMN IF NOT EXISTS "rescheduleProposedEnd" text;
ALTER TABLE "OneOnOneBookingRequest" ADD COLUMN IF NOT EXISTS "rescheduleProposedBy" text;

-- The student's note to the tutor ("why I want this session"), shown on the
-- tutor's request card. Long accepted by the API but previously never persisted.
ALTER TABLE "OneOnOneBookingRequest" ADD COLUMN IF NOT EXISTS "studentNotes" text;

-- Recurring bookings: the N weekly sessions requested together share one seriesId.
ALTER TABLE "OneOnOneBookingRequest" ADD COLUMN IF NOT EXISTS "seriesId" text;
ALTER TABLE "OneOnOneBookingRequest" ADD COLUMN IF NOT EXISTS "seriesIndex" integer;
CREATE INDEX IF NOT EXISTS "OneOnOneBookingRequest_seriesId_idx" ON "OneOnOneBookingRequest" ("seriesId");

-- Course linkage: a group session or a student's 1-on-1 request can name the
-- course it's built around, so the tutor can deploy that course in the live room.
-- Nullable, FK-less text (drift-proof); the app validates ownership/publication.
ALTER TABLE "GroupSession" ADD COLUMN IF NOT EXISTS "courseId" text;
ALTER TABLE "OneOnOneBookingRequest" ADD COLUMN IF NOT EXISTS "courseId" text;

-- 0071: student reviews of completed 1-on-1 sessions (one per booking).
CREATE TABLE IF NOT EXISTS "OneOnOneReview" (
  "id" text PRIMARY KEY NOT NULL,
  "requestId" text NOT NULL,
  "tutorId" text NOT NULL,
  "studentId" text NOT NULL,
  "rating" integer NOT NULL,
  "comment" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OneOnOneReview_requestId_fkey') THEN
    ALTER TABLE "OneOnOneReview" ADD CONSTRAINT "OneOnOneReview_requestId_fkey"
      FOREIGN KEY ("requestId") REFERENCES "OneOnOneBookingRequest"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OneOnOneReview_tutorId_fkey') THEN
    ALTER TABLE "OneOnOneReview" ADD CONSTRAINT "OneOnOneReview_tutorId_fkey"
      FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OneOnOneReview_studentId_fkey') THEN
    ALTER TABLE "OneOnOneReview" ADD CONSTRAINT "OneOnOneReview_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "OneOnOneReview_requestId_key" ON "OneOnOneReview" ("requestId");
CREATE INDEX IF NOT EXISTS "OneOnOneReview_tutorId_idx" ON "OneOnOneReview" ("tutorId");

-- 0072: students waiting for a 1-on-1 opening with a tutor.
CREATE TABLE IF NOT EXISTS "OneOnOneWaitlist" (
  "id" text PRIMARY KEY NOT NULL,
  "tutorId" text NOT NULL,
  "studentId" text NOT NULL,
  "note" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OneOnOneWaitlist_tutorId_fkey') THEN
    ALTER TABLE "OneOnOneWaitlist" ADD CONSTRAINT "OneOnOneWaitlist_tutorId_fkey"
      FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OneOnOneWaitlist_studentId_fkey') THEN
    ALTER TABLE "OneOnOneWaitlist" ADD CONSTRAINT "OneOnOneWaitlist_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "OneOnOneWaitlist_tutor_student_key"
  ON "OneOnOneWaitlist" ("tutorId", "studentId");
CREATE INDEX IF NOT EXISTS "OneOnOneWaitlist_tutorId_idx" ON "OneOnOneWaitlist" ("tutorId");
CREATE INDEX IF NOT EXISTS "OneOnOneWaitlist_studentId_idx" ON "OneOnOneWaitlist" ("studentId");

-- 0074: tutors can offer 1-on-1 sessions for free (booking skips payment).
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "oneOnOneFree" boolean NOT NULL DEFAULT false;

-- Group 1-on-1 sessions (drizzle/0073): tutor-hosted, per-seat.
CREATE TABLE IF NOT EXISTS "GroupSession" (
  "id" text PRIMARY KEY NOT NULL,
  "tutorId" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "requestedDate" timestamptz NOT NULL,
  "startTime" text NOT NULL,
  "endTime" text NOT NULL,
  "timezone" text NOT NULL,
  "durationMinutes" integer NOT NULL DEFAULT 60,
  "capacity" integer NOT NULL,
  "pricePerSeat" double precision NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "status" text NOT NULL DEFAULT 'OPEN',
  "calendarEventId" text,
  "liveSessionId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GroupSession_tutorId_fkey') THEN
    ALTER TABLE "GroupSession" ADD CONSTRAINT "GroupSession_tutorId_fkey"
      FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GroupSession_calendarEventId_fkey')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'CalendarEvent') THEN
    ALTER TABLE "GroupSession" ADD CONSTRAINT "GroupSession_calendarEventId_fkey"
      FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "GroupSession_tutorId_idx" ON "GroupSession" ("tutorId");
CREATE INDEX IF NOT EXISTS "GroupSession_status_idx" ON "GroupSession" ("status");
CREATE INDEX IF NOT EXISTS "GroupSession_requestedDate_idx" ON "GroupSession" ("requestedDate");

CREATE TABLE IF NOT EXISTS "GroupSessionParticipant" (
  "id" text PRIMARY KEY NOT NULL,
  "groupSessionId" text NOT NULL,
  "studentId" text NOT NULL,
  "status" text NOT NULL DEFAULT 'RESERVED',
  "paymentId" text,
  "reservedAt" timestamptz NOT NULL DEFAULT now(),
  "paidAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GroupSessionParticipant_groupSessionId_fkey') THEN
    ALTER TABLE "GroupSessionParticipant" ADD CONSTRAINT "GroupSessionParticipant_groupSessionId_fkey"
      FOREIGN KEY ("groupSessionId") REFERENCES "GroupSession"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GroupSessionParticipant_studentId_fkey') THEN
    ALTER TABLE "GroupSessionParticipant" ADD CONSTRAINT "GroupSessionParticipant_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "GroupSessionParticipant_session_student_key"
  ON "GroupSessionParticipant" ("groupSessionId", "studentId");
CREATE INDEX IF NOT EXISTS "GroupSessionParticipant_groupSessionId_idx"
  ON "GroupSessionParticipant" ("groupSessionId");
CREATE INDEX IF NOT EXISTS "GroupSessionParticipant_studentId_idx"
  ON "GroupSessionParticipant" ("studentId");

-- Reschedule consent gate (Phase 2): a proposed session-time change stays
-- pending (session keeps its old time) until every rostered student agrees.
-- Mirror of src/lib/db/schema/tables/reschedule.ts — keep in sync.
CREATE TABLE IF NOT EXISTS "SessionRescheduleProposal" (
  "id" text PRIMARY KEY NOT NULL,
  "sessionId" text NOT NULL,
  "courseId" text,
  "proposedBy" text NOT NULL,
  "currentStart" timestamptz,
  "currentEnd" timestamptz,
  "proposedStart" timestamptz NOT NULL,
  "proposedEnd" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "resolvedReason" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "resolvedAt" timestamptz
);
CREATE TABLE IF NOT EXISTS "SessionRescheduleVote" (
  "id" text PRIMARY KEY NOT NULL,
  "proposalId" text NOT NULL,
  "studentId" text NOT NULL,
  "response" text NOT NULL DEFAULT 'PENDING',
  "respondedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionRescheduleProposal_sessionId_fkey') THEN
    ALTER TABLE "SessionRescheduleProposal" ADD CONSTRAINT "SessionRescheduleProposal_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionRescheduleProposal_proposedBy_fkey') THEN
    ALTER TABLE "SessionRescheduleProposal" ADD CONSTRAINT "SessionRescheduleProposal_proposedBy_fkey"
      FOREIGN KEY ("proposedBy") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionRescheduleVote_proposalId_fkey') THEN
    ALTER TABLE "SessionRescheduleVote" ADD CONSTRAINT "SessionRescheduleVote_proposalId_fkey"
      FOREIGN KEY ("proposalId") REFERENCES "SessionRescheduleProposal"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionRescheduleVote_studentId_fkey') THEN
    ALTER TABLE "SessionRescheduleVote" ADD CONSTRAINT "SessionRescheduleVote_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "SessionRescheduleProposal_sessionId_idx"
  ON "SessionRescheduleProposal" ("sessionId");
CREATE INDEX IF NOT EXISTS "SessionRescheduleProposal_status_idx"
  ON "SessionRescheduleProposal" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "SessionRescheduleVote_proposal_student_key"
  ON "SessionRescheduleVote" ("proposalId", "studentId");
CREATE INDEX IF NOT EXISTS "SessionRescheduleVote_proposalId_idx"
  ON "SessionRescheduleVote" ("proposalId");

-- Enforce the 1:1 booking↔CalendarEvent and groupSession↔CalendarEvent invariants
-- so a join on calendarEventId can't fan out (accept/heal always mints a fresh
-- event and repoints the column). Guarded: if a stray duplicate exists in prod,
-- skip + RAISE WARNING rather than throw — this whole block runs as one implicit
-- transaction, so a failing CREATE would roll back every table-ensure above.
-- NULL calendarEventId rows (unpaid/legacy) are allowed to repeat.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "OneOnOneBookingRequest"
    WHERE "calendarEventId" IS NOT NULL
    GROUP BY "calendarEventId" HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "OneOnOneBookingRequest_calendarEventId_key"
      ON "OneOnOneBookingRequest" ("calendarEventId");
  ELSE
    RAISE WARNING 'Skipped OneOnOneBookingRequest_calendarEventId_key: duplicate calendarEventId values present — clean them up, then restart to enforce.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "GroupSession"
    WHERE "calendarEventId" IS NOT NULL
    GROUP BY "calendarEventId" HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "GroupSession_calendarEventId_key"
      ON "GroupSession" ("calendarEventId");
  ELSE
    RAISE WARNING 'Skipped GroupSession_calendarEventId_key: duplicate calendarEventId values present — clean them up, then restart to enforce.';
  END IF;
END $$;
`)

// Enforce the courseId → Course(id) foreign keys that the schema DEFINES but that
// were never actually created in prod (so hard-deleting a Course left orphaned rows
// behind — see scripts/cleanup-orphaned-courses.ts + recover-protected-courses.ts,
// which cleared/backfilled every orphan so these can finally validate). Each FK is
// added IF NOT EXISTS and wrapped in its own exception handler, so it's idempotent
// and a stray orphan on one table never blocks the others (or crashes startup). The
// ON DELETE action matches each table's schema definition.
const ENFORCE_COURSE_FKS_SQL = sql.raw(`
DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('LiveSession',            'SET NULL'),
      ('CourseLesson',           'CASCADE'),
      ('CalendarEvent',          'SET NULL'),
      ('CourseEnrollment',       'CASCADE'),
      ('BuilderTask',            'CASCADE'),
      ('OneOnOneBookingRequest', 'SET NULL'),
      ('GroupSession',           'SET NULL')
    ) AS t(tbl, on_delete)
  LOOP
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = fk.tbl)
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = fk.tbl AND column_name = 'courseId')
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = fk.tbl || '_courseId_Course_id_fk'
        )
      THEN
        EXECUTE format(
          'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE %s',
          fk.tbl, fk.tbl || '_courseId_Course_id_fk', fk.on_delete
        );
        RAISE NOTICE 'Added FK %_courseId_Course_id_fk', fk.tbl;
      END IF;
    EXCEPTION WHEN others THEN
      -- e.g. a residual orphan would fail validation — log and keep going.
      RAISE NOTICE 'Skipped FK %_courseId_Course_id_fk: %', fk.tbl, SQLERRM;
    END;
  END LOOP;
END $$;
`)

export async function applyStartupSchemaFixes(): Promise<void> {
  // Always ensure new standalone tables exist, even when the drift check below
  // short-circuits (prod DBs whose LiveSession columns already look fine).
  try {
    await drizzleDb.execute(ENSURE_TABLES_SQL)
  } catch (err: any) {
    console.error('[SchemaFix] ❌ Failed to ensure tables:', err?.message)
  }

  // Add the COMPLETED booking status. ALTER TYPE ... ADD VALUE must run on its
  // own (not inside the batched DDL above), so keep it in a separate statement.
  try {
    await drizzleDb.execute(
      sql.raw(`ALTER TYPE "BookingRequestStatus" ADD VALUE IF NOT EXISTS 'COMPLETED'`)
    )
  } catch (err: any) {
    console.error('[SchemaFix] ❌ Failed to add COMPLETED booking status:', err?.message)
  }

  // Enforce the courseId → Course FKs (idempotent). Must run outside the drift
  // check below, which short-circuits on a healthy LiveSession schema.
  try {
    await drizzleDb.execute(ENFORCE_COURSE_FKS_SQL)
  } catch (err: any) {
    console.error('[SchemaFix] ❌ Failed to enforce courseId FKs:', err?.message)
  }

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
