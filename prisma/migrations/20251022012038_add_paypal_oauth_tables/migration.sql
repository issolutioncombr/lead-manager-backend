-- CreateTable
CREATE TABLE "PaypalAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paypalPayerId" TEXT,
    "merchantId" TEXT,
    "businessName" TEXT,
    "email" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenType" TEXT,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "rawTokens" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaypalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaypalOAuthState" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "PaypalOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaypalAccount_userId_key" ON "PaypalAccount"("userId");

-- CreateIndex
CREATE INDEX "PaypalAccount_paypalPayerId_idx" ON "PaypalAccount"("paypalPayerId");

-- CreateIndex
CREATE INDEX "PaypalAccount_merchantId_idx" ON "PaypalAccount"("merchantId");

-- CreateIndex
CREATE INDEX "PaypalAccount_email_idx" ON "PaypalAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PaypalOAuthState_state_key" ON "PaypalOAuthState"("state");

-- CreateIndex
CREATE INDEX "PaypalOAuthState_userId_idx" ON "PaypalOAuthState"("userId");

-- CreateIndex
CREATE INDEX "PaypalOAuthState_expiresAt_idx" ON "PaypalOAuthState"("expiresAt");

-- AddForeignKey
ALTER TABLE "PaypalAccount" ADD CONSTRAINT "PaypalAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaypalOAuthState" ADD CONSTRAINT "PaypalOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
