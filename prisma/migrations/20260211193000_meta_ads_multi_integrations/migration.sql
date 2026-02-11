-- Meta ADS: permitir múltiplas integrações por usuário + defaults de conteúdo
DROP INDEX IF EXISTS "meta_ads_integrations_user_id_key";

ALTER TABLE "meta_ads_integrations"
  ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'Padrao',
  ADD COLUMN IF NOT EXISTS "default_content_name" TEXT,
  ADD COLUMN IF NOT EXISTS "default_content_category" TEXT;

CREATE INDEX IF NOT EXISTS "meta_ads_integrations_user_id_idx" ON "meta_ads_integrations"("user_id");

-- WhatsappMessage: armazenar contexto HTTP quando disponível
ALTER TABLE "whatsapp_messages"
  ADD COLUMN IF NOT EXISTS "client_ip_address" TEXT,
  ADD COLUMN IF NOT EXISTS "client_user_agent" TEXT;

