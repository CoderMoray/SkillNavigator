ALTER TABLE "skills" ADD COLUMN "review_failed_stages" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "review_failed_message" text;
