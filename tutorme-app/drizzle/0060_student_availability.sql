-- 0060_student_availability.sql
-- Student-owned weekly availability + date exceptions (mirror of the tutor
-- CalendarAvailability / CalendarException tables, keyed by studentId). Powers
-- the student dashboard "My Availability" tab. Idempotent; defaults set
-- explicitly (the prod DB has historically dropped column defaults).

CREATE TABLE IF NOT EXISTS "StudentAvailability" (
  "id" text PRIMARY KEY NOT NULL,
  "studentId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "dayOfWeek" integer NOT NULL,
  "startTime" text NOT NULL,
  "endTime" text NOT NULL,
  "timezone" text NOT NULL,
  "isAvailable" boolean NOT NULL,
  "validFrom" timestamptz,
  "validUntil" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "StudentAvailability_studentId_idx" ON "StudentAvailability" ("studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "StudentAvailability_studentId_dayOfWeek_startTime_endTime_key"
  ON "StudentAvailability" ("studentId", "dayOfWeek", "startTime", "endTime");

CREATE TABLE IF NOT EXISTS "StudentAvailabilityException" (
  "id" text PRIMARY KEY NOT NULL,
  "studentId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "date" timestamptz NOT NULL,
  "isAvailable" boolean NOT NULL,
  "startTime" text,
  "endTime" text,
  "reason" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "StudentAvailabilityException_studentId_idx" ON "StudentAvailabilityException" ("studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "StudentAvailabilityException_studentId_date_startTime_key"
  ON "StudentAvailabilityException" ("studentId", "date", "startTime");
