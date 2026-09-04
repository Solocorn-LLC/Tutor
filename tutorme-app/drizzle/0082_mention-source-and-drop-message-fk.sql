ALTER TABLE "Mention" DROP CONSTRAINT "Mention_messageId_Message_id_fk";
--> statement-breakpoint
ALTER TABLE "Mention" ADD COLUMN "source" text DEFAULT 'direct' NOT NULL;