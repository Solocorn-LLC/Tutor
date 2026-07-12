-- Per-tutor buffer (minutes) enforced around 1-on-1 bookings in conflict detection.
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "bufferMinutes" integer;
