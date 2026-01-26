-- Track specific calendar dates for availability slots
ALTER TABLE "seller_availability" ADD COLUMN "specific_date" TIMESTAMP(3);

