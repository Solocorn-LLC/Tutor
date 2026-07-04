-- Lesson linkage for live sessions + deployed material.
-- LiveSession.lessonId: which lesson a scheduled session covers (its lesson-plan
--   slot) — lets the live view auto-load the right lesson and the Desk group by it.
-- DeployedMaterial.lessonId: which lesson a deployed task/assessment came from, so
--   submissions group under the real lesson instead of always "Lesson 1".
-- Both nullable; idempotent (also applied via startup-schema-fix so a revision
-- that skips migrations still gets them before serving traffic).
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "lessonId" text;
ALTER TABLE "DeployedMaterial" ADD COLUMN IF NOT EXISTS "lessonId" text;
