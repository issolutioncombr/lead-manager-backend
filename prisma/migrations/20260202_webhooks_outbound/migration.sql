-- Add outboundJson and outboundUrl columns to webhooks table
-- This migration is designed for PostgreSQL
ALTER TABLE "webhooks"
  ADD COLUMN "outboundJson" JSONB,
  ADD COLUMN "outboundUrl" TEXT;
