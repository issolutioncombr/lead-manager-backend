-- CreateIndex
CREATE INDEX "whatsapp_messages_userId_phoneRaw_timestamp_idx" ON "whatsapp_messages"("userId", "phoneRaw", "timestamp");

