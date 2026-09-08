-- Split legacy inspection_status "failed" into "interrupted" or "rejected".

UPDATE "skills"
SET "inspection_status" = 'interrupted'
WHERE "inspection_status" = 'failed'
  AND (
    "inspection_failed_message" LIKE '%中断%'
    OR "inspection_failed_message" LIKE '%超时%'
    OR "inspection_failed_message" LIKE '%取代%'
    OR "inspection_failed_message" LIKE '%未完成%'
    OR "inspection_failed_message" IS NULL
    OR "inspection_failed_message" = ''
  );--> statement-breakpoint

UPDATE "skills"
SET "inspection_status" = 'rejected'
WHERE "inspection_status" = 'failed';--> statement-breakpoint

UPDATE "skill_versions"
SET "inspection_status" = 'interrupted'
WHERE "inspection_status" = 'failed'
  AND (
    "inspection_failed_message" LIKE '%中断%'
    OR "inspection_failed_message" LIKE '%超时%'
    OR "inspection_failed_message" LIKE '%取代%'
    OR "inspection_failed_message" LIKE '%未完成%'
    OR "inspection_failed_message" IS NULL
    OR "inspection_failed_message" = ''
  );--> statement-breakpoint

UPDATE "skill_versions"
SET "inspection_status" = 'rejected'
WHERE "inspection_status" = 'failed';
