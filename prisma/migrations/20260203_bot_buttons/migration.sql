-- Bot buttons table for configurable actions
CREATE TABLE IF NOT EXISTS "bot_buttons" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "variable" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE "bot_buttons"
    ADD CONSTRAINT "bot_buttons_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "bot_buttons_user_idx" ON "bot_buttons" ("userId");
CREATE INDEX IF NOT EXISTS "bot_buttons_user_variable_idx" ON "bot_buttons" ("userId","variable");
