CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "platform_users"("id") ON DELETE CASCADE,
  "name" text DEFAULT '' NOT NULL,
  "key_hash" text NOT NULL UNIQUE,
  "key_prefix" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone,
  "last_used_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "api_keys_user_id_idx" ON "api_keys" ("user_id");
