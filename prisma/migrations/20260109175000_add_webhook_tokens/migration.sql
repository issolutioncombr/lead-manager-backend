-- CreateTable
CREATE TABLE "webhook_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    CONSTRAINT "webhook_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "webhook_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_tokens_token_key" ON "webhook_tokens"("token");
