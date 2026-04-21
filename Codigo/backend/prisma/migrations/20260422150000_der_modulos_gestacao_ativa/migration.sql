-- DER: módulos clínicos adicionais + regra de gestação ativa única.
-- Observação: este projeto usa migrações SQL "manual-first" para suportar recursos do Postgres
-- (ex.: índice parcial + triggers), que não são representáveis no Prisma schema.

-- 1) Gestação: ciclo de vida
ALTER TABLE "gestacao"
  ADD COLUMN IF NOT EXISTS "is_ativa" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "gestacao"
  ADD COLUMN IF NOT EXISTS "concluida_em" TIMESTAMP(3);

-- Só pode existir 1 gestação ativa por paciente.
-- (Índice parcial: permite múltiplas gestacões históricas com is_ativa=false.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'gestacao_paciente_id_ativa_key'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX gestacao_paciente_id_ativa_key ON "gestacao"("paciente_id") WHERE ("is_ativa" = true)';
  END IF;
END $$;

-- 2) Tabelas DER: parceiro (1:1 paciente)
CREATE TABLE IF NOT EXISTS "parceiro" (
  "paciente_id" UUID NOT NULL,
  "nome" VARCHAR(120) NOT NULL,
  "vdrl" VARCHAR(50),
  "hiv" VARCHAR(50),
  CONSTRAINT "parceiro_pkey" PRIMARY KEY ("paciente_id"),
  CONSTRAINT "parceiro_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 3) Tabelas DER: antecedentes (1:1 gestação)
CREATE TABLE IF NOT EXISTS "antecedentes" (
  "gestacao_id" UUID NOT NULL,
  "gestas_previas" INTEGER,
  "partos" INTEGER,
  "abortos" INTEGER,
  "is_hipertensao" BOOLEAN NOT NULL DEFAULT false,
  "is_diabetes" BOOLEAN NOT NULL DEFAULT false,
  "is_fumo" BOOLEAN NOT NULL DEFAULT false,
  "is_alcool" BOOLEAN NOT NULL DEFAULT false,
  "is_drogas" BOOLEAN NOT NULL DEFAULT false,
  "is_cardiopatia" BOOLEAN NOT NULL DEFAULT false,
  "is_tromboembolismo" BOOLEAN NOT NULL DEFAULT false,
  "is_infertilidade" BOOLEAN NOT NULL DEFAULT false,
  "is_isoimunizacao_rh" BOOLEAN NOT NULL DEFAULT false,
  "is_cirurgia_pelvica_uterina" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "antecedentes_pkey" PRIMARY KEY ("gestacao_id"),
  CONSTRAINT "antecedentes_gestacao_id_fkey" FOREIGN KEY ("gestacao_id") REFERENCES "gestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 4) Vacinas (N:1 paciente)
CREATE TABLE IF NOT EXISTS "vacina" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "paciente_id" UUID NOT NULL,
  "tipo" VARCHAR(120) NOT NULL,
  "data" DATE,
  "data_aprazada" DATE,
  CONSTRAINT "vacina_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vacina_paciente_id_idx" ON "vacina"("paciente_id");

ALTER TABLE "vacina"
  ADD CONSTRAINT "vacina_paciente_id_fkey"
  FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) Exames (N:1 paciente)
CREATE TABLE IF NOT EXISTS "exame" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "paciente_id" UUID NOT NULL,
  "tipo" VARCHAR(120) NOT NULL,
  "resultado_criptografado" TEXT,
  "trimestre" INTEGER,
  "valor" TEXT,
  "is_alterado" BOOLEAN NOT NULL DEFAULT false,
  "data_coleta" DATE,
  "categoria_sensibilidade" VARCHAR(120),
  CONSTRAINT "exame_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "exame_paciente_id_idx" ON "exame"("paciente_id");

ALTER TABLE "exame"
  ADD CONSTRAINT "exame_paciente_id_fkey"
  FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6) USG (N:1 gestação)
CREATE TABLE IF NOT EXISTS "exame_imagem_usg" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "gestacao_id" UUID NOT NULL,
  "peso_fetal_estimado" DOUBLE PRECISION,
  "localizacao_placenta" VARCHAR(120),
  "idade_gestacional_usg" INTEGER,
  "is_liquido_amniotico_normal" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "exame_imagem_usg_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "exame_imagem_usg_gestacao_id_idx" ON "exame_imagem_usg"("gestacao_id");

ALTER TABLE "exame_imagem_usg"
  ADD CONSTRAINT "exame_imagem_usg_gestacao_id_fkey"
  FOREIGN KEY ("gestacao_id") REFERENCES "gestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7) Avaliação odonto (1:1 gestação)
CREATE TABLE IF NOT EXISTS "avaliacao_odonto" (
  "gestacao_id" UUID NOT NULL,
  "anotacoes" TEXT,
  "is_alta" BOOLEAN NOT NULL DEFAULT false,
  "is_sangramento_gengival" BOOLEAN NOT NULL DEFAULT false,
  "is_carie_detectada" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "avaliacao_odonto_pkey" PRIMARY KEY ("gestacao_id"),
  CONSTRAINT "avaliacao_odonto_gestacao_id_fkey" FOREIGN KEY ("gestacao_id") REFERENCES "gestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 8) Plano de parto (1:1 gestação)
CREATE TABLE IF NOT EXISTS "plano_parto" (
  "gestacao_id" UUID NOT NULL,
  "acompanhante_nome" VARCHAR(120),
  "posicao_parto_pref" VARCHAR(80),
  "anestesia_alivio_dor" VARCHAR(80),
  "is_deseja_doula" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "plano_parto_pkey" PRIMARY KEY ("gestacao_id"),
  CONSTRAINT "plano_parto_gestacao_id_fkey" FOREIGN KEY ("gestacao_id") REFERENCES "gestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 9) IA (1:1 consulta) e Logs (N:1 consulta)
CREATE TABLE IF NOT EXISTS "consulta_ia" (
  "consulta_id" UUID NOT NULL,
  "transcricao_efemera_id" VARCHAR(200),
  "sugestao_conduta" TEXT,
  "risco_calculado" VARCHAR(80),
  "modelo_versao" VARCHAR(80),
  "justificativa_risco" TEXT,
  "is_sugestao_aceita" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "consulta_ia_pkey" PRIMARY KEY ("consulta_id"),
  CONSTRAINT "consulta_ia_consulta_id_fkey" FOREIGN KEY ("consulta_id") REFERENCES "consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "consulta_id" UUID NOT NULL,
  "tipo_evento" VARCHAR(80) NOT NULL,
  "valor_anterior" TEXT,
  "valor_novo" TEXT,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "logs_consulta_id_idx" ON "logs"("consulta_id");

ALTER TABLE "logs"
  ADD CONSTRAINT "logs_consulta_id_fkey"
  FOREIGN KEY ("consulta_id") REFERENCES "consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 10) Desfecho e pós-parto
CREATE TABLE IF NOT EXISTS "desfecho_gestacao" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
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

CREATE UNIQUE INDEX IF NOT EXISTS "desfecho_gestacao_gestacao_id_key" ON "desfecho_gestacao"("gestacao_id");
CREATE INDEX IF NOT EXISTS "desfecho_gestacao_unidade_id_idx" ON "desfecho_gestacao"("unidade_id");

ALTER TABLE "desfecho_gestacao"
  ADD CONSTRAINT "desfecho_gestacao_gestacao_id_fkey"
  FOREIGN KEY ("gestacao_id") REFERENCES "gestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "desfecho_gestacao"
  ADD CONSTRAINT "desfecho_gestacao_unidade_id_fkey"
  FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "consulta_pos_parto" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "gestacao_id" UUID NOT NULL,
  "data" DATE,
  "avaliacao_amamentacao" TEXT,
  "involucao_uterina" TEXT,
  "metodo_contraceptivo" TEXT,
  CONSTRAINT "consulta_pos_parto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "consulta_pos_parto_gestacao_id_idx" ON "consulta_pos_parto"("gestacao_id");

ALTER TABLE "consulta_pos_parto"
  ADD CONSTRAINT "consulta_pos_parto_gestacao_id_fkey"
  FOREIGN KEY ("gestacao_id") REFERENCES "gestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 11) Triggers: concluir gestação automaticamente
CREATE OR REPLACE FUNCTION "fn_concluir_gestacao"("p_gestacao_id" UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE "gestacao"
  SET "is_ativa" = false,
      "concluida_em" = COALESCE("concluida_em", CURRENT_TIMESTAMP)
  WHERE "id" = "p_gestacao_id";
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "trg_after_insert_desfecho_concluir_gestacao"()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM "fn_concluir_gestacao"(NEW."gestacao_id");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "after_insert_desfecho_concluir_gestacao" ON "desfecho_gestacao";
CREATE TRIGGER "after_insert_desfecho_concluir_gestacao"
AFTER INSERT ON "desfecho_gestacao"
FOR EACH ROW
EXECUTE FUNCTION "trg_after_insert_desfecho_concluir_gestacao"();

CREATE OR REPLACE FUNCTION "trg_after_insert_pos_parto_concluir_gestacao"()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM "fn_concluir_gestacao"(NEW."gestacao_id");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "after_insert_pos_parto_concluir_gestacao" ON "consulta_pos_parto";
CREATE TRIGGER "after_insert_pos_parto_concluir_gestacao"
AFTER INSERT ON "consulta_pos_parto"
FOR EACH ROW
EXECUTE FUNCTION "trg_after_insert_pos_parto_concluir_gestacao"();

