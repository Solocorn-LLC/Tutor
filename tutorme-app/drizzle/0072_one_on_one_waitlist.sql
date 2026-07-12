-- Students waiting for a 1-on-1 opening with a tutor.
CREATE TABLE IF NOT EXISTS "OneOnOneWaitlist" (
  "id" text PRIMARY KEY NOT NULL,
  "tutorId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "studentId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "note" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "OneOnOneWaitlist_tutor_student_key" ON "OneOnOneWaitlist" ("tutorId","studentId");
CREATE INDEX IF NOT EXISTS "OneOnOneWaitlist_tutorId_idx" ON "OneOnOneWaitlist" ("tutorId");
CREATE INDEX IF NOT EXISTS "OneOnOneWaitlist_studentId_idx" ON "OneOnOneWaitlist" ("studentId");
