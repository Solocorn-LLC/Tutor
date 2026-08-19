DROP INDEX "TaskSubmission_taskId_studentId_key";--> statement-breakpoint
ALTER TABLE "TaskSubmission" ADD COLUMN "sessionId" text;--> statement-breakpoint
ALTER TABLE "DeployedMaterial" ADD CONSTRAINT "DeployedMaterial_lessonId_CourseLesson_id_fk" FOREIGN KEY ("lessonId") REFERENCES "public"."CourseLesson"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "TaskSubmission_sessionId_idx" ON "TaskSubmission" USING btree ("sessionId");--> statement-breakpoint
CREATE UNIQUE INDEX "TaskSubmission_taskId_studentId_noSession_key" ON "TaskSubmission" USING btree ("taskId","studentId") WHERE "TaskSubmission"."sessionId" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "TaskSubmission_sessionId_taskId_studentId_key" ON "TaskSubmission" USING btree ("sessionId","taskId","studentId") WHERE "TaskSubmission"."sessionId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "DeployedMaterial_lessonId_idx" ON "DeployedMaterial" USING btree ("lessonId");--> statement-breakpoint
-- Remove duplicate (sessionId, itemId) rows before adding the unique index.
-- Keep the newest deployedAt row for each pair.
DELETE FROM "DeployedMaterial"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "sessionId", "itemId" ORDER BY "deployedAt" DESC
    ) AS rn
    FROM "DeployedMaterial"
  ) sub
  WHERE sub.rn > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "DeployedMaterial_sessionId_itemId_key" ON "DeployedMaterial" USING btree ("sessionId","itemId");