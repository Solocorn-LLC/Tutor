-- Link a materialized LiveSession back to the CourseSchedule it was generated from.
-- Previously there was no schedule->session linkage, so re-publish relied on a
-- time-overlap heuristic and sessions could not be traced to their schedule.
-- Nullable (ad-hoc / 1:1 sessions have no schedule); FK set null on schedule delete.
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "scheduleId" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "LiveSession"
    ADD CONSTRAINT "LiveSession_scheduleId_CourseSchedule_id_fk"
    FOREIGN KEY ("scheduleId") REFERENCES "CourseSchedule"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "LiveSession_scheduleId_idx" ON "LiveSession"("scheduleId");
