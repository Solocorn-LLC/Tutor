-- Tutors can offer 1-on-1 sessions for free: booking skips payment and an
-- accepted request is confirmed immediately.
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "oneOnOneFree" boolean NOT NULL DEFAULT false;
