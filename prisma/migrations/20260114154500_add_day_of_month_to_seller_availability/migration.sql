-- Allow sellers to specify specific days of the month for availability slots
ALTER TABLE "seller_availability" ADD COLUMN "day_of_month" INTEGER;

CREATE INDEX IF NOT EXISTS "seller_availability_sellerId_day_of_month_idx"
  ON "seller_availability"("sellerId", "day_of_month");

