-- Add slotId column to whatsapp_messages (nullable) and index
ALTER TABLE "whatsapp_messages" ADD COLUMN "slotId" TEXT;
CREATE INDEX "whatsapp_messages_slotId_idx" ON "whatsapp_messages"("slotId");

-- Create whatsapp_phone_instance table to map phone -> instance/slot/webhook
CREATE TABLE "whatsapp_phone_instance" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "phoneRaw" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "providerInstanceId" TEXT,
  "slotId" TEXT,
  "webhookUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique and lookup indexes
CREATE UNIQUE INDEX "whatsapp_phone_instance_phoneRaw_key" ON "whatsapp_phone_instance"("phoneRaw");
CREATE INDEX "whatsapp_phone_instance_userId_idx" ON "whatsapp_phone_instance"("userId");

-- FK to User(id) with cascade delete
ALTER TABLE "whatsapp_phone_instance"
  ADD CONSTRAINT "whatsapp_phone_instance_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
