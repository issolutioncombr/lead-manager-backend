-- 1) Lead.stage: enum (valores PT-BR) -> TEXT (slugs)
ALTER TABLE "Lead"
  ALTER COLUMN "stage" TYPE TEXT
  USING (
    CASE "stage"::text
      WHEN 'Novo' THEN 'NOVO'
      WHEN 'Agendou uma call' THEN 'AGENDOU_CALL'
      WHEN 'Entrou na call' THEN 'ENTROU_CALL'
      WHEN 'Comprou' THEN 'COMPROU'
      WHEN 'Não compareceu' THEN 'NO_SHOW'
      ELSE "stage"::text
    END
  );

ALTER TABLE "Lead" ALTER COLUMN "stage" SET DEFAULT 'NOVO';

-- 2) Nova tabela de status configuráveis
CREATE TABLE "lead_statuses" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lead_statuses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lead_statuses_user_id_idx" ON "lead_statuses"("user_id");
CREATE UNIQUE INDEX "lead_statuses_user_id_slug_key" ON "lead_statuses"("user_id","slug");
ALTER TABLE "lead_statuses" ADD CONSTRAINT "lead_statuses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Integração Meta ADS + eventos + mapeamento de status
CREATE TABLE "meta_ads_integrations" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "n8n_webhook_url" TEXT,
  "access_token" TEXT,
  "pixel_id" TEXT,
  "test_event_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "meta_ads_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meta_ads_integrations_user_id_key" ON "meta_ads_integrations"("user_id");
ALTER TABLE "meta_ads_integrations" ADD CONSTRAINT "meta_ads_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "meta_ads_events" (
  "id" TEXT NOT NULL,
  "integration_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "meta_event_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "meta_ads_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meta_ads_events_integration_id_idx" ON "meta_ads_events"("integration_id");
CREATE UNIQUE INDEX "meta_ads_events_integration_id_meta_event_name_key" ON "meta_ads_events"("integration_id","meta_event_name");
ALTER TABLE "meta_ads_events" ADD CONSTRAINT "meta_ads_events_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "meta_ads_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "meta_ads_status_mappings" (
  "id" TEXT NOT NULL,
  "integration_id" TEXT NOT NULL,
  "status_slug" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "meta_ads_status_mappings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meta_ads_status_mappings_integration_id_idx" ON "meta_ads_status_mappings"("integration_id");
CREATE INDEX "meta_ads_status_mappings_event_id_idx" ON "meta_ads_status_mappings"("event_id");
CREATE UNIQUE INDEX "meta_ads_status_mappings_integration_id_status_slug_key" ON "meta_ads_status_mappings"("integration_id","status_slug");
ALTER TABLE "meta_ads_status_mappings" ADD CONSTRAINT "meta_ads_status_mappings_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "meta_ads_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meta_ads_status_mappings" ADD CONSTRAINT "meta_ads_status_mappings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "meta_ads_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) Remove o enum antigo do Prisma (caso exista no banco)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadStage') THEN
    DROP TYPE "LeadStage";
  END IF;
END $$;

