ALTER TABLE "TaskSubmission" ADD COLUMN "whiteboard" text;--> statement-breakpoint
ALTER TABLE "TutorAsset" ADD COLUMN "deletedAt" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "TutorAsset_deletedAt_idx" ON "TutorAsset" USING btree ("deletedAt");