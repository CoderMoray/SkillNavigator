-- Rename review tables and columns to inspection terminology.

ALTER TABLE "skill_reviews" RENAME TO "skill_inspections";--> statement-breakpoint
ALTER TABLE "skill_review_findings" RENAME TO "skill_inspection_findings";--> statement-breakpoint

ALTER TABLE "skill_inspections" RENAME COLUMN "review_id" TO "inspection_id";--> statement-breakpoint

ALTER INDEX "skill_reviews_pkey" RENAME TO "skill_inspections_pkey";--> statement-breakpoint
ALTER INDEX "skill_review_findings_pkey" RENAME TO "skill_inspection_findings_pkey";--> statement-breakpoint

ALTER TABLE "skills" RENAME COLUMN "review_status" TO "inspection_status";--> statement-breakpoint
ALTER TABLE "skills" RENAME COLUMN "review_failed_stages" TO "inspection_failed_stages";--> statement-breakpoint
ALTER TABLE "skills" RENAME COLUMN "review_failed_message" TO "inspection_failed_message";--> statement-breakpoint
ALTER TABLE "skills" RENAME COLUMN "review_completed_stages" TO "inspection_completed_stages";--> statement-breakpoint
ALTER TABLE "skills" RENAME COLUMN "review_started_at" TO "inspection_started_at";--> statement-breakpoint
ALTER TABLE "skills" RENAME COLUMN "review_ended_at" TO "inspection_ended_at";--> statement-breakpoint

ALTER INDEX "skills_review_status_idx" RENAME TO "skills_inspection_status_idx";--> statement-breakpoint

ALTER TABLE "skill_versions" RENAME COLUMN "review_status" TO "inspection_status";--> statement-breakpoint
ALTER TABLE "skill_versions" RENAME COLUMN "review_failed_stages" TO "inspection_failed_stages";--> statement-breakpoint
ALTER TABLE "skill_versions" RENAME COLUMN "review_failed_message" TO "inspection_failed_message";--> statement-breakpoint
ALTER TABLE "skill_versions" RENAME COLUMN "review_completed_stages" TO "inspection_completed_stages";--> statement-breakpoint
ALTER TABLE "skill_versions" RENAME COLUMN "review_started_at" TO "inspection_started_at";--> statement-breakpoint
ALTER TABLE "skill_versions" RENAME COLUMN "review_ended_at" TO "inspection_ended_at";--> statement-breakpoint

ALTER INDEX "skill_versions_review_status_idx" RENAME TO "skill_versions_inspection_status_idx";--> statement-breakpoint

UPDATE "skills" SET "inspection_status" = 'inspecting' WHERE "inspection_status" = 'reviewing';--> statement-breakpoint
UPDATE "skill_versions" SET "inspection_status" = 'inspecting' WHERE "inspection_status" = 'reviewing';--> statement-breakpoint

UPDATE "skill_versions" SET "status" = 'needs-inspection' WHERE "status" = 'needs-review';--> statement-breakpoint
UPDATE "skill_inspections" SET "verdict" = 'needs-inspection' WHERE "verdict" = 'needs-review';
