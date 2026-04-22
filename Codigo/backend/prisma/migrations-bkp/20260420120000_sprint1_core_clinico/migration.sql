-- Sprint 1: núcleo clínico (Paciente, Gestacao, Consulta) + enums RiscoGestacional / StatusConsulta
-- Remove o MVP anterior (consulta ligada a paciente + enums antigos).

DROP TABLE IF EXISTS "consulta" CASCADE;
DROP TABLE IF EXISTS "paciente" CASCADE;
DROP TYPE IF EXISTS "RiscoCalculado";
DROP TYPE IF EXISTS "ConsultaStatus";

CREATE TYPE "RiscoGestacional" AS ENUM ('NORMAL', 'ALTO', 'MUITO_ALTO');

CREATE TYPE "StatusConsulta" AS ENUM ('RASCUNHO', 'EM_ANDAMENTO', 'AGUARDANDO_CONFIRMACAO', 'CONFIRMADA');

CREATE TABLE "paciente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome_mascarado" VARCHAR(50) NOT NULL,
    "nome_social" VARCHAR(50),
    "data_cadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_nascimento" DATE,
    "etnia" VARCHAR(50),
    "escolaridade" VARCHAR(50),
    "estado_civil" VARCHAR(50),
    "ocupacao" VARCHAR(50),
    "altura" DOUBLE PRECISION,
    "peso_pre_gestacional" DOUBLE PRECISION,

    CONSTRAINT "paciente_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gestacao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paciente_id" UUID NOT NULL,
    "dum" TEXT,
    "dpp" TEXT,
    "ig_inicial" INTEGER,
    "tipo_risco" "RiscoGestacional" NOT NULL DEFAULT 'NORMAL',
    "abo_rh" TEXT,
    "coombs" TEXT,
    "tipo_gravidez" TEXT,
    "idade_gestac_confirmada" INTEGER,
    "is_planejada" TEXT,

    CONSTRAINT "gestacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "consulta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gestacao_id" UUID NOT NULL,
    "unidade_id" UUID,
    "data" DATE NOT NULL,
    "peso" DOUBLE PRECISION,
    "pa_sistolica" DOUBLE PRECISION,
    "pa_diastolica" DOUBLE PRECISION,
    "au" DOUBLE PRECISION,
    "bfc" DOUBLE PRECISION,
    "is_edema" BOOLEAN NOT NULL DEFAULT false,
    "mov_fetal" TEXT,
    "apresentacao_fetal" TEXT,
    "queixa" TEXT,
    "enxantema" BOOLEAN NOT NULL DEFAULT false,
    "is_visita_maternidade" BOOLEAN NOT NULL DEFAULT false,
    "is_particip_atvd_educativa" BOOLEAN NOT NULL DEFAULT false,
    "validacao_medica" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusConsulta" NOT NULL DEFAULT 'RASCUNHO',

    CONSTRAINT "consulta_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gestacao_paciente_id_idx" ON "gestacao"("paciente_id");
CREATE INDEX "consulta_gestacao_id_idx" ON "consulta"("gestacao_id");
CREATE INDEX "consulta_unidade_id_idx" ON "consulta"("unidade_id");

ALTER TABLE "gestacao" ADD CONSTRAINT "gestacao_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consulta" ADD CONSTRAINT "consulta_gestacao_id_fkey" FOREIGN KEY ("gestacao_id") REFERENCES "gestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
