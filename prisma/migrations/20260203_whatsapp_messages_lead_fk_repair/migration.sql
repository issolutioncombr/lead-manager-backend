DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_messages' AND column_name = 'leadId'
  ) THEN
    ALTER TABLE "public"."whatsapp_messages" ADD COLUMN "leadId" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_messages' AND column_name = 'leadid'
  ) THEN
    ALTER TABLE "public"."whatsapp_messages" RENAME COLUMN leadid TO "leadId";
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE "public"."whatsapp_messages" DROP CONSTRAINT IF EXISTS "whatsapp_messages_leadId_fkey";
END $$;

DO $$ BEGIN
  ALTER TABLE "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS "whatsapp_messages_leadId_idx" ON "public"."whatsapp_messages" ("leadId");
END $$;
