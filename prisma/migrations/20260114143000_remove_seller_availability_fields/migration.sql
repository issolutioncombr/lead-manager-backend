-- Drop availability columns now handled via seller_availability table
ALTER TABLE "sellers"
  DROP COLUMN IF EXISTS "availability_start_day",
  DROP COLUMN IF EXISTS "availability_end_day",
  DROP COLUMN IF EXISTS "availability_start_time",
  DROP COLUMN IF EXISTS "availability_end_time";

