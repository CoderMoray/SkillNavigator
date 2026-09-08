ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "review_status" text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "review_failed_stages" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "review_failed_message" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_versions_review_status_idx" ON "skill_versions" USING btree ("skill_slug", "review_status");--> statement-breakpoint
UPDATE "skill_versions" AS sv
SET
  "review_status" = s."review_status",
  "review_failed_stages" = s."review_failed_stages",
  "review_failed_message" = s."review_failed_message"
FROM "skills" AS s
WHERE sv."skill_slug" = s."slug"
  AND sv."version" = s."latest_version";--> statement-breakpoint
UPDATE "skill_versions" AS sv
SET "review_status" = 'failed'
WHERE sv."review_status" = 'completed'
  AND sv."published" = false
  AND sv."status" = 'rejected'
  AND NOT EXISTS (
    SELECT 1 FROM "skills" AS s
    WHERE s."slug" = sv."skill_slug"
      AND s."latest_version" = sv."version"
  );
