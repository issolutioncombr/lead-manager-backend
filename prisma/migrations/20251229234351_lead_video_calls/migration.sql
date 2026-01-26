/*
  Warnings:

  - You are about to drop the column `clientId` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `procedure` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `clientId` on the `Payment` table. All the data in the column will be lost.
  - Added the required column `leadId` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `leadId` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_clientId_fkey";

-- DropIndex
DROP INDEX "Appointment_clientId_idx";

-- DropIndex
DROP INDEX "Payment_clientId_idx";

-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "clientId",
DROP COLUMN "procedure",
ADD COLUMN     "leadId" TEXT NOT NULL,
ADD COLUMN     "meetLink" TEXT;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "clientId",
ADD COLUMN     "leadId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Appointment_leadId_idx" ON "Appointment"("leadId");

-- CreateIndex
CREATE INDEX "Payment_leadId_idx" ON "Payment"("leadId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
