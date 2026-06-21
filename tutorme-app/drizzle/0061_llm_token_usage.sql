-- 0061_llm_token_usage.sql
-- Per-call LLM token usage ledger, optionally attributed to a student + course.
-- Powers the token-cost deduction in the paid-course unregister refund.
-- Idempotent; explicit defaults (prod has historically dropped column defaults).

CREATE TABLE IF NOT EXISTS "LlmTokenUsage" (
  "id" text PRIMARY KEY NOT NULL,
  "studentId" text REFERENCES "User"("id") ON DELETE SET NULL,
  "courseId" text REFERENCES "Course"("id") ON DELETE SET NULL,
  "provider" text NOT NULL,
  "model" text,
  "promptTokens" integer NOT NULL DEFAULT 0,
  "completionTokens" integer NOT NULL DEFAULT 0,
  "totalTokens" integer NOT NULL DEFAULT 0,
  "costUsd" double precision NOT NULL DEFAULT 0,
  "feature" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "LlmTokenUsage_studentId_idx" ON "LlmTokenUsage" ("studentId");
CREATE INDEX IF NOT EXISTS "LlmTokenUsage_courseId_idx" ON "LlmTokenUsage" ("courseId");
CREATE INDEX IF NOT EXISTS "LlmTokenUsage_student_course_idx" ON "LlmTokenUsage" ("studentId", "courseId");
