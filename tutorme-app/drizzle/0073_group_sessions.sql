-- Tutor-hosted group 1-on-1 sessions: an open session with a fixed seat
-- capacity and a per-seat price. Students each book (and pay for) their own seat.

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
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GroupSession_tutorId_fkey" FOREIGN KEY ("tutorId")
    REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "GroupSession_calendarEventId_fkey" FOREIGN KEY ("calendarEventId")
    REFERENCES "CalendarEvent"("id") ON DELETE SET NULL
);

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
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GroupSessionParticipant_groupSessionId_fkey" FOREIGN KEY ("groupSessionId")
    REFERENCES "GroupSession"("id") ON DELETE CASCADE,
  CONSTRAINT "GroupSessionParticipant_studentId_fkey" FOREIGN KEY ("studentId")
    REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "GroupSessionParticipant_session_student_key"
  ON "GroupSessionParticipant" ("groupSessionId", "studentId");
CREATE INDEX IF NOT EXISTS "GroupSessionParticipant_groupSessionId_idx"
  ON "GroupSessionParticipant" ("groupSessionId");
CREATE INDEX IF NOT EXISTS "GroupSessionParticipant_studentId_idx"
  ON "GroupSessionParticipant" ("studentId");
