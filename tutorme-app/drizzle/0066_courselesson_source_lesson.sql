-- CourseLesson.sourceLessonId: the template lesson a published-variant lesson was
--   copied from at publish time. Lets published lessons correlate back to their
--   template lesson by a stable id instead of by `order` (which breaks when the
--   tutor reorders lessons). Null on template rows and on pre-existing rows until
--   backfilled (see startup-cleanup backfill, matched by order).
-- Nullable, no FK (soft reference); idempotent (also applied via startup-schema-fix
-- so a revision that skips migrations still gets it before serving traffic).
ALTER TABLE "CourseLesson" ADD COLUMN IF NOT EXISTS "sourceLessonId" text;
