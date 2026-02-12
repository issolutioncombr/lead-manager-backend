-- CreateTable
CREATE TABLE "prompt_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "base_prompt" TEXT NOT NULL DEFAULT '',
    "admin_rules" TEXT,
    "tools" JSONB,
    "required_variables" JSONB,
    "variables" JSONB,
    "created_by_user_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prompt_categories_pkey" PRIMARY KEY ("id")
);

-- AddColumn
ALTER TABLE "agent_prompt_library" ADD COLUMN "prompt_category_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "prompt_categories_name_key" ON "prompt_categories"("name");

-- CreateIndex
CREATE INDEX "prompt_categories_created_by_user_id_idx" ON "prompt_categories"("created_by_user_id");

-- CreateIndex
CREATE INDEX "agent_prompt_library_prompt_category_id_idx" ON "agent_prompt_library"("prompt_category_id");

-- AddForeignKey
ALTER TABLE "prompt_categories" ADD CONSTRAINT "prompt_categories_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_prompt_library" ADD CONSTRAINT "agent_prompt_library_prompt_category_id_fkey" FOREIGN KEY ("prompt_category_id") REFERENCES "prompt_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default category and backfill existing prompts
INSERT INTO "prompt_categories" ("id", "name", "description", "active", "base_prompt", "createdAt", "updatedAt")
VALUES ('pc_default', 'Geral', 'Categoria padrão (legado)', true, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

UPDATE "agent_prompt_library"
SET "prompt_category_id" = 'pc_default'
WHERE "prompt_category_id" IS NULL;

