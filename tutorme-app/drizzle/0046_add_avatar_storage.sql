-- Custom migration: add AvatarStorage table for persistent avatar image data
CREATE TABLE IF NOT EXISTS "AvatarStorage" (
	"userId" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AvatarStorage_userId_idx" ON "AvatarStorage" USING btree ("userId");