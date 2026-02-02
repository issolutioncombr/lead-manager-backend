CREATE TABLE "webhooks" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "instanceId" TEXT,
  "providerInstanceId" TEXT,
  "slotId" TEXT,
  "phoneRaw" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "webhooks_userId_receivedAt_idx" ON "webhooks"("userId", "receivedAt");
CREATE INDEX "webhooks_phoneRaw_idx" ON "webhooks"("phoneRaw");

ALTER TABLE "webhooks"
  ADD CONSTRAINT "webhooks_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
