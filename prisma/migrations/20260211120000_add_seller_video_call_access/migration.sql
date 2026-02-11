-- CreateEnum
CREATE TYPE "SellerAccessStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "seller_video_call_access" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "status" "SellerAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_video_call_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seller_video_call_access_seller_id_appointment_id_key" ON "seller_video_call_access"("seller_id", "appointment_id");

-- CreateIndex
CREATE INDEX "seller_video_call_access_seller_id_status_idx" ON "seller_video_call_access"("seller_id", "status");

-- CreateIndex
CREATE INDEX "seller_video_call_access_lead_id_status_idx" ON "seller_video_call_access"("lead_id", "status");

-- AddForeignKey
ALTER TABLE "seller_video_call_access" ADD CONSTRAINT "seller_video_call_access_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_video_call_access" ADD CONSTRAINT "seller_video_call_access_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_video_call_access" ADD CONSTRAINT "seller_video_call_access_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

