-- Fix missing defaults on TutorApplication columns
-- These columns were added by migration 0032 but may have lost their defaults
-- during a schema sync or manual alteration.

ALTER TABLE "TutorApplication" ALTER COLUMN "tutoringCountries" SET DEFAULT '{}';
ALTER TABLE "TutorApplication" ALTER COLUMN "countrySubjectSelections" SET DEFAULT '{}'::jsonb;
ALTER TABLE "TutorApplication" ALTER COLUMN "categories" SET DEFAULT '{}';

-- Also fix any existing rows that currently have NULL values
UPDATE "TutorApplication" SET "tutoringCountries" = '{}' WHERE "tutoringCountries" IS NULL;
UPDATE "TutorApplication" SET "countrySubjectSelections" = '{}'::jsonb WHERE "countrySubjectSelections" IS NULL;
UPDATE "TutorApplication" SET "categories" = '{}' WHERE "categories" IS NULL;
