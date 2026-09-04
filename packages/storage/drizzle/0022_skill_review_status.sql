ALTER TABLE "skills" ADD COLUMN "review_status" text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
CREATE INDEX "skills_review_status_idx" ON "skills" USING btree ("review_status");
