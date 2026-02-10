-- CreateTable
CREATE TABLE "agent_prompt_dispatch_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "evolution_instance_id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "phone_raw" TEXT NOT NULL,
    "agent_prompt_id" TEXT,
    "prompt_name" TEXT,
    "percent_bps" INTEGER,
    "assigned_by" TEXT NOT NULL,
    "wamid" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_prompt_dispatch_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_prompt_dispatch_logs_userId_occurred_at_idx" ON "agent_prompt_dispatch_logs"("userId", "occurred_at");

-- CreateIndex
CREATE INDEX "agent_prompt_dispatch_logs_evolution_instance_id_occurred_at_idx" ON "agent_prompt_dispatch_logs"("evolution_instance_id", "occurred_at");

-- CreateIndex
CREATE INDEX "agent_prompt_dispatch_logs_phone_raw_idx" ON "agent_prompt_dispatch_logs"("phone_raw");

-- AddForeignKey
ALTER TABLE "agent_prompt_dispatch_logs" ADD CONSTRAINT "agent_prompt_dispatch_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_prompt_dispatch_logs" ADD CONSTRAINT "agent_prompt_dispatch_logs_evolution_instance_id_fkey" FOREIGN KEY ("evolution_instance_id") REFERENCES "EvolutionInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_prompt_dispatch_logs" ADD CONSTRAINT "agent_prompt_dispatch_logs_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_prompt_dispatch_logs" ADD CONSTRAINT "agent_prompt_dispatch_logs_agent_prompt_id_fkey" FOREIGN KEY ("agent_prompt_id") REFERENCES "agent_prompt_library"("id") ON DELETE SET NULL ON UPDATE CASCADE;

