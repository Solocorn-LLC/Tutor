-- TaskSubmission.followUps: persisted follow-up Q&A between the student and the
--   PCI-scoped assistant on a graded assessment, so the tutor can see what was
--   asked and answered (and catch AI drift). Array of {questionId, question,
--   answer, at}. Nullable; idempotent (also applied via startup-schema-fix so a
--   revision that skips migrations still gets it before serving traffic).
ALTER TABLE "TaskSubmission" ADD COLUMN IF NOT EXISTS "followUps" jsonb;
