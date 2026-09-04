ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "review_completed_stages" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "review_completed_stages" text[] DEFAULT '{}' NOT NULL;
