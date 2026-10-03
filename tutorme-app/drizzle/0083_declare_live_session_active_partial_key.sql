-- Declares the partial unique index in the Drizzle schema (src/lib/db/schema/tables/live.ts)
-- so `drizzle-kit push` keeps it instead of dropping it. The index already exists in
-- production, created by the hand-written migration 0040_prevent_double_booking.sql,
-- hence IF NOT EXISTS: applying this migration there is a no-op, while fresh databases
-- get the same definition.
CREATE UNIQUE INDEX IF NOT EXISTS "LiveSession_tutorId_scheduledAt_active_key" ON "LiveSession" USING btree ("tutorId","scheduledAt") WHERE "scheduledAt" IS NOT NULL AND "status" IN ('scheduled', 'active', 'preparing', 'live', 'paused');
