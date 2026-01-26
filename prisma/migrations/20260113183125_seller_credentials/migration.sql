/*
  Warnings:

  - You are about to drop the column `userId` on the `PasswordResetToken` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[email]` on the table `sellers` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `sellerId` to the `PasswordResetToken` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password` to the `sellers` table without a default value. This is not possible if the table is not empty.
  - Made the column `email` on table `sellers` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT "PasswordResetToken_userId_fkey";

-- DropIndex
DROP INDEX "PasswordResetToken_userId_idx";

-- AlterTable
ALTER TABLE "PasswordResetToken" DROP COLUMN "userId",
ADD COLUMN     "sellerId" TEXT;

-- Remove previous reset tokens since they can't be reassigned to sellers
DELETE FROM "PasswordResetToken";

ALTER TABLE "PasswordResetToken" ALTER COLUMN "sellerId" SET NOT NULL;

-- AlterTable
ALTER TABLE "sellers" ADD COLUMN     "password" TEXT,
ALTER COLUMN "email" SET NOT NULL;


UPDATE "sellers"
SET "password" = '$2b$10$s0gb0PPIFy1D8GH0SlNEy.kG8mEQqQtAx1OJbPtGAVu4ScTjJYyf6'; -- hash de 'changeme123'


ALTER TABLE "sellers" ALTER COLUMN "password" SET NOT NULL;


-- CreateIndex
CREATE INDEX "PasswordResetToken_sellerId_idx" ON "PasswordResetToken"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "sellers_email_key" ON "sellers"("email");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
