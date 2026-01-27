-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wamid" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "fromMe" BOOLEAN NOT NULL,
    "pushName" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "status" TEXT,
    "messageType" TEXT,
    "conversation" TEXT,
    "isAd" BOOLEAN NOT NULL DEFAULT false,
    "adTitle" TEXT,
    "adBody" TEXT,
    "adMediaType" INTEGER,
    "adThumbnailUrl" TEXT,
    "adSourceType" TEXT,
    "adSourceId" TEXT,
    "adSourceUrl" TEXT,
    "ctwaClid" TEXT,
    "ref" TEXT,
    "sourceApp" TEXT,
    "conversionSource" TEXT,
    "entryPointConversionSource" TEXT,
    "entryPointConversionApp" TEXT,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_wamid_key" ON "whatsapp_messages"("wamid");

-- CreateIndex
CREATE INDEX "whatsapp_messages_userId_idx" ON "whatsapp_messages"("userId");

-- CreateIndex
CREATE INDEX "whatsapp_messages_remoteJid_idx" ON "whatsapp_messages"("remoteJid");

-- CreateIndex
CREATE INDEX "whatsapp_messages_timestamp_idx" ON "whatsapp_messages"("timestamp");

-- CreateIndex
CREATE INDEX "whatsapp_messages_ctwaClid_idx" ON "whatsapp_messages"("ctwaClid");

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
