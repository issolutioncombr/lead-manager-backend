UPDATE "agent_prompt_library"
SET "prompt_category_id" = 'pc_default'
WHERE "prompt_category_id" IS NULL;

UPDATE "agent_prompt_library"
SET "name" = 'Prompt ' || "id"
WHERE "name" IS NULL OR btrim("name") = '';

ALTER TABLE "agent_prompt_library" DROP CONSTRAINT IF EXISTS "agent_prompt_library_prompt_category_id_fkey";

ALTER TABLE "agent_prompt_library" ALTER COLUMN "prompt_category_id" SET NOT NULL;
ALTER TABLE "agent_prompt_library" ALTER COLUMN "name" SET NOT NULL;

ALTER TABLE "agent_prompt_library"
ADD CONSTRAINT "agent_prompt_library_prompt_category_id_fkey"
FOREIGN KEY ("prompt_category_id") REFERENCES "prompt_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

