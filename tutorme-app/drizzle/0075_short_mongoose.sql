CREATE TABLE "TutorCourseFolder" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Course" ADD COLUMN "folder" text;--> statement-breakpoint
ALTER TABLE "TutorCourseFolder" ADD CONSTRAINT "TutorCourseFolder_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "TutorCourseFolder_userId_idx" ON "TutorCourseFolder" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "TutorCourseFolder_userId_name_key" ON "TutorCourseFolder" USING btree ("userId","name");--> statement-breakpoint
CREATE INDEX "Course_folder_idx" ON "Course" USING btree ("folder");