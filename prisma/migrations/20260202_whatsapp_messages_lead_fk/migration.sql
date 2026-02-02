ALTER TABLE "whatsapp_messages"
  ADD COLUMN "leadId" TEXT;

ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "whatsapp_messages_leadId_idx" ON "whatsapp_messages" ("leadId");
