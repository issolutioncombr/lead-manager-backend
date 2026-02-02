-- Add missing columns to "User" to align database with current Prisma schema
-- Safe two-step for NOT NULL booleans: add as nullable with default, backfill, then enforce NOT NULL

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'companyName'
  ) THEN
    ALTER TABLE "User" ADD COLUMN "companyName" TEXT;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'isApproved'
  ) THEN
    ALTER TABLE "User" ADD COLUMN "isApproved" BOOLEAN;
    UPDATE "User" SET "isApproved" = false WHERE "isApproved" IS NULL;
    ALTER TABLE "User" ALTER COLUMN "isApproved" SET DEFAULT false;
    ALTER TABLE "User" ALTER COLUMN "isApproved" SET NOT NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'isAdmin'
  ) THEN
    ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN;
    UPDATE "User" SET "isAdmin" = false WHERE "isAdmin" IS NULL;
    ALTER TABLE "User" ALTER COLUMN "isAdmin" SET DEFAULT false;
    ALTER TABLE "User" ALTER COLUMN "isAdmin" SET NOT NULL;
  END IF;
END$$;
