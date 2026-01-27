-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN     "addressingMode" TEXT,
ADD COLUMN     "participant" TEXT,
ADD COLUMN     "recipientTimestamp" BIGINT,
ADD COLUMN     "remoteJidAlt" TEXT,
ADD COLUMN     "sender" TEXT,
ADD COLUMN     "senderTimestamp" BIGINT;
