-- Student reviews of completed 1-on-1 sessions (one per booking).
CREATE TABLE IF NOT EXISTS "OneOnOneReview" (
  "id" text PRIMARY KEY NOT NULL,
  "requestId" text NOT NULL REFERENCES "OneOnOneBookingRequest"("id") ON DELETE CASCADE,
  "tutorId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "studentId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "rating" integer NOT NULL,
  "comment" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "OneOnOneReview_requestId_key" ON "OneOnOneReview" ("requestId");
CREATE INDEX IF NOT EXISTS "OneOnOneReview_tutorId_idx" ON "OneOnOneReview" ("tutorId");
