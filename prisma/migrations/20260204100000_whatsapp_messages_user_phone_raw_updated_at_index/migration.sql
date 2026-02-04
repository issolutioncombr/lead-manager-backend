-- CreateIndex
CREATE INDEX "whatsapp_messages_userId_phoneRaw_updatedAt_idx" ON "whatsapp_messages"("userId", "phoneRaw", "updatedAt");

