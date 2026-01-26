/*
  Warnings:

  - The values [NEW,CONTACTED,QUALIFIED,PROPOSAL,WON,LOST] on the enum `LeadStage` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `clientId` on the `Lead` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "LeadStage_new" AS ENUM ('Novo', 'Contactado', 'Retornou o contato', 'Agendou uma call');
ALTER TABLE "Lead" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "Lead" ALTER COLUMN "stage" TYPE "LeadStage_new" USING ("stage"::text::"LeadStage_new");
ALTER TYPE "LeadStage" RENAME TO "LeadStage_old";
ALTER TYPE "LeadStage_new" RENAME TO "LeadStage";
DROP TYPE "LeadStage_old";
ALTER TABLE "Lead" ALTER COLUMN "stage" SET DEFAULT 'Novo';
COMMIT;

-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_clientId_fkey";

-- DropIndex
DROP INDEX "Lead_clientId_idx";

-- AlterTable
ALTER TABLE "Lead" DROP COLUMN "clientId",
ADD COLUMN     "contact" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "name" TEXT,
ALTER COLUMN "stage" SET DEFAULT 'Novo';
