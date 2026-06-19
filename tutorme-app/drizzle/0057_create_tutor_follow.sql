-- Create the TutorFollow table. The original 0010_tutor_follow migration is an
-- empty placeholder (the real DDL was archived), and 0032 only ALTERs the table,
-- so on the active migration chain "TutorFollow" was never created — every
-- follow/unfollow INSERT 500s with relation "TutorFollow" does not exist.
-- Idempotent so it's safe on databases where the table somehow already exists.
CREATE TABLE IF NOT EXISTS "TutorFollow" (
  "followId" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "followerId" text NOT NULL,
  "tutorId" text NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "TutorFollow"
    ADD CONSTRAINT "TutorFollow_followerId_User_id_fk"
    FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TutorFollow"
    ADD CONSTRAINT "TutorFollow_tutorId_User_id_fk"
    FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "TutorFollow_followerId_idx" ON "TutorFollow" ("followerId");
CREATE INDEX IF NOT EXISTS "TutorFollow_tutorId_idx" ON "TutorFollow" ("tutorId");
CREATE UNIQUE INDEX IF NOT EXISTS "TutorFollow_follower_tutor_key" ON "TutorFollow" ("followerId", "tutorId");
