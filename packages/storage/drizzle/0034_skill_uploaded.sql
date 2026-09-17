ALTER TABLE "skills" ADD COLUMN "uploaded" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "uploaded" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "skill_versions"
SET "uploaded" = true
WHERE "content_hash" IS NOT NULL AND "content_hash" <> '';
--> statement-breakpoint
UPDATE "skills" s
SET "uploaded" = true
WHERE EXISTS (
  SELECT 1 FROM "skill_versions" v
  WHERE v."skill_slug" = s."slug" AND v."uploaded" = true
);
--> statement-breakpoint
UPDATE "skills"
SET "published" = false
WHERE "inspection_status" <> 'completed';
--> statement-breakpoint
UPDATE "skill_versions"
SET "published" = false
WHERE "inspection_status" <> 'completed';
