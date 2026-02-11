CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'DONE', 'CANCELED');

CREATE TABLE "seller_call_notes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "seller_call_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "seller_call_notes_user_id_idx" ON "seller_call_notes"("user_id");
CREATE INDEX "seller_call_notes_seller_id_idx" ON "seller_call_notes"("seller_id");
CREATE INDEX "seller_call_notes_appointment_id_idx" ON "seller_call_notes"("appointment_id");

ALTER TABLE "seller_call_notes" ADD CONSTRAINT "seller_call_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seller_call_notes" ADD CONSTRAINT "seller_call_notes_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seller_call_notes" ADD CONSTRAINT "seller_call_notes_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "seller_reminders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "remind_at" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "seller_reminders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "seller_reminders_seller_id_remind_at_idx" ON "seller_reminders"("seller_id", "remind_at");
CREATE INDEX "seller_reminders_user_id_remind_at_idx" ON "seller_reminders"("user_id", "remind_at");

ALTER TABLE "seller_reminders" ADD CONSTRAINT "seller_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seller_reminders" ADD CONSTRAINT "seller_reminders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

