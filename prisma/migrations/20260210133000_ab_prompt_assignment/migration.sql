-- AB distribution now uses basis points (percent * 100)
UPDATE "evolution_instance_agent_prompts"
SET "percent" = "percent" * 100
WHERE "percent" <= 100;

-- CreateTable
CREATE TABLE "evolution_instance_prompt_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "evolution_instance_id" TEXT NOT NULL,
    "phone_raw" TEXT NOT NULL,
    "agent_prompt_id" TEXT NOT NULL,
    "assigned_by" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "evolution_instance_prompt_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evolution_instance_prompt_assignments_evolution_instance_id_phone_raw_key" ON "evolution_instance_prompt_assignments"("evolution_instance_id", "phone_raw");

-- CreateIndex
CREATE INDEX "evolution_instance_prompt_assignments_userId_phone_raw_idx" ON "evolution_instance_prompt_assignments"("userId", "phone_raw");

-- CreateIndex
CREATE INDEX "evolution_instance_prompt_assignments_evolution_instance_id_idx" ON "evolution_instance_prompt_assignments"("evolution_instance_id");

-- AddForeignKey
ALTER TABLE "evolution_instance_prompt_assignments" ADD CONSTRAINT "evolution_instance_prompt_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolution_instance_prompt_assignments" ADD CONSTRAINT "evolution_instance_prompt_assignments_evolution_instance_id_fkey" FOREIGN KEY ("evolution_instance_id") REFERENCES "EvolutionInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolution_instance_prompt_assignments" ADD CONSTRAINT "evolution_instance_prompt_assignments_agent_prompt_id_fkey" FOREIGN KEY ("agent_prompt_id") REFERENCES "agent_prompt_library"("id") ON DELETE CASCADE ON UPDATE CASCADE;

