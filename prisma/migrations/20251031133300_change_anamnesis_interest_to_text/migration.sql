-- AlterTable: change interest from INTEGER to TEXT (safe if not set)
ALTER TABLE "AnamnesisRecord" ALTER COLUMN "interest" TYPE TEXT USING "interest"::text;

