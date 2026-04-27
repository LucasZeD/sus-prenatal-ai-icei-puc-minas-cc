-- CreateEnum
CREATE TYPE "ConsultaStreamEventoTipo" AS ENUM ('TRANSCRICAO_SANITIZADA', 'IA_INSIGHT_COMPLETO');

-- CreateTable
CREATE TABLE "consulta_stream_evento" (
    "id" UUID NOT NULL,
    "consulta_id" UUID NOT NULL,
    "tipo" "ConsultaStreamEventoTipo" NOT NULL,
    "payload" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consulta_stream_evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consulta_stream_evento_consulta_id_idx" ON "consulta_stream_evento"("consulta_id");

-- AddForeignKey (consulta.id já é UUID após 20260420120000_sprint1_core_clinico)
ALTER TABLE "consulta_stream_evento" ADD CONSTRAINT "consulta_stream_evento_consulta_id_fkey" FOREIGN KEY ("consulta_id") REFERENCES "consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
