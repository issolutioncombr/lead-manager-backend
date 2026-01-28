ALTER TABLE "whatsapp_messages"
ADD COLUMN     "destination" TEXT,
ADD COLUMN     "serverUrl" TEXT,
ADD COLUMN     "executionMode" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "eventType" TEXT;

