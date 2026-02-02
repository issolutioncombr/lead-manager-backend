-- Fix FK to correct table name and make operations idempotent
DO $$ BEGIN
  ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "leadId" TEXT;
END $$;

DO $$ BEGIN
  ALTER TABLE "whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX "whatsapp_messages_leadId_idx" ON "whatsapp_messages" ("leadId");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
