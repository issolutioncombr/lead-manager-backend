-- CreateTable
CREATE TABLE "seller_availability" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "day" "WeekDay" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "seller_availability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seller_availability_sellerId_day_idx" ON "seller_availability"("sellerId", "day");

-- AddForeignKey
ALTER TABLE "seller_availability" ADD CONSTRAINT "seller_availability_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
