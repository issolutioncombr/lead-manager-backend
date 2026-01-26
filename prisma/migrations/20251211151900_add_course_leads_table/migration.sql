-- CreateTable
CREATE TABLE "course_leads" (
    "id" TEXT NOT NULL,
    "nome_completo" TEXT NOT NULL,
    "telefone" TEXT,
    "pais" TEXT,
    "email" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'formulario online clinica yance',
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_leads_pkey" PRIMARY KEY ("id")
);
