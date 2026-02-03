-- Enum for bot status
DO $$ BEGIN
  CREATE TYPE "BotStatus" AS ENUM ('ATIVO','PAUSADO','TRAVADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend whatsapp_phone_instance
ALTER TABLE "whatsapp_phone_instance"
  ADD COLUMN IF NOT EXISTS "botStatus" "BotStatus" DEFAULT 'ATIVO',
  ADD COLUMN IF NOT EXISTS "botTravarAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "botPausarAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "botReativarAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "botWebhookConfigId" TEXT;

-- Create webhook_configs
CREATE TABLE IF NOT EXISTS "webhook_configs" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "headers" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create bot_action_logs
CREATE TABLE IF NOT EXISTS "bot_action_logs" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "phoneInstanceId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "actorUserId" TEXT
);

-- FKs and indexes
DO $$ BEGIN
  ALTER TABLE "webhook_configs"
    ADD CONSTRAINT "webhook_configs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "webhook_configs_user_origin_idx"
  ON "webhook_configs" ("userId","origin");

DO $$ BEGIN
  ALTER TABLE "whatsapp_phone_instance"
    ADD CONSTRAINT "whatsapp_phone_instance_botWebhookConfigId_fkey"
    FOREIGN KEY ("botWebhookConfigId") REFERENCES "webhook_configs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "bot_action_logs"
    ADD CONSTRAINT "bot_action_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "bot_action_logs"
    ADD CONSTRAINT "bot_action_logs_phoneInstanceId_fkey"
    FOREIGN KEY ("phoneInstanceId") REFERENCES "whatsapp_phone_instance"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "bot_action_logs_user_idx" ON "bot_action_logs" ("userId");
CREATE INDEX IF NOT EXISTS "bot_action_logs_instance_ts_idx" ON "bot_action_logs" ("phoneInstanceId","timestamp");
