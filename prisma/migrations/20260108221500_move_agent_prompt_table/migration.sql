-- CreateTable
CREATE TABLE "agent_prompts" (
    "userId" TEXT NOT NULL,
    "prompt" TEXT,
    CONSTRAINT "agent_prompts_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "agent_prompts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Copy existing prompts
INSERT INTO "agent_prompts" ("userId", "prompt")
SELECT "id", "agentPrompt" FROM "User" WHERE "agentPrompt" IS NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "agentPrompt";
