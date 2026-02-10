-- CreateTable
CREATE TABLE "agent_prompt_library" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "prompt" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_prompt_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evolution_instance_agent_prompts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "evolution_instance_id" TEXT NOT NULL,
    "agent_prompt_id" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "evolution_instance_agent_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_prompt_library_userId_idx" ON "agent_prompt_library"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "evolution_instance_agent_prompts_evolution_instance_id_agent_prompt_id_key" ON "evolution_instance_agent_prompts"("evolution_instance_id", "agent_prompt_id");

-- CreateIndex
CREATE INDEX "evolution_instance_agent_prompts_userId_idx" ON "evolution_instance_agent_prompts"("userId");

-- CreateIndex
CREATE INDEX "evolution_instance_agent_prompts_evolution_instance_id_idx" ON "evolution_instance_agent_prompts"("evolution_instance_id");

-- AddForeignKey
ALTER TABLE "agent_prompt_library" ADD CONSTRAINT "agent_prompt_library_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolution_instance_agent_prompts" ADD CONSTRAINT "evolution_instance_agent_prompts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolution_instance_agent_prompts" ADD CONSTRAINT "evolution_instance_agent_prompts_evolution_instance_id_fkey" FOREIGN KEY ("evolution_instance_id") REFERENCES "EvolutionInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolution_instance_agent_prompts" ADD CONSTRAINT "evolution_instance_agent_prompts_agent_prompt_id_fkey" FOREIGN KEY ("agent_prompt_id") REFERENCES "agent_prompt_library"("id") ON DELETE CASCADE ON UPDATE CASCADE;

