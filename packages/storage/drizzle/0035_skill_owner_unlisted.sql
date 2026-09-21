ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "owner_unlisted" boolean DEFAULT false NOT NULL;
