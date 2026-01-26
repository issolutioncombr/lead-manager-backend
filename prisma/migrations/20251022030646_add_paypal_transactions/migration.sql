-- CreateTable
CREATE TABLE "PaypalTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "transactionId" TEXT NOT NULL,
    "status" TEXT,
    "eventCode" TEXT,
    "referenceId" TEXT,
    "invoiceId" TEXT,
    "customField" TEXT,
    "transactionDate" TIMESTAMP(3),
    "updatedDate" TIMESTAMP(3),
    "currency" TEXT,
    "grossAmount" DECIMAL(12,2),
    "feeAmount" DECIMAL(12,2),
    "netAmount" DECIMAL(12,2),
    "payerEmail" TEXT,
    "payerName" TEXT,
    "payerId" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaypalTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaypalTransaction_clientId_idx" ON "PaypalTransaction"("clientId");

-- CreateIndex
CREATE INDEX "PaypalTransaction_payerEmail_idx" ON "PaypalTransaction"("payerEmail");

-- CreateIndex
CREATE INDEX "PaypalTransaction_transactionDate_idx" ON "PaypalTransaction"("transactionDate");

-- CreateIndex
CREATE UNIQUE INDEX "PaypalTransaction_userId_transactionId_key" ON "PaypalTransaction"("userId", "transactionId");

-- AddForeignKey
ALTER TABLE "PaypalTransaction" ADD CONSTRAINT "PaypalTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaypalTransaction" ADD CONSTRAINT "PaypalTransaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
