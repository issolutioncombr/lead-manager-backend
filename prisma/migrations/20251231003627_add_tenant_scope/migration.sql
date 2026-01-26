/*
  This migration introduces tenant scoping. Because the database already
  contains data, we add the new columns in three steps:
    1. add the column as nullable,
    2. backfill it with the current owner (first user),
    3. enforce NOT NULL + FKs afterwards.
  The same process is used for the new User.apiKey.
*/

-- Ensure pgcrypto is available so we can call gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Add nullable columns ---------------------------------------------------

ALTER TABLE "AnamnesisRecord" ADD COLUMN "userId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "userId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "userId" TEXT;
ALTER TABLE "Client" ADD COLUMN "userId" TEXT;
ALTER TABLE "FunnelEvent" ADD COLUMN "userId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "userId" TEXT;
ALTER TABLE "alunos" ADD COLUMN "userId" TEXT;
ALTER TABLE "course_leads" ADD COLUMN "userId" TEXT,
ALTER COLUMN "origem" SET DEFAULT 'formulario online';
ALTER TABLE "User" ADD COLUMN "apiKey" TEXT;

-- 2) Backfill existing rows -------------------------------------------------

WITH first_user AS (
  SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "AnamnesisRecord"
SET "userId" = (SELECT "id" FROM first_user)
WHERE "userId" IS NULL;

WITH first_user AS (
  SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "Appointment"
SET "userId" = (SELECT "id" FROM first_user)
WHERE "userId" IS NULL;

WITH first_user AS (
  SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "Campaign"
SET "userId" = (SELECT "id" FROM first_user)
WHERE "userId" IS NULL;

WITH first_user AS (
  SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "Client"
SET "userId" = (SELECT "id" FROM first_user)
WHERE "userId" IS NULL;

WITH first_user AS (
  SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "FunnelEvent"
SET "userId" = (SELECT "id" FROM first_user)
WHERE "userId" IS NULL;

WITH first_user AS (
  SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "Lead"
SET "userId" = (SELECT "id" FROM first_user)
WHERE "userId" IS NULL;

WITH first_user AS (
  SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "alunos"
SET "userId" = (SELECT "id" FROM first_user)
WHERE "userId" IS NULL;

WITH first_user AS (
  SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "course_leads"
SET "userId" = (SELECT "id" FROM first_user)
WHERE "userId" IS NULL;

UPDATE "User"
SET "apiKey" = gen_random_uuid()
WHERE "apiKey" IS NULL;

-- 3) Enforce NOT NULL + indexes/FKs ----------------------------------------

ALTER TABLE "AnamnesisRecord" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Appointment" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Campaign" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Client" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "FunnelEvent" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Lead" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "alunos" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "course_leads" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "apiKey" SET NOT NULL;

-- CreateIndex
CREATE INDEX "AnamnesisRecord_userId_idx" ON "AnamnesisRecord"("userId");

-- CreateIndex
CREATE INDEX "Appointment_userId_idx" ON "Appointment"("userId");

-- CreateIndex
CREATE INDEX "Campaign_userId_idx" ON "Campaign"("userId");

-- CreateIndex
CREATE INDEX "Client_userId_idx" ON "Client"("userId");

-- CreateIndex
CREATE INDEX "FunnelEvent_userId_idx" ON "FunnelEvent"("userId");

-- CreateIndex
CREATE INDEX "Lead_userId_idx" ON "Lead"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_apiKey_key" ON "User"("apiKey");

-- CreateIndex
CREATE INDEX "alunos_userId_idx" ON "alunos"("userId");

-- CreateIndex
CREATE INDEX "course_leads_userId_idx" ON "course_leads"("userId");

-- AddForeignKey
ALTER TABLE "alunos" ADD CONSTRAINT "alunos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_leads" ADD CONSTRAINT "course_leads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnamnesisRecord" ADD CONSTRAINT "AnamnesisRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
