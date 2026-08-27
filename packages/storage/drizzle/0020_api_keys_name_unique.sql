UPDATE "api_keys"
SET "name" = 'Key ' || substr("id", 1, 8)
WHERE trim("name") = '';

WITH "ranked" AS (
  SELECT
    "id",
    "name",
    row_number() OVER (PARTITION BY "user_id", lower("name") ORDER BY "created_at", "id") AS "rn"
  FROM "api_keys"
)
UPDATE "api_keys" AS "keys"
SET "name" = "ranked"."name" || ' (' || "ranked"."rn" || ')'
FROM "ranked"
WHERE "keys"."id" = "ranked"."id"
  AND "ranked"."rn" > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_user_id_name_lower_key" ON "api_keys" ("user_id", lower("name"));
