-- Restore skill_inspections.verdict and skill_versions.status removed by 0029.

ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "status" text;--> statement-breakpoint
ALTER TABLE "skill_inspections" ADD COLUMN IF NOT EXISTS "verdict" text;--> statement-breakpoint

UPDATE "skill_versions"
SET "status" = CASE
  WHEN "inspection_status" = 'rejected' THEN 'rejected'
  WHEN "inspection_status" IN ('inspecting', 'interrupted') THEN 'needs-inspection'
  ELSE 'published'
END
WHERE "status" IS NULL;--> statement-breakpoint

UPDATE "skill_versions" AS sv
SET "status" = 'needs-inspection'
FROM "skill_inspections" AS si
WHERE si."skill_slug" = sv."skill_slug"
  AND si."version" = sv."version"
  AND sv."inspection_status" = 'completed'
  AND sv."status" = 'published'
  AND EXISTS (
    SELECT 1
    FROM "skill_inspection_findings" AS f
    WHERE f."skill_slug" = sv."skill_slug"
      AND f."version" = sv."version"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "skill_inspection_findings" AS f
    WHERE f."skill_slug" = sv."skill_slug"
      AND f."version" = sv."version"
      AND f."severity" IN ('high', 'critical')
      AND (
        f."finding_id" LIKE 'skillspector-%'
        OR f."finding_id" LIKE 'virustotal-%'
      )
  );--> statement-breakpoint

UPDATE "skill_versions" AS sv
SET "status" = 'rejected'
FROM "skill_inspection_findings" AS f
WHERE f."skill_slug" = sv."skill_slug"
  AND f."version" = sv."version"
  AND sv."inspection_status" = 'completed'
  AND f."severity" IN ('high', 'critical')
  AND (
    f."finding_id" LIKE 'skillspector-%'
    OR f."finding_id" LIKE 'virustotal-%'
  );--> statement-breakpoint

UPDATE "skill_versions"
SET "status" = COALESCE("status", 'needs-inspection')
WHERE "status" IS NULL;--> statement-breakpoint

UPDATE "skill_inspections" AS si
SET "verdict" = sv."status"
FROM "skill_versions" AS sv
WHERE si."skill_slug" = sv."skill_slug"
  AND si."version" = sv."version"
  AND si."verdict" IS NULL;--> statement-breakpoint

UPDATE "skill_inspections"
SET "verdict" = COALESCE("verdict", 'needs-inspection')
WHERE "verdict" IS NULL;--> statement-breakpoint

ALTER TABLE "skill_versions" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_inspections" ALTER COLUMN "verdict" SET NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "skill_versions_status_updated_at_idx"
  ON "skill_versions" USING btree ("status", "updated_at" DESC NULLS LAST);--> statement-breakpoint

DELETE FROM "_migrations"
WHERE "name" = '0029_remove_verdict_unify_inspection_status.sql';
