-- User.status ('active' | 'suspended') for admin account-suspension.
-- It was previously created only via startup-schema-fix.ts (at server boot);
-- this applies it through the numbered-migration path too, so a fresh revision
-- has the column before it serves traffic (closing a brief sign-in window) and
-- so the schema is reproducible from migrations. Idempotent: a no-op where the
-- column already exists.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';
