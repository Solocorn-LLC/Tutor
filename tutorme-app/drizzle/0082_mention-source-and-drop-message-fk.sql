ALTER TABLE "Mention" DROP CONSTRAINT IF EXISTS "Mention_messageId_Message_id_fk";
--> statement-breakpoint
ALTER TABLE "Mention" ADD COLUMN "source" text DEFAULT 'direct' NOT NULL;