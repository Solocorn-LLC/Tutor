ALTER TABLE "CourseLesson" ADD COLUMN IF NOT EXISTS "tasks" jsonb;
ALTER TABLE "CourseLesson" ADD COLUMN IF NOT EXISTS "assessments" jsonb;
ALTER TABLE "CourseLesson" ADD COLUMN IF NOT EXISTS "homework" jsonb;
ALTER TABLE "CourseLesson" ADD COLUMN IF NOT EXISTS "builderData" jsonb;
ALTER TABLE IF EXISTS "CurriculumModule" ADD COLUMN IF NOT EXISTS "builderData" jsonb;
