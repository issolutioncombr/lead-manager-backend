-- CreateTable
CREATE TABLE "alunos" (
    "id" TEXT NOT NULL,
    "nome_completo" TEXT NOT NULL,
    "telefone" TEXT,
    "pais" TEXT,
    "email" TEXT,
    "profissao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alunos_pkey" PRIMARY KEY ("id")
);
