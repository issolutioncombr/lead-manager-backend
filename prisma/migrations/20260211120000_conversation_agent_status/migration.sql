-- Enum for conversation agent status
DO $$ BEGIN
  CREATE TYPE "ConversationAgentStatus" AS ENUM ('ATIVO','PAUSADO','DESATIVADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create whatsapp_conversation_agent_status
CREATE TABLE IF NOT EXISTS "whatsapp_conversation_agent_status" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "instance_number" TEXT NOT NULL,
  "contact_number" TEXT NOT NULL,
  "status" "ConversationAgentStatus" NOT NULL DEFAULT 'ATIVO',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FKs and indexes
DO $$ BEGIN
  ALTER TABLE "whatsapp_conversation_agent_status"
    ADD CONSTRAINT "whatsapp_conversation_agent_status_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_conversation_agent_status_unique"
  ON "whatsapp_conversation_agent_status" ("userId","instance_number","contact_number");

CREATE INDEX IF NOT EXISTS "whatsapp_conversation_agent_status_user_instance_idx"
  ON "whatsapp_conversation_agent_status" ("userId","instance_number");

CREATE INDEX IF NOT EXISTS "whatsapp_conversation_agent_status_user_contact_idx"
  ON "whatsapp_conversation_agent_status" ("userId","contact_number");
