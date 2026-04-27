-- Pente-fino DER: ajustes de tipos/campos e padronização de nomes.
-- Inclui: CONSULTA DateTime + idade_gestacional + is_exantema, mover is_particip_atvd_educativa p/ PACIENTE,
-- e alinhar UNIDADE/PROFISSIONAL (senha_hash, unidade_id, registro, endereco/telefone).

-- 1) PACIENTE: is_particip_atvd_educativa (DER coloca no paciente)
ALTER TABLE "paciente"
  ADD COLUMN IF NOT EXISTS "is_particip_atvd_educativa" BOOLEAN NOT NULL DEFAULT false;

-- 2) UNIDADE: endereco/telefone (mantém `nome`/`cnes` como extras úteis)
ALTER TABLE "unidade"
  ADD COLUMN IF NOT EXISTS "endereco" VARCHAR(255);

ALTER TABLE "unidade"
  ADD COLUMN IF NOT EXISTS "telefone" VARCHAR(40);

-- 3) PROFISSIONAL: unidade_id + senha_hash + registro
-- 3.1) senha_hash: renomeia coluna física para aderir ao DER
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'profissional'
      AND column_name = 'password_hash'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'profissional'
      AND column_name = 'senha_hash'
  ) THEN
    EXECUTE 'ALTER TABLE "profissional" RENAME COLUMN "password_hash" TO "senha_hash"';
  END IF;
END $$;

-- 3.2) registro + unidade_id
ALTER TABLE "profissional"
  ADD COLUMN IF NOT EXISTS "registro" VARCHAR(50);

ALTER TABLE "profissional"
  ADD COLUMN IF NOT EXISTS "unidade_id" UUID;

-- popula unidade sentinela para registros existentes
UPDATE "profissional"
SET "unidade_id" = '00000000-0000-4000-8000-000000000001'::uuid
WHERE "unidade_id" IS NULL;

ALTER TABLE "profissional"
  ALTER COLUMN "unidade_id" SET NOT NULL;

-- FK unidade
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'profissional_unidade_id_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE "profissional" ADD CONSTRAINT "profissional_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "profissional_unidade_id_idx" ON "profissional"("unidade_id");

-- 4) CONSULTA: data-hora (timestamp), idade_gestacional, is_exantema (padroniza nome) e remove campos fora do DER
-- 4.1) data: DATE -> TIMESTAMP(3) (mantém dia às 12:00 para evitar shift de fuso ao serializar)
ALTER TABLE "consulta"
  ALTER COLUMN "data" TYPE TIMESTAMP(3)
  USING (("data"::timestamp) + interval '12 hours');

-- 4.2) idade_gestacional
ALTER TABLE "consulta"
  ADD COLUMN IF NOT EXISTS "idade_gestacional" INTEGER;

-- 4.3) enxantema -> is_exantema (DER)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'consulta'
      AND column_name = 'enxantema'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'consulta'
      AND column_name = 'is_exantema'
  ) THEN
    EXECUTE 'ALTER TABLE "consulta" RENAME COLUMN "enxantema" TO "is_exantema"';
  END IF;
END $$;

ALTER TABLE "consulta"
  ALTER COLUMN "is_exantema" SET DEFAULT false;

UPDATE "consulta" SET "is_exantema" = false WHERE "is_exantema" IS NULL;

ALTER TABLE "consulta"
  ALTER COLUMN "is_exantema" SET NOT NULL;

-- 4.4) remove colunas que no DER não são de CONSULTA (foram movidas/expressas em outras tabelas)
ALTER TABLE "consulta"
  DROP COLUMN IF EXISTS "is_visita_maternidade";

ALTER TABLE "consulta"
  DROP COLUMN IF EXISTS "is_particip_atvd_educativa";

