-- Create enums if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WhatsappMessageStatus') THEN
    CREATE TYPE "WhatsappMessageStatus" AS ENUM ('QUEUED','SENT','DELIVERED','READ','FAILED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WhatsappMessageDirection') THEN
    CREATE TYPE "WhatsappMessageDirection" AS ENUM ('INBOUND','OUTBOUND');
  END IF;
END $$;

-- Add columns if not exists
ALTER TABLE "whatsapp_messages"
  ADD COLUMN IF NOT EXISTS "deliveryStatus" "WhatsappMessageStatus",
  ADD COLUMN IF NOT EXISTS "direction" "WhatsappMessageDirection",
  ADD COLUMN IF NOT EXISTS "mediaUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "caption" TEXT;

-- Add index on createdAt if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'whatsapp_messages_createdAt_idx' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX "whatsapp_messages_createdAt_idx" ON "whatsapp_messages" ("createdAt");
  END IF;
END $$;
