-- Align "TutorApplication" nullable columns with the Drizzle schema.
--
-- Production drifted to NOT NULL on these optional columns, which broke tutor
-- registration: legalName/middleName/certificate*/socialLinks are legitimately
-- null at signup, so the INSERT failed with 23502 (not-null violation) and the
-- whole registration transaction rolled back. The code schema declares all of
-- these nullable. DROP NOT NULL is idempotent (no error if already nullable).
ALTER TABLE "TutorApplication" ALTER COLUMN "legalName" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "TutorApplication" ALTER COLUMN "middleName" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "TutorApplication" ALTER COLUMN "certificateName" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "TutorApplication" ALTER COLUMN "certificateSubjects" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "TutorApplication" ALTER COLUMN "socialLinks" DROP NOT NULL;
