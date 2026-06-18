-- Re-apply migration 0047's intent. 0047 (dated 2023) dropped the legacy
-- "lessonsCompleted" column from CourseEnrollment, but its journal timestamp is
-- far below the migration watermark, so Drizzle's migrator skipped it in prod.
-- The column is not in the Drizzle schema and in prod is NOT NULL without a
-- default, so every enrollment INSERT fails with 23502 (not-null violation),
-- breaking student signup. Dropping it is idempotent and safe.
ALTER TABLE "CourseEnrollment" DROP COLUMN IF EXISTS "lessonsCompleted";
