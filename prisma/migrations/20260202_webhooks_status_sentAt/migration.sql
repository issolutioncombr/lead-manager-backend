ALTER TABLE "webhooks" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'received';
ALTER TABLE "webhooks" ADD COLUMN "sentAt" TIMESTAMP(3);
