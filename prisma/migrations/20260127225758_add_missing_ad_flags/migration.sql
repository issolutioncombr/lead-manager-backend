-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN     "automatedGreetingMessageShown" BOOLEAN DEFAULT false,
ADD COLUMN     "containsAutoReply" BOOLEAN DEFAULT false,
ADD COLUMN     "greetingMessageBody" TEXT,
ADD COLUMN     "renderLargerThumbnail" BOOLEAN DEFAULT false,
ADD COLUMN     "showAdAttribution" BOOLEAN DEFAULT false,
ADD COLUMN     "wtwaAdFormat" BOOLEAN DEFAULT false;
