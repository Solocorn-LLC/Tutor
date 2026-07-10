-- TaskSubmission.workedSolutions: cached AI worked solutions keyed by questionId
--   ({ [questionId]: string }), so a solution the student already viewed is reused
--   instead of re-running the model. Nullable; idempotent (also applied via
--   startup-schema-fix so a revision that skips migrations still gets it).
ALTER TABLE "TaskSubmission" ADD COLUMN IF NOT EXISTS "workedSolutions" jsonb;
