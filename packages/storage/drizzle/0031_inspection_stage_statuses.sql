ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "inspection_skillspector_status" text;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "inspection_virustotal_status" text;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "inspection_halucatch_status" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "inspection_skillspector_status" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "inspection_virustotal_status" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "inspection_halucatch_status" text;--> statement-breakpoint
UPDATE "skill_versions" sv
SET
  "inspection_skillspector_status" = CASE
    WHEN 'skillspector' = ANY (sv."inspection_failed_stages") THEN 'interrupted'
    WHEN 'skillspector' = ANY (sv."inspection_completed_stages") THEN CASE
      WHEN EXISTS (
        SELECT 1
        FROM "skill_inspection_findings" f
        WHERE f."skill_slug" = sv."skill_slug"
          AND f."version" = sv."version"
          AND f."finding_id" LIKE 'skillspector-%'
          AND f."finding_id" <> 'skillspector-unavailable'
          AND f."severity" IN ('critical', 'high')
      ) THEN 'rejected'
      ELSE 'passed'
    END
    WHEN sv."inspection_status" = 'inspecting' THEN 'processing'
    ELSE NULL
  END,
  "inspection_virustotal_status" = CASE
    WHEN 'virustotal' = ANY (sv."inspection_failed_stages") THEN 'interrupted'
    WHEN 'virustotal' = ANY (sv."inspection_completed_stages") THEN CASE
      WHEN EXISTS (
        SELECT 1
        FROM "skill_inspection_findings" f
        WHERE f."skill_slug" = sv."skill_slug"
          AND f."version" = sv."version"
          AND f."finding_id" LIKE 'virustotal-%'
          AND f."severity" IN ('critical', 'high')
      ) THEN 'rejected'
      ELSE 'passed'
    END
    WHEN sv."inspection_status" = 'inspecting' THEN 'processing'
    ELSE NULL
  END,
  "inspection_halucatch_status" = CASE
    WHEN 'halucatch' = ANY (sv."inspection_failed_stages") THEN 'interrupted'
    WHEN 'halucatch' = ANY (sv."inspection_completed_stages")
      AND EXISTS (
        SELECT 1
        FROM "skill_evaluations" e
        WHERE e."skill_slug" = sv."skill_slug"
          AND e."version" = sv."version"
      ) THEN 'done'
    WHEN sv."inspection_status" = 'inspecting' THEN 'processing'
    ELSE NULL
  END
WHERE sv."inspection_skillspector_status" IS NULL
  AND sv."inspection_virustotal_status" IS NULL
  AND sv."inspection_halucatch_status" IS NULL;--> statement-breakpoint
UPDATE "skills" s
SET
  "inspection_skillspector_status" = v."inspection_skillspector_status",
  "inspection_virustotal_status" = v."inspection_virustotal_status",
  "inspection_halucatch_status" = v."inspection_halucatch_status"
FROM "skill_versions" v
WHERE v."skill_slug" = s."slug"
  AND v."version" = s."latest_version";
