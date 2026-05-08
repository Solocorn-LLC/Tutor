-- Focused migration: Rename Curriculum tables to Course tables in production
-- Only operates on tables that exist

-- Step 1: Rename main tables
ALTER TABLE IF EXISTS "Curriculum" RENAME TO "Course";
ALTER TABLE IF EXISTS "CurriculumLesson" RENAME TO "CourseLesson";
ALTER TABLE IF EXISTS "CurriculumEnrollment" RENAME TO "CourseEnrollment";
ALTER TABLE IF EXISTS "CurriculumProgress" RENAME TO "CourseProgress";
ALTER TABLE IF EXISTS "CurriculumLessonProgress" RENAME TO "CourseLessonProgress";
ALTER TABLE IF EXISTS "CurriculumShare" RENAME TO "CourseShare";
ALTER TABLE IF EXISTS "CurriculumCatalog" RENAME TO "CourseCatalog";

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM (
      VALUES
        ('CourseLesson', 'curriculumId', 'courseId'),
        ('CourseEnrollment', 'curriculumId', 'courseId'),
        ('CourseProgress', 'curriculumId', 'courseId'),
        ('CourseShare', 'curriculumId', 'courseId'),
        ('LiveSession', 'curriculumId', 'courseId')
    ) AS t(tbl, from_col, to_col)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = r.tbl AND column_name = r.from_col
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = r.tbl AND column_name = r.to_col
    ) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', r.tbl, r.from_col, r.to_col);
    END IF;
  END LOOP;
END $$;

-- Step 7: Update indexes
DROP INDEX IF EXISTS "Curriculum_isPublished_idx";
DROP INDEX IF EXISTS "Curriculum_creatorId_idx";
CREATE INDEX IF NOT EXISTS "Course_isPublished_idx" ON "Course"("isPublished");
CREATE INDEX IF NOT EXISTS "Course_creatorId_idx" ON "Course"("creatorId");

DROP INDEX IF EXISTS "CurriculumLesson_curriculumId_idx";
CREATE INDEX IF NOT EXISTS "CourseLesson_courseId_idx" ON "CourseLesson"("courseId");

DROP INDEX IF EXISTS "CurriculumEnrollment_studentId_idx";
DROP INDEX IF EXISTS "CurriculumEnrollment_studentId_curriculumId_key";
CREATE INDEX IF NOT EXISTS "CourseEnrollment_studentId_idx" ON "CourseEnrollment"("studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "CourseEnrollment_studentId_courseId_key" ON "CourseEnrollment"("studentId", "courseId");

DROP INDEX IF EXISTS "LiveSession_curriculumId_idx";
CREATE INDEX IF NOT EXISTS "LiveSession_courseId_idx" ON "LiveSession"("courseId");
