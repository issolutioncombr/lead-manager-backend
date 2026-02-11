ALTER TABLE "agent_prompt_library"
  ADD COLUMN IF NOT EXISTS "prompt_type" TEXT NOT NULL DEFAULT 'USER_RAW',
  ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "manual_config" JSONB,
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "agent_prompt_library_created_by_user_id_idx" ON "agent_prompt_library"("created_by_user_id");
CREATE INDEX IF NOT EXISTS "agent_prompt_library_user_id_prompt_type_idx" ON "agent_prompt_library"("user_id","prompt_type");

UPDATE "agent_prompt_library" l
SET "created_by_user_id" = NULL
WHERE l."created_by_user_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "User" u
    WHERE u."id" = l."created_by_user_id"
  );

ALTER TABLE "agent_prompt_library"
  DROP CONSTRAINT IF EXISTS "agent_prompt_library_created_by_user_id_fkey";

ALTER TABLE "agent_prompt_library"
  ADD CONSTRAINT "agent_prompt_library_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
