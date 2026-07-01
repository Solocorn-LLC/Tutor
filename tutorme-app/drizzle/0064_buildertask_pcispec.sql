-- BuilderTask.pciSpec: the structured PCI spec (TASK-6) finalized in the builder,
-- persisted at deploy so the live tutor can apply it during student interaction.
-- Nullable JSONB — only present once a tutor finalizes a structured spec.
-- Tutor-only evaluation layer; never broadcast to students. Idempotent: a no-op
-- where the column already exists (also applied via startup-schema-fix.ts so a
-- revision that skips migrations still has the column before it serves traffic).
ALTER TABLE "BuilderTask" ADD COLUMN IF NOT EXISTS "pciSpec" jsonb;
