-- Pending reschedule proposal fields for 1-on-1 bookings (propose → accept/decline).
ALTER TABLE "OneOnOneBookingRequest" ADD COLUMN IF NOT EXISTS "rescheduleProposedDate" timestamptz;
ALTER TABLE "OneOnOneBookingRequest" ADD COLUMN IF NOT EXISTS "rescheduleProposedStart" text;
ALTER TABLE "OneOnOneBookingRequest" ADD COLUMN IF NOT EXISTS "rescheduleProposedEnd" text;
ALTER TABLE "OneOnOneBookingRequest" ADD COLUMN IF NOT EXISTS "rescheduleProposedBy" text;
