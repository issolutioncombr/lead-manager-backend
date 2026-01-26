-- Add must_change_password flag to enforce first login password updates
ALTER TABLE "sellers" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT true;

UPDATE "sellers" SET "must_change_password" = true WHERE "must_change_password" IS NULL;
