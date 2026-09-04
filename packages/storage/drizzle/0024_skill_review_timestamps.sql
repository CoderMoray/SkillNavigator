ALTER TABLE "skills" ADD COLUMN "uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "review_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "review_ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "review_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "review_ended_at" timestamp with time zone;
