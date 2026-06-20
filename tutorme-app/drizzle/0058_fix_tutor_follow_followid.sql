-- Make TutorFollow inserts work regardless of how the table drifted in prod.
-- The app inserts only (followerId, tutorId) and relies on the DB to fill
-- "followId" from its default. On the active migration chain the table came
-- from the archived 0010 (PK column "id") while 0032's "ADD COLUMN followId
-- PRIMARY KEY" couldn't apply (id was already PK), so "followId" ends up either
-- absent or without a default — and the INSERT 500s (missing column / not-null).
-- Ensure followId exists with a default + NOT NULL. Idempotent and non-PK-touching.
ALTER TABLE "TutorFollow" ADD COLUMN IF NOT EXISTS "followId" uuid;--> statement-breakpoint
UPDATE "TutorFollow" SET "followId" = gen_random_uuid() WHERE "followId" IS NULL;--> statement-breakpoint
ALTER TABLE "TutorFollow" ALTER COLUMN "followId" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "TutorFollow" ALTER COLUMN "followId" SET NOT NULL;
