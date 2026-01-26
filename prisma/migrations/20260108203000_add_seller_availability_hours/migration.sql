-- CreateEnum
CREATE TYPE "WeekDay" AS ENUM ('SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY');

-- AlterTable
ALTER TABLE "sellers"
ADD COLUMN "availability_start_day" "WeekDay",
ADD COLUMN "availability_end_day" "WeekDay",
ADD COLUMN "availability_start_time" TEXT,
ADD COLUMN "availability_end_time" TEXT;
