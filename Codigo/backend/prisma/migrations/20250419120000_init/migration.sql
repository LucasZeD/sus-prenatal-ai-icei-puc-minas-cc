-- CreateEnum
CREATE TYPE "RiscoCalculado" AS ENUM ('NORMAL', 'ALTO', 'MUITO_ALTO');

-- CreateEnum
CREATE TYPE "ConsultaStatus" AS ENUM ('RASCUNHO', 'EM_ANDAMENTO', 'AGUARDANDO_CONFIRMACAO', 'CONFIRMADA');

-- CreateTable
CREATE TABLE "paciente" (
    "id" TEXT NOT NULL,
    "nome_mascarado" TEXT NOT NULL,
    "ig_inicial" INTEGER NOT NULL,
    "data_cadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consulta" (
    "id" TEXT NOT NULL,
    "paciente_id" TEXT NOT NULL,
    "risco_calculado" "RiscoCalculado" NOT NULL DEFAULT 'NORMAL',
    "status" "ConsultaStatus" NOT NULL DEFAULT 'RASCUNHO',

    CONSTRAINT "consulta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consulta_paciente_id_idx" ON "consulta"("paciente_id");

-- AddForeignKey
ALTER TABLE "consulta" ADD CONSTRAINT "consulta_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
