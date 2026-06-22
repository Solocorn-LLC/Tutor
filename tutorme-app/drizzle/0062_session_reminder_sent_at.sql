-- Track when an upcoming-session reminder notification has been sent, so the
-- in-process reminder scheduler sends exactly one per session (race-safe).
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "reminderSentAt" timestamp with time zone;
