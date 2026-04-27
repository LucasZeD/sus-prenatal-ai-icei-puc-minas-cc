-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "VacinaTipo" AS ENUM ('ANTITETANICA', 'HEPATITE_B', 'INFLUENZA', 'VIRUS_SINCICIAL_RESPIRATORIO', 'TRIPLICE_VIRAL', 'FEBRE_AMARELA', 'OUTRAS');

-- CreateEnum
CREATE TYPE "ExameTipo" AS ENUM ('ABO_RH', 'GLICEMIA_JEJUM', 'TESTE_ORAL_TOLERANCIA_GLICOSE', 'SIFILIS', 'VDRL', 'HIV', 'HEPATITE_B', 'TOXOPLASMOSE', 'HEMOGLOBINA', 'URINA_EAS', 'URINA_CULTURA', 'COOMBS_INDIRETO', 'ELETROFORESE_HEMOGLOBINA', 'COOMBS', 'OUTROS');

-- CreateEnum
CREATE TYPE "Etnia" AS ENUM ('BRANCA', 'PRETA', 'PARDA', 'AMARELA', 'INDIGENA');

-- CreateEnum
CREATE TYPE "Escolaridade" AS ENUM ('ANALFABETO', 'FUNDAMENTAL_INCOMPLETO', 'FUNDAMENTAL_COMPLETO', 'MEDIO_INCOMPLETO', 'MEDIO_COMPLETO', 'SUPERIOR_INCOMPLETO', 'SUPERIOR_COMPLETO');

-- CreateEnum
CREATE TYPE "EstadoCivil" AS ENUM ('SOLTEIRA', 'CASADA', 'UNIAO_ESTAVEL', 'DIVORCIADA', 'VIUVA');

-- CreateEnum
CREATE TYPE "RiscoGestacional" AS ENUM ('HABITUAL', 'ALTO');

-- CreateEnum
CREATE TYPE "AboRh" AS ENUM ('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG');

-- CreateEnum
CREATE TYPE "StatusConsulta" AS ENUM ('RASCUNHO', 'EM_ANDAMENTO', 'AGUARDANDO_CONFIRMACAO', 'CONFIRMADA');

-- CreateEnum
CREATE TYPE "ConsultaStreamEventoTipo" AS ENUM ('TRANSCRICAO_SANITIZADA', 'IA_INSIGHT_COMPLETO');

-- CreateTable
CREATE TABLE "profissional" (
    "id" UUID NOT NULL,
    "unidade_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "senha_hash" VARCHAR(255) NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "registro" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profissional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paciente" (
    "id" UUID NOT NULL,
    "nome_mascarado" VARCHAR(50) NOT NULL,
    "nome_social" VARCHAR(50),
    "cpf_ultimos4" VARCHAR(4),
    "cartao_sus_ultimos4" VARCHAR(4),
    "data_cadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_nascimento" DATE,
    "idade" INTEGER,
    "etnia" "Etnia",
    "escolaridade" "Escolaridade",
    "estado_civil" "EstadoCivil",
    "ocupacao" VARCHAR(50),
    "abo_rh" "AboRh",
    "telefone" VARCHAR(40),
    "email" VARCHAR(255),
    "localizacao" VARCHAR(120),
    "altura" DOUBLE PRECISION,
    "peso_pre_gestacional" DOUBLE PRECISION,
    "is_particip_atvd_educativa" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "paciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parceiro" (
    "paciente_id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "vdrl" VARCHAR(50),
    "hiv" VARCHAR(50),

    CONSTRAINT "parceiro_pkey" PRIMARY KEY ("paciente_id")
);

-- CreateTable
CREATE TABLE "unidade" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(200) NOT NULL,
    "cnes" VARCHAR(15),
    "endereco" VARCHAR(255),
    "telefone" VARCHAR(40),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paciente_ids" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "cartao_sus_hash" VARCHAR(128) NOT NULL,
    "cpf_hash" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paciente_ids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gestacao" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "dum" DATE,
    "dpp" DATE,
    "dpp_eco" DATE,
    "ig_inicial" INTEGER,
    "tipo_risco" "RiscoGestacional" NOT NULL DEFAULT 'HABITUAL',
    "coombs" TEXT,
    "tipo_gravidez" TEXT,
    "idade_gestac_confirmada" INTEGER,
    "is_planejada" BOOLEAN NOT NULL DEFAULT false,
    "is_visita_maternidade" BOOLEAN NOT NULL DEFAULT false,
    "is_ativa" BOOLEAN NOT NULL DEFAULT true,
    "is_colocar_diu" BOOLEAN NOT NULL DEFAULT false,
    "is_did_consulta_odontologica" BOOLEAN NOT NULL DEFAULT false,
    "is_diabetes_gestacional" BOOLEAN NOT NULL DEFAULT false,
    "is_infeccao_urinaria" BOOLEAN NOT NULL DEFAULT false,
    "is_infertilidade" BOOLEAN NOT NULL DEFAULT false,
    "is_dificuldade_alimentar" BOOLEAN NOT NULL DEFAULT false,
    "is_cardiopatia" BOOLEAN NOT NULL DEFAULT false,
    "is_tromboembolismo" BOOLEAN NOT NULL DEFAULT false,
    "is_hipertensao_arterial" BOOLEAN NOT NULL DEFAULT false,
    "is_cirurgia_elvica_uterina" BOOLEAN NOT NULL DEFAULT false,
    "is_cirugia" BOOLEAN NOT NULL DEFAULT false,
    "tratamento_sifilis_dose_1" DATE,
    "tratamento_sifilis_dose_2" DATE,
    "tratamento_sifilis_dose_3" DATE,
    "suplementacao_ferro" BOOLEAN NOT NULL DEFAULT false,
    "suplementacao_acido_folico" BOOLEAN NOT NULL DEFAULT false,
    "concluida_em" TIMESTAMP(3),

    CONSTRAINT "gestacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "antecedentes" (
    "gestacao_id" UUID NOT NULL,
    "n_gestas_anteriores" INTEGER,
    "n_partos" INTEGER,
    "n_abortos" INTEGER,
    "n_nascidos_vivos" INTEGER,
    "n_vivem" INTEGER,
    "n_mortos_primeira_semana" INTEGER,
    "n_mortos_apos_primeira_semana" INTEGER,
    "n_nascidos_mortos" INTEGER,
    "n_cesarea" INTEGER,
    "n_parto_normal" INTEGER,
    "n_parto_prematuro" INTEGER,
    "n_bebe_menos_dois_kilos_e_meio" INTEGER,
    "n_bebe_mais_quatro_kilos_e_meio" INTEGER,
    "is_gesta_ectopica" BOOLEAN NOT NULL DEFAULT false,
    "is_gesta_molar" BOOLEAN NOT NULL DEFAULT false,
    "is_hipertensao_familiar" BOOLEAN NOT NULL DEFAULT false,
    "is_gravidez_gemelar_familiar" BOOLEAN NOT NULL DEFAULT false,
    "is_diabetes_familiar" BOOLEAN NOT NULL DEFAULT false,
    "is_fumo" BOOLEAN NOT NULL DEFAULT false,
    "is_alcool" BOOLEAN NOT NULL DEFAULT false,
    "is_drogas" BOOLEAN NOT NULL DEFAULT false,
    "is_cardiopatia" BOOLEAN NOT NULL DEFAULT false,
    "is_tromboembolismo" BOOLEAN NOT NULL DEFAULT false,
    "is_infertilidade" BOOLEAN NOT NULL DEFAULT false,
    "is_isoimunizacao_rh" BOOLEAN NOT NULL DEFAULT false,
    "is_cirurgia_pelvica_uterina" BOOLEAN NOT NULL DEFAULT false,
    "is_final_gestacao_anterior_1_ano" BOOLEAN NOT NULL DEFAULT false,
    "is_sifilis" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "antecedentes_pkey" PRIMARY KEY ("gestacao_id")
);

-- CreateTable
CREATE TABLE "vacina" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "tipo" "VacinaTipo" NOT NULL,
    "data" DATE,
    "data_aprazada" DATE,

    CONSTRAINT "vacina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exame" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "tipo" "ExameTipo" NOT NULL,
    "resultado_criptografado" TEXT,
    "trimestre" INTEGER,
    "valor" TEXT,
    "is_alterado" BOOLEAN NOT NULL DEFAULT false,
    "data_coleta" DATE,
    "categoria_sensibilidade" VARCHAR(120),
    "coombs" VARCHAR(50),

    CONSTRAINT "exame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exame_imagem_usg" (
    "id" UUID NOT NULL,
    "gestacao_id" UUID NOT NULL,
    "data_exame" DATE,
    "ig_dum" VARCHAR(50),
    "ig_usg" VARCHAR(50),
    "peso_fetal_estimado" DOUBLE PRECISION,
    "localizacao_placenta" VARCHAR(120),
    "idade_gestacional_usg" INTEGER,
    "is_liquido_amniotico_normal" BOOLEAN NOT NULL DEFAULT true,
    "outros" TEXT,

    CONSTRAINT "exame_imagem_usg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacao_odonto" (
    "gestacao_id" UUID NOT NULL,
    "anotacoes" TEXT,
    "is_alta" BOOLEAN NOT NULL DEFAULT false,
    "is_sangramento_gengival" BOOLEAN NOT NULL DEFAULT false,
    "is_carie_detectada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "avaliacao_odonto_pkey" PRIMARY KEY ("gestacao_id")
);

-- CreateTable
CREATE TABLE "plano_parto" (
    "gestacao_id" UUID NOT NULL,
    "acompanhante_nome" VARCHAR(120),
    "posicao_parto_pref" VARCHAR(80),
    "anestesia_alivio_dor" VARCHAR(80),
    "is_deseja_doula" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "plano_parto_pkey" PRIMARY KEY ("gestacao_id")
);

-- CreateTable
CREATE TABLE "consulta" (
    "id" UUID NOT NULL,
    "gestacao_id" UUID NOT NULL,
    "unidade_id" UUID NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "idade_gestacional" INTEGER,
    "peso" DOUBLE PRECISION,
    "pa_sistolica" DOUBLE PRECISION,
    "pa_diastolica" DOUBLE PRECISION,
    "au" DOUBLE PRECISION,
    "bfc" DOUBLE PRECISION,
    "is_edema" BOOLEAN NOT NULL DEFAULT false,
    "mov_fetal" TEXT,
    "apresentacao_fetal" TEXT,
    "queixa" TEXT,
    "conduta" TEXT,
    "is_exantema" BOOLEAN NOT NULL DEFAULT false,
    "validacao_medica" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusConsulta" NOT NULL DEFAULT 'RASCUNHO',

    CONSTRAINT "consulta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consulta_ia" (
    "consulta_id" UUID NOT NULL,
    "transcricao_efemera_id" VARCHAR(200),
    "sugestao_conduta" TEXT,
    "risco_calculado" VARCHAR(80),
    "modelo_versao" VARCHAR(80),
    "justificativa_risco" TEXT,
    "is_sugestao_aceita" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "consulta_ia_pkey" PRIMARY KEY ("consulta_id")
);

-- CreateTable
CREATE TABLE "logs" (
    "id" UUID NOT NULL,
    "consulta_id" UUID NOT NULL,
    "tipo_evento" VARCHAR(80) NOT NULL,
    "valor_anterior" TEXT,
    "valor_novo" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desfecho_gestacao" (
    "id" UUID NOT NULL,
    "gestacao_id" UUID NOT NULL,
    "unidade_id" UUID NOT NULL,
    "tipo_parto" VARCHAR(80),
    "peso_nascimento" DOUBLE PRECISION,
    "sexo" VARCHAR(20),
    "grau_laceracao" VARCHAR(80),
    "apgar_1_minuto" INTEGER,
    "apgar_5_minuto" INTEGER,
    "is_indicacao_cesarea" BOOLEAN NOT NULL DEFAULT false,
    "is_reanimacao" BOOLEAN NOT NULL DEFAULT false,
    "is_laceracao" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "desfecho_gestacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consulta_pos_parto" (
    "id" UUID NOT NULL,
    "gestacao_id" UUID NOT NULL,
    "data" DATE,
    "avaliacao_amamentacao" TEXT,
    "involucao_uterina" TEXT,
    "metodo_contraceptivo" TEXT,

    CONSTRAINT "consulta_pos_parto_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "profissional_email_key" ON "profissional"("email");

-- CreateIndex
CREATE UNIQUE INDEX "unidade_cnes_key" ON "unidade"("cnes");

-- CreateIndex
CREATE UNIQUE INDEX "paciente_ids_paciente_id_key" ON "paciente_ids"("paciente_id");

-- CreateIndex
CREATE UNIQUE INDEX "paciente_ids_cartao_sus_hash_key" ON "paciente_ids"("cartao_sus_hash");

-- CreateIndex
CREATE UNIQUE INDEX "paciente_ids_cpf_hash_key" ON "paciente_ids"("cpf_hash");

-- CreateIndex
CREATE INDEX "gestacao_paciente_id_idx" ON "gestacao"("paciente_id");

-- CreateIndex
CREATE INDEX "vacina_paciente_id_idx" ON "vacina"("paciente_id");

-- CreateIndex
CREATE INDEX "exame_paciente_id_idx" ON "exame"("paciente_id");

-- CreateIndex
CREATE INDEX "exame_imagem_usg_gestacao_id_idx" ON "exame_imagem_usg"("gestacao_id");

-- CreateIndex
CREATE INDEX "consulta_gestacao_id_idx" ON "consulta"("gestacao_id");

-- CreateIndex
CREATE INDEX "consulta_unidade_id_idx" ON "consulta"("unidade_id");

-- CreateIndex
CREATE INDEX "logs_consulta_id_idx" ON "logs"("consulta_id");

-- CreateIndex
CREATE UNIQUE INDEX "desfecho_gestacao_gestacao_id_key" ON "desfecho_gestacao"("gestacao_id");

-- CreateIndex
CREATE INDEX "desfecho_gestacao_unidade_id_idx" ON "desfecho_gestacao"("unidade_id");

-- CreateIndex
CREATE INDEX "consulta_pos_parto_gestacao_id_idx" ON "consulta_pos_parto"("gestacao_id");

-- CreateIndex
CREATE INDEX "consulta_stream_evento_consulta_id_idx" ON "consulta_stream_evento"("consulta_id");

-- AddForeignKey
ALTER TABLE "profissional" ADD CONSTRAINT "profissional_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parceiro" ADD CONSTRAINT "parceiro_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paciente_ids" ADD CONSTRAINT "paciente_ids_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gestacao" ADD CONSTRAINT "gestacao_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "antecedentes" ADD CONSTRAINT "antecedentes_gestacao_id_fkey" FOREIGN KEY ("gestacao_id") REFERENCES "gestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacina" ADD CONSTRAINT "vacina_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exame" ADD CONSTRAINT "exame_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exame_imagem_usg" ADD CONSTRAINT "exame_imagem_usg_gestacao_id_fkey" FOREIGN KEY ("gestacao_id") REFERENCES "gestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacao_odonto" ADD CONSTRAINT "avaliacao_odonto_gestacao_id_fkey" FOREIGN KEY ("gestacao_id") REFERENCES "gestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plano_parto" ADD CONSTRAINT "plano_parto_gestacao_id_fkey" FOREIGN KEY ("gestacao_id") REFERENCES "gestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta" ADD CONSTRAINT "consulta_gestacao_id_fkey" FOREIGN KEY ("gestacao_id") REFERENCES "gestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta" ADD CONSTRAINT "consulta_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta_ia" ADD CONSTRAINT "consulta_ia_consulta_id_fkey" FOREIGN KEY ("consulta_id") REFERENCES "consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_consulta_id_fkey" FOREIGN KEY ("consulta_id") REFERENCES "consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desfecho_gestacao" ADD CONSTRAINT "desfecho_gestacao_gestacao_id_fkey" FOREIGN KEY ("gestacao_id") REFERENCES "gestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desfecho_gestacao" ADD CONSTRAINT "desfecho_gestacao_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta_pos_parto" ADD CONSTRAINT "consulta_pos_parto_gestacao_id_fkey" FOREIGN KEY ("gestacao_id") REFERENCES "gestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta_stream_evento" ADD CONSTRAINT "consulta_stream_evento_consulta_id_fkey" FOREIGN KEY ("consulta_id") REFERENCES "consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unidade sentinela (RF14 seed / testes): `seed.ts` referencia este id fixo.
INSERT INTO "unidade" ("id", "nome", "cnes", "endereco", "telefone")
VALUES (
    '00000000-0000-4000-8000-000000000001'::uuid,
    'Legado — unidade não informada',
    NULL,
    NULL,
    NULL
);
