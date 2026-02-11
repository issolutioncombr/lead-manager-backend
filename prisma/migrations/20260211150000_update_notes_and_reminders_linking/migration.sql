ALTER TABLE "seller_call_notes" ADD COLUMN "lead_id" TEXT;
ALTER TABLE "seller_call_notes" ALTER COLUMN "seller_id" DROP NOT NULL;
ALTER TABLE "seller_call_notes" ALTER COLUMN "appointment_id" DROP NOT NULL;

UPDATE "seller_call_notes" n
SET "lead_id" = a."leadId"
FROM "Appointment" a
WHERE n."appointment_id" = a."id" AND n."lead_id" IS NULL;

ALTER TABLE "seller_call_notes" ALTER COLUMN "lead_id" SET NOT NULL;

CREATE INDEX "seller_call_notes_lead_id_idx" ON "seller_call_notes"("lead_id");
ALTER TABLE "seller_call_notes" ADD CONSTRAINT "seller_call_notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seller_reminders" ADD COLUMN "lead_id" TEXT;
ALTER TABLE "seller_reminders" ADD COLUMN "appointment_id" TEXT;

CREATE INDEX "seller_reminders_lead_id_idx" ON "seller_reminders"("lead_id");
CREATE INDEX "seller_reminders_appointment_id_idx" ON "seller_reminders"("appointment_id");

ALTER TABLE "seller_reminders" ADD CONSTRAINT "seller_reminders_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "seller_reminders" ADD CONSTRAINT "seller_reminders_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

