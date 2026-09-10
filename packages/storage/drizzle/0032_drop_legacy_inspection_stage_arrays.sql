ALTER TABLE "skill_versions" DROP COLUMN IF EXISTS "inspection_completed_stages";--> statement-breakpoint
ALTER TABLE "skill_versions" DROP COLUMN IF EXISTS "inspection_failed_stages";--> statement-breakpoint
ALTER TABLE "skills" DROP COLUMN IF EXISTS "inspection_completed_stages";--> statement-breakpoint
ALTER TABLE "skills" DROP COLUMN IF EXISTS "inspection_failed_stages";
